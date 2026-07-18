import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isHex } from "viem";
import { prisma } from "@/lib/prisma";
import { publicClient } from "@/lib/chain";
import { paygateRouterAbi } from "@/lib/contract";
import { getPlatformWallet } from "@/lib/platform-wallet";
import {
  buildPaymentRequirements,
  decodeBase64Json,
  encodeBase64Json,
  getRouterAddress,
  isPaymentPayload,
  MONAD_NETWORK,
  protocolFee,
  verifyAgentHeaders,
  verifyEscrowDeposit,
  verifyMonPayment,
  type PaymentPayload,
} from "@/lib/x402";

export const runtime = "nodejs";

const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "transfer-encoding",
  "payment-signature",
  "payment-required",
  "x-agent-address",
  "x-agent-signature",
  "x-agent-timestamp",
]);

const UPSTREAM_TIMEOUT_MS = 30_000;

type RouteContext = { params: Promise<{ proxyId: string }> };

type EndpointWithDeveloper = Prisma.EndpointGetPayload<{
  include: { developer: true };
}>;

function isMetered(endpoint: EndpointWithDeveloper): boolean {
  return endpoint.billingType === "METERED" && !!endpoint.pricePerByteWei;
}

function randomRequestId(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
}

async function paymentRequired(
  endpoint: EndpointWithDeveloper,
  requestUrl: string,
  options?: { consumerAddress?: string; reason?: string }
): Promise<NextResponse> {
  const body = buildPaymentRequirements(
    endpoint,
    getRouterAddress(),
    requestUrl,
    {
      requestId: isMetered(endpoint) ? randomRequestId() : undefined,
      reason: options?.reason,
    }
  );

  await prisma.requestLog.create({
    data: {
      endpointId: endpoint.id,
      status: 402,
      consumerAddress: options?.consumerAddress ?? null,
    },
  });

  return NextResponse.json(body, {
    status: 402,
    headers: { "Payment-Required": encodeBase64Json(body) },
  });
}

/** Forwards the (already paid-for) request to the developer's target API. */
async function forwardUpstream(
  request: NextRequest,
  endpoint: EndpointWithDeveloper
): Promise<
  | { ok: true; upstream: Response; body: ArrayBuffer }
  | { ok: false; reason: "unreachable" }
> {
  const targetUrl = new URL(endpoint.targetApiUrl);
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  });

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: body && body.byteLength > 0 ? body : undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  const upstreamBody = await upstream.arrayBuffer();
  return { ok: true, upstream, body: upstreamBody };
}

/** Statuses that must not carry a body (Response constructor throws otherwise). */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function upstreamResponse(
  upstream: Response,
  body: ArrayBuffer,
  paymentResponse: Record<string, unknown>,
  settlementTx: string
): NextResponse {
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("X-Payment-Response", encodeBase64Json(paymentResponse));
  headers.set("X-PayGate-Settlement", settlementTx);
  return new NextResponse(
    NULL_BODY_STATUSES.has(upstream.status) ? null : body,
    { status: upstream.status, headers }
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Workflow 1 — Delegated Session Allowances (The Corporate Card Pattern)
 * The agent never sees a 402: it signs each request with its ephemeral key,
 * and the platform settles against the master's escrowed onchain allowance
 * via chargeAgent(). Works for FLAT and METERED endpoints.
 * ──────────────────────────────────────────────────────────────────────────── */
async function handleAgentSession(
  request: NextRequest,
  endpoint: EndpointWithDeveloper,
  requestUrl: string,
  startedAt: number
): Promise<NextResponse> {
  const headerCheck = await verifyAgentHeaders(endpoint.id, {
    address: request.headers.get("x-agent-address"),
    signature: request.headers.get("x-agent-signature"),
    timestamp: request.headers.get("x-agent-timestamp"),
  });
  if (!headerCheck.valid || !headerCheck.agentAddress) {
    return paymentRequired(endpoint, requestUrl, {
      reason: headerCheck.reason,
    });
  }

  const agentAddress = headerCheck.agentAddress.toLowerCase();
  const session = await prisma.sessionKey.findUnique({
    where: { agentAddress },
  });
  if (!session || !session.active) {
    return paymentRequired(endpoint, requestUrl, {
      consumerAddress: agentAddress,
      reason: "session_key_unknown_or_inactive",
    });
  }
  if (session.expiresAt.getTime() < Date.now()) {
    return paymentRequired(endpoint, requestUrl, {
      consumerAddress: agentAddress,
      reason: "session_key_expired",
    });
  }

  const remainingDb =
    BigInt(session.maxAllowanceWei) - BigInt(session.spentWei);

  // The onchain allowance is the source of truth for spendable funds.
  const routerAddress = getRouterAddress();
  let remainingOnchain: bigint;
  try {
    remainingOnchain = await publicClient.readContract({
      address: routerAddress,
      abi: paygateRouterAbi,
      functionName: "agentAllowances",
      args: [
        session.masterAddress as `0x${string}`,
        session.agentAddress as `0x${string}`,
      ],
    });
  } catch {
    return paymentRequired(endpoint, requestUrl, {
      consumerAddress: agentAddress,
      reason: "allowance_lookup_failed",
    });
  }

  const remaining =
    remainingDb < remainingOnchain ? remainingDb : remainingOnchain;
  const metered = isMetered(endpoint);
  const flatCost = BigInt(endpoint.priceWei);

  if (remaining <= 0n || (!metered && remaining < flatCost)) {
    return paymentRequired(endpoint, requestUrl, {
      consumerAddress: agentAddress,
      reason: "session_allowance_exhausted",
    });
  }

  const result = await forwardUpstream(request, endpoint);
  if (!result.ok) {
    await prisma.requestLog.create({
      data: {
        endpointId: endpoint.id,
        status: 502,
        consumerAddress: agentAddress,
        sessionKeyUsed: agentAddress,
        latencyMs: Date.now() - startedAt,
      },
    });
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }

  const responseBytes = result.body.byteLength;

  // 5xx upstream: the agent is not charged — SLA protection applies to
  // sessions as well.
  if (result.upstream.status >= 500) {
    await prisma.requestLog.create({
      data: {
        endpointId: endpoint.id,
        status: result.upstream.status,
        consumerAddress: agentAddress,
        sessionKeyUsed: agentAddress,
        responseBytes,
        latencyMs: Date.now() - startedAt,
      },
    });
    return NextResponse.json(
      { error: "upstream_failed", upstreamStatus: result.upstream.status },
      { status: 502 }
    );
  }

  // Cost: flat price, or byte-metered capped at the remaining allowance.
  let cost = flatCost;
  let capped = false;
  if (metered) {
    cost = BigInt(responseBytes) * BigInt(endpoint.pricePerByteWei!);
    if (cost > remaining) {
      cost = remaining;
      capped = true;
    }
  }

  // Settle from the platform relayer — no wallet popup for the agent.
  let chargeTx: `0x${string}`;
  try {
    const wallet = getPlatformWallet();
    chargeTx = await wallet.writeContract({
      address: routerAddress,
      abi: paygateRouterAbi,
      functionName: "chargeAgent",
      args: [
        session.masterAddress as `0x${string}`,
        session.agentAddress as `0x${string}`,
        endpoint.developer.walletAddress as `0x${string}`,
        cost,
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: chargeTx,
    });
    if (receipt.status !== "success") {
      throw new Error("chargeAgent reverted");
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("PAYGATE_RELAYER_PRIVATE_KEY")
    ) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "agent_settlement_failed" },
      { status: 500 }
    );
  }

  const fee = protocolFee(cost);
  await prisma.sessionKey.update({
    where: { agentAddress },
    data: {
      spentWei: (BigInt(session.spentWei) + cost).toString(),
      // A capped metered charge exhausted the session.
      ...(capped ? { active: false } : {}),
    },
  });

  await prisma.requestLog.create({
    data: {
      endpointId: endpoint.id,
      status: result.upstream.status,
      txHash: chargeTx,
      amountWei: (cost - fee).toString(),
      consumerAddress: agentAddress,
      sessionKeyUsed: agentAddress,
      responseBytes,
      latencyMs: Date.now() - startedAt,
    },
  });

  return upstreamResponse(
    result.upstream,
    result.body,
    {
      success: true,
      scheme: "agent-session",
      txHash: chargeTx,
      network: MONAD_NETWORK,
      costWei: cost.toString(),
      responseBytes,
      allowanceExhausted: capped,
    },
    chargeTx
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Workflows 2+3 — Dynamic Payload Metering (The Taxi Meter Pattern)
 *               + Deterministic SLA Escrows (The Vending Machine Pattern)
 * The consumer escrows a max deposit via depositEscrow(requestId); the
 * gateway meters the exact response bytes, settles the actual cost onchain
 * (refunding the remainder instantly), and auto-refunds 100% on upstream
 * failure.
 * ──────────────────────────────────────────────────────────────────────────── */
async function handleMeteredEscrow(
  request: NextRequest,
  endpoint: EndpointWithDeveloper,
  requestUrl: string,
  payload: PaymentPayload,
  startedAt: number
): Promise<NextResponse> {
  const requestId = payload.requestId;
  if (!requestId || !isHex(requestId) || requestId.length !== 66) {
    return paymentRequired(endpoint, requestUrl, {
      consumerAddress: payload.payer,
      reason: "missing_or_invalid_requestId",
    });
  }

  const verification = await verifyEscrowDeposit(
    requestId,
    endpoint.developer.walletAddress,
    payload.payer
  );
  if (!verification.valid || verification.amount === undefined) {
    return paymentRequired(endpoint, requestUrl, {
      consumerAddress: payload.payer,
      reason: verification.reason,
    });
  }

  const consumerAddress = verification.consumer ?? payload.payer ?? null;
  const escrowAmount = verification.amount;

  // Replay protection on the deposit tx hash (unique constraint).
  let logId: string;
  try {
    const log = await prisma.requestLog.create({
      data: {
        endpointId: endpoint.id,
        status: 0, // pending; finalized below
        txHash: payload.txHash,
        consumerAddress,
        escrowStatus: "HELD",
      },
    });
    logId = log.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "payment_replay" }, { status: 409 });
    }
    throw error;
  }

  const routerAddress = getRouterAddress();
  let wallet;
  try {
    wallet = getPlatformWallet();
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("PAYGATE_RELAYER_PRIVATE_KEY")
    ) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }

  const result = await forwardUpstream(request, endpoint);
  const upstreamFailed =
    !result.ok || (result.ok && result.upstream.status >= 500);

  if (upstreamFailed) {
    // SLA guarantee: the target API failed, so 100% of the deposit goes back
    // to the consumer automatically.
    let refundTx: `0x${string}`;
    try {
      refundTx = await wallet.writeContract({
        address: routerAddress,
        abi: paygateRouterAbi,
        functionName: "refundEscrow",
        args: [requestId],
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: refundTx,
      });
      if (receipt.status !== "success") throw new Error("refund reverted");
    } catch {
      // Funds remain safely HELD in the contract; the platform can retry.
      await prisma.requestLog.update({
        where: { id: logId },
        data: { status: 502, latencyMs: Date.now() - startedAt },
      });
      return NextResponse.json(
        { error: "upstream_failed", refund: { requestId, status: "pending" } },
        { status: 502 }
      );
    }

    await prisma.requestLog.update({
      where: { id: logId },
      data: {
        status: 502,
        escrowStatus: "REFUNDED",
        latencyMs: Date.now() - startedAt,
      },
    });

    return NextResponse.json(
      {
        error: "upstream_failed",
        upstreamStatus: result.ok ? result.upstream.status : undefined,
        refund: {
          requestId,
          txHash: refundTx,
          amountWei: escrowAmount.toString(),
        },
      },
      { status: 502, headers: { "X-PayGate-Refund": refundTx } }
    );
  }

  // Meter the exact payload size. Zero-byte responses settle at cost 0
  // (full refund, no fee).
  const responseBytes = result.body.byteLength;
  const rawCost = BigInt(responseBytes) * BigInt(endpoint.pricePerByteWei!);
  const actualCost = rawCost > escrowAmount ? escrowAmount : rawCost;

  let settleTx: `0x${string}`;
  try {
    settleTx = await wallet.writeContract({
      address: routerAddress,
      abi: paygateRouterAbi,
      functionName: "settleEscrow",
      args: [requestId, actualCost],
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: settleTx,
    });
    if (receipt.status !== "success") throw new Error("settle reverted");
  } catch {
    // Response was produced but settlement failed: keep the escrow HELD so
    // nothing is lost, and surface the failure.
    await prisma.requestLog.update({
      where: { id: logId },
      data: {
        status: 500,
        responseBytes,
        latencyMs: Date.now() - startedAt,
      },
    });
    return NextResponse.json(
      { error: "settlement_failed", requestId },
      { status: 500 }
    );
  }

  const fee = protocolFee(actualCost);
  await prisma.requestLog.update({
    where: { id: logId },
    data: {
      status: result.upstream.status,
      amountWei: (actualCost - fee).toString(),
      responseBytes,
      escrowStatus: "RELEASED",
      latencyMs: Date.now() - startedAt,
    },
  });

  return upstreamResponse(
    result.upstream,
    result.body,
    {
      success: true,
      scheme: "metered-escrow",
      requestId,
      txHash: settleTx,
      network: MONAD_NETWORK,
      responseBytes,
      actualCostWei: actualCost.toString(),
      refundedWei: (escrowAmount - actualCost).toString(),
    },
    settleTx
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Legacy Workflow — FLAT price via processPayment (v1, unchanged behavior)
 * ──────────────────────────────────────────────────────────────────────────── */
async function handleFlat(
  request: NextRequest,
  endpoint: EndpointWithDeveloper,
  requestUrl: string,
  payload: PaymentPayload,
  startedAt: number
): Promise<NextResponse> {
  const verification = await verifyMonPayment(
    payload.txHash,
    endpoint.developer.walletAddress,
    BigInt(endpoint.priceWei)
  );

  if (!verification.valid) {
    return paymentRequired(endpoint, requestUrl, {
      consumerAddress: payload.payer,
      reason: verification.reason,
    });
  }

  const consumerAddress = verification.payer ?? payload.payer ?? null;

  // Replay protection: claim the txHash before forwarding. The unique
  // constraint on RequestLog.txHash makes concurrent reuse impossible.
  let logId: string;
  try {
    const log = await prisma.requestLog.create({
      data: {
        endpointId: endpoint.id,
        status: 0, // pending; updated with the final status below
        txHash: payload.txHash,
        // Revenue = what the developer can actually withdraw (net of fee).
        amountWei: (verification.netAmount ?? verification.amount)?.toString()
          ?? endpoint.priceWei,
        consumerAddress,
      },
    });
    logId = log.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "payment_replay" }, { status: 409 });
    }
    throw error;
  }

  const result = await forwardUpstream(request, endpoint);
  if (!result.ok) {
    await prisma.requestLog.update({
      where: { id: logId },
      data: { status: 502, latencyMs: Date.now() - startedAt },
    });
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }

  await prisma.requestLog.update({
    where: { id: logId },
    data: {
      status: result.upstream.status,
      responseBytes: result.body.byteLength,
      latencyMs: Date.now() - startedAt,
    },
  });

  return upstreamResponse(
    result.upstream,
    result.body,
    { success: true, txHash: payload.txHash, network: MONAD_NETWORK },
    payload.txHash
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */

async function handler(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const startedAt = Date.now();
  const { proxyId } = await params;

  const endpoint = await prisma.endpoint.findUnique({
    where: { id: proxyId },
    include: { developer: true },
  });

  if (!endpoint) {
    return NextResponse.json({ error: "unknown_endpoint" }, { status: 404 });
  }

  if (!endpoint.active) {
    return NextResponse.json({ error: "endpoint_paused" }, { status: 503 });
  }

  const requestUrl = request.nextUrl.toString();

  // Workflow 1 takes absolute precedence: any request carrying an agent
  // session signature skips flat / metered-escrow 402 flows entirely.
  // Metered endpoints still settle via chargeAgent(byteCost) after upstream.
  if (
    request.headers.get("x-agent-signature") ||
    request.headers.get("x-agent-address")
  ) {
    return handleAgentSession(request, endpoint, requestUrl, startedAt);
  }

  const signatureHeader = request.headers.get("payment-signature");
  if (!signatureHeader) {
    return paymentRequired(endpoint, requestUrl);
  }

  const payload = decodeBase64Json<PaymentPayload>(signatureHeader);
  if (!isPaymentPayload(payload)) {
    return paymentRequired(endpoint, requestUrl, {
      reason: "malformed_payment_signature",
    });
  }

  if (isMetered(endpoint)) {
    return handleMeteredEscrow(request, endpoint, requestUrl, payload, startedAt);
  }

  return handleFlat(request, endpoint, requestUrl, payload, startedAt);
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
