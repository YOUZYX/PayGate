import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const walletAddress =
    typeof body?.walletAddress === "string" ? body.walletAddress : "";

  if (!WALLET_RE.test(walletAddress)) {
    return NextResponse.json(
      { error: "Invalid walletAddress" },
      { status: 400 }
    );
  }

  const normalized = walletAddress.toLowerCase();

  const developer = await prisma.developer.upsert({
    where: { walletAddress: normalized },
    create: {
      walletAddress: normalized,
      apiKey: `pg_${randomBytes(16).toString("hex")}`,
    },
    update: {},
  });

  return NextResponse.json({ developer });
}
