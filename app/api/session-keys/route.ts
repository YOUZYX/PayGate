import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicClient } from "@/lib/chain";
import { paygateRouterAbi } from "@/lib/contract";
import { getRouterAddress } from "@/lib/x402";

export const runtime = "nodejs";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

async function onchainAllowance(
  master: string,
  agent: string
): Promise<bigint> {
  return publicClient.readContract({
    address: getRouterAddress(),
    abi: paygateRouterAbi,
    functionName: "agentAllowances",
    args: [master as `0x${string}`, agent as `0x${string}`],
  });
}

/**
 * Registers a session key after the master has escrowed the allowance
 * onchain via approveAgent(agent, allowance) { value: allowance }.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const masterAddress =
    typeof body?.masterAddress === "string"
      ? body.masterAddress.toLowerCase()
      : "";
  const agentAddress =
    typeof body?.agentAddress === "string"
      ? body.agentAddress.toLowerCase()
      : "";
  const maxAllowanceWei =
    typeof body?.maxAllowanceWei === "string" ? body.maxAllowanceWei : "";
  const expiresInHours =
    typeof body?.expiresInHours === "number" ? body.expiresInHours : 24;

  if (!WALLET_RE.test(masterAddress) || !WALLET_RE.test(agentAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  let allowance: bigint;
  try {
    allowance = BigInt(maxAllowanceWei);
    if (allowance <= 0n) throw new Error("non-positive");
  } catch {
    return NextResponse.json(
      { error: "maxAllowanceWei must be a positive wei string" },
      { status: 400 }
    );
  }
  if (expiresInHours <= 0 || expiresInHours > 24 * 30) {
    return NextResponse.json(
      { error: "expiresInHours must be between 0 and 720" },
      { status: 400 }
    );
  }

  // The allowance must actually be escrowed onchain before we accept it.
  let onchain: bigint;
  try {
    onchain = await onchainAllowance(masterAddress, agentAddress);
  } catch {
    return NextResponse.json(
      { error: "Failed to read onchain allowance" },
      { status: 502 }
    );
  }
  if (onchain < allowance) {
    return NextResponse.json(
      {
        error: "Onchain allowance is insufficient — call approveAgent first",
        onchainAllowanceWei: onchain.toString(),
      },
      { status: 409 }
    );
  }

  const expiresAt = new Date(Date.now() + expiresInHours * 3_600_000);

  const sessionKey = await prisma.sessionKey.upsert({
    where: { agentAddress },
    create: {
      masterAddress,
      agentAddress,
      maxAllowanceWei: allowance.toString(),
      expiresAt,
    },
    update: {
      masterAddress,
      maxAllowanceWei: allowance.toString(),
      spentWei: "0",
      expiresAt,
      active: true,
    },
  });

  return NextResponse.json({ sessionKey });
}

/** Lists a master wallet's session keys with DB + onchain remaining. */
export async function GET(req: NextRequest) {
  const master = (req.nextUrl.searchParams.get("master") ?? "").toLowerCase();
  if (!WALLET_RE.test(master)) {
    return NextResponse.json({ error: "Invalid master" }, { status: 400 });
  }

  const keys = await prisma.sessionKey.findMany({
    where: { masterAddress: master },
    orderBy: { createdAt: "desc" },
  });

  const enriched = await Promise.all(
    keys.map(async (key) => {
      let onchainWei = "0";
      try {
        onchainWei = (
          await onchainAllowance(key.masterAddress, key.agentAddress)
        ).toString();
      } catch {
        // leave "0" if the RPC read fails
      }
      const remainingDb =
        BigInt(key.maxAllowanceWei) - BigInt(key.spentWei);
      return {
        ...key,
        remainingWei: remainingDb.toString(),
        onchainAllowanceWei: onchainWei,
      };
    })
  );

  return NextResponse.json({ sessionKeys: enriched });
}

/**
 * Deactivates a session key in the gateway. Onchain funds are reclaimed by
 * the master calling revokeAgent(agent) directly.
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const masterAddress =
    typeof body?.masterAddress === "string"
      ? body.masterAddress.toLowerCase()
      : "";
  const agentAddress =
    typeof body?.agentAddress === "string"
      ? body.agentAddress.toLowerCase()
      : "";

  if (!WALLET_RE.test(masterAddress) || !WALLET_RE.test(agentAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const key = await prisma.sessionKey.findUnique({ where: { agentAddress } });
  if (!key || key.masterAddress !== masterAddress) {
    return NextResponse.json({ error: "Session key not found" }, { status: 404 });
  }

  const updated = await prisma.sessionKey.update({
    where: { agentAddress },
    data: { active: false },
  });

  return NextResponse.json({ sessionKey: updated });
}
