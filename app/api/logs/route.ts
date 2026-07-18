import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_LOGS = 200;

/**
 * Audit log feed: the developer's RequestLog entries (newest first),
 * optionally narrowed to a status class (200 | 402 | 5xx).
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  const statusFilter = req.nextUrl.searchParams.get("status") ?? "all";

  if (!WALLET_RE.test(wallet)) {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }

  const developer = await prisma.developer.findUnique({
    where: { walletAddress: wallet.toLowerCase() },
  });
  if (!developer) {
    return NextResponse.json({ logs: [] });
  }

  const statusWhere =
    statusFilter === "200"
      ? { status: 200 }
      : statusFilter === "402"
        ? { status: 402 }
        : statusFilter === "5xx"
          ? { status: { gte: 500 } }
          : {};

  const logs = await prisma.requestLog.findMany({
    where: {
      endpoint: { developerId: developer.id },
      ...statusWhere,
    },
    include: {
      endpoint: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_LOGS,
  });

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      endpointId: log.endpoint.id,
      endpointName: log.endpoint.name,
      status: log.status,
      latencyMs: log.latencyMs,
      txHash: log.txHash,
      amountWei: log.amountWei,
      escrowStatus: log.escrowStatus,
      responseBytes: log.responseBytes,
      sessionKeyUsed: log.sessionKeyUsed,
      consumerAddress: log.consumerAddress,
    })),
  });
}
