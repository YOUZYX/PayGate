import { isHex, parseEventLogs, verifyMessage } from "viem";
import { publicClient } from "@/lib/chain";
import { paygateRouterAbi } from "@/lib/contract";

export const MONAD_CHAIN_ID = 10143;
export const MONAD_NETWORK = `eip155:${MONAD_CHAIN_ID}` as const;
export const MONAD_RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_RPC ?? "https://testnet-rpc.monad.xyz";

export const PROTOCOL_FEE_BPS = 200n;

/**
 * Deposit cap for metered endpoints: price-per-byte × this many bytes.
 * Kept small so max deposits stay affordable on testnet (e.g. 0.02 MON at
 * 0.000001 MON/byte); responses larger than the cap settle at the cap.
 */
export const MAX_RESPONSE_BYTES = 20_000;

/** Max clock skew accepted on agent-session signatures. */
export const AGENT_SIGNATURE_MAX_AGE_S = 120;

export function protocolFee(amount: bigint): bigint {
  return (amount * PROTOCOL_FEE_BPS) / 10_000n;
}

/** x402 v2-shaped payment requirements (one entry of `accepts`). */
export interface PaymentRequirement {
  scheme: "exact-native" | "metered-escrow";
  network: typeof MONAD_NETWORK;
  asset: "MON";
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    developer: string;
    contract: string;
    function: string;
    chainId: number;
    rpcUrl: string;
    /** metered-escrow only ↓ */
    pricePerByteWei?: string;
    maxDepositWei?: string;
    requestId?: `0x${string}`;
  };
}

/** Full 402 response body, also base64-encoded into the `Payment-Required` header. */
export interface PaymentRequiredBody {
  x402Version: 2;
  error: "payment_required";
  /** Present when a submitted payment or session was rejected. */
  reason?: string;
  accepts: PaymentRequirement[];
  resource: {
    url: string;
    description: string;
  };
}

/** Decoded contents of the `Payment-Signature` request header. */
export interface PaymentPayload {
  txHash: `0x${string}`;
  payer?: string;
  /** metered-escrow flow: the requestId passed to depositEscrow. */
  requestId?: `0x${string}`;
}

export interface VerificationResult {
  valid: boolean;
  payer?: string;
  /** Gross MON paid (msg.value). */
  amount?: bigint;
  /** Amount credited to the developer after the protocol fee. */
  netAmount?: bigint;
  reason?: string;
}

export function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeBase64Json<T>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Router address read at request time — may be empty until deployment completes. */
export function getRouterAddress(): `0x${string}` {
  return (process.env.NEXT_PUBLIC_PAYGATE_ROUTER ?? "") as `0x${string}`;
}

export function isPaymentPayload(value: unknown): value is PaymentPayload {
  if (typeof value !== "object" || value === null) return false;
  const { txHash } = value as { txHash?: unknown };
  return (
    typeof txHash === "string" && isHex(txHash) && txHash.length === 66
  );
}

export function buildPaymentRequirements(
  endpoint: {
    name: string;
    priceWei: string;
    billingType?: string;
    pricePerByteWei?: string | null;
    developer: { walletAddress: string };
  },
  routerAddress: string,
  requestUrl: string,
  options?: { requestId?: `0x${string}`; reason?: string }
): PaymentRequiredBody {
  const metered =
    endpoint.billingType === "METERED" && !!endpoint.pricePerByteWei;

  const requirement: PaymentRequirement = metered
    ? {
        scheme: "metered-escrow",
        network: MONAD_NETWORK,
        asset: "MON",
        // For metered endpoints the client escrows the maximum deposit; the
        // gateway settles the exact byte-metered cost and the contract
        // refunds the unspent remainder in the same transaction.
        amount: maxDepositWei(endpoint.pricePerByteWei!).toString(),
        payTo: routerAddress,
        maxTimeoutSeconds: 300,
        extra: {
          developer: endpoint.developer.walletAddress,
          contract: routerAddress,
          function: "depositEscrow(address,bytes32)",
          chainId: MONAD_CHAIN_ID,
          rpcUrl: MONAD_RPC_URL,
          pricePerByteWei: endpoint.pricePerByteWei!,
          maxDepositWei: maxDepositWei(endpoint.pricePerByteWei!).toString(),
          requestId: options?.requestId,
        },
      }
    : {
        scheme: "exact-native",
        network: MONAD_NETWORK,
        asset: "MON",
        amount: endpoint.priceWei,
        payTo: routerAddress,
        maxTimeoutSeconds: 300,
        extra: {
          developer: endpoint.developer.walletAddress,
          contract: routerAddress,
          function: "processPayment(address)",
          chainId: MONAD_CHAIN_ID,
          rpcUrl: MONAD_RPC_URL,
        },
      };

  return {
    x402Version: 2,
    error: "payment_required",
    ...(options?.reason ? { reason: options.reason } : {}),
    accepts: [requirement],
    resource: {
      url: requestUrl,
      description: endpoint.name,
    },
  };
}

export function maxDepositWei(pricePerByteWei: string): bigint {
  return BigInt(pricePerByteWei) * BigInt(MAX_RESPONSE_BYTES);
}

/**
 * Verifies a MON payment onchain: the tx must be a successful call to the
 * PayGateRouter that emitted a PaymentProcessed event crediting
 * `expectedDeveloper` with at least `minAmountWei`.
 */
export async function verifyMonPayment(
  txHash: `0x${string}`,
  expectedDeveloper: string,
  minAmountWei: bigint
): Promise<VerificationResult> {
  const routerAddress = getRouterAddress();
  if (!routerAddress) {
    return { valid: false, reason: "router_not_configured" };
  }

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  } catch {
    return { valid: false, reason: "transaction_not_found" };
  }

  if (receipt.status !== "success") {
    return { valid: false, reason: "transaction_reverted" };
  }

  if (receipt.to?.toLowerCase() !== routerAddress.toLowerCase()) {
    return { valid: false, reason: "wrong_recipient_contract" };
  }

  const events = parseEventLogs({
    abi: paygateRouterAbi,
    eventName: "PaymentProcessed",
    logs: receipt.logs,
  });

  const match = events.find(
    (event) =>
      event.address.toLowerCase() === routerAddress.toLowerCase() &&
      event.args.developer.toLowerCase() === expectedDeveloper.toLowerCase() &&
      event.args.amount >= minAmountWei
  );

  if (!match) {
    return { valid: false, reason: "payment_event_not_found_or_insufficient" };
  }

  return {
    valid: true,
    payer: match.args.consumer,
    amount: match.args.amount,
    netAmount: match.args.amount - match.args.fee,
  };
}

export interface EscrowVerificationResult {
  valid: boolean;
  consumer?: string;
  /** Gross MON locked in the escrow record. */
  amount?: bigint;
  reason?: string;
}

/**
 * Verifies a metered-escrow deposit: `escrows(requestId)` on the router must
 * be active, held for the endpoint's developer, and funded (> 0).
 */
export async function verifyEscrowDeposit(
  requestId: `0x${string}`,
  expectedDeveloper: string,
  claimedPayer?: string
): Promise<EscrowVerificationResult> {
  const routerAddress = getRouterAddress();
  if (!routerAddress) {
    return { valid: false, reason: "router_not_configured" };
  }

  let record: readonly [`0x${string}`, `0x${string}`, bigint, boolean];
  try {
    record = await publicClient.readContract({
      address: routerAddress,
      abi: paygateRouterAbi,
      functionName: "escrows",
      args: [requestId],
    });
  } catch {
    return { valid: false, reason: "escrow_lookup_failed" };
  }

  const [developer, consumer, amount, active] = record;

  if (!active) {
    return { valid: false, reason: "escrow_not_active" };
  }
  if (developer.toLowerCase() !== expectedDeveloper.toLowerCase()) {
    return { valid: false, reason: "escrow_wrong_developer" };
  }
  if (amount <= 0n) {
    return { valid: false, reason: "escrow_not_funded" };
  }
  if (claimedPayer && consumer.toLowerCase() !== claimedPayer.toLowerCase()) {
    return { valid: false, reason: "escrow_consumer_mismatch" };
  }

  return { valid: true, consumer, amount };
}

/** Message a Delegated Session Allowance agent key signs (EIP-191 personal_sign). */
export function agentSessionMessage(
  proxyId: string,
  timestamp: string
): string {
  return `paygate:agent:${proxyId}:${timestamp}`;
}

export interface AgentHeaderResult {
  valid: boolean;
  agentAddress?: `0x${string}`;
  reason?: string;
}

/**
 * Verifies the X-Agent-* headers: an EIP-191 signature by the agent key over
 * `paygate:agent:<proxyId>:<timestamp>` with bounded clock skew.
 */
export async function verifyAgentHeaders(
  proxyId: string,
  headers: {
    address: string | null;
    signature: string | null;
    timestamp: string | null;
  }
): Promise<AgentHeaderResult> {
  const { address, signature, timestamp } = headers;
  if (!address || !signature || !timestamp) {
    return { valid: false, reason: "agent_headers_incomplete" };
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || !isHex(signature)) {
    return { valid: false, reason: "agent_headers_malformed" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: "agent_timestamp_invalid" };
  }
  const nowS = Math.floor(Date.now() / 1000);
  if (Math.abs(nowS - ts) > AGENT_SIGNATURE_MAX_AGE_S) {
    return { valid: false, reason: "agent_signature_expired" };
  }

  let verified = false;
  try {
    verified = await verifyMessage({
      address: address as `0x${string}`,
      message: agentSessionMessage(proxyId, timestamp),
      signature: signature as `0x${string}`,
    });
  } catch {
    verified = false;
  }
  if (!verified) {
    return { valid: false, reason: "agent_signature_invalid" };
  }

  return { valid: true, agentAddress: address as `0x${string}` };
}
