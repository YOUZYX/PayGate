import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";
import { prisma } from "@/lib/prisma";
import { resolveDeveloper } from "@/lib/developer-auth";

export const runtime = "nodejs";

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function authErrorResponse(error: "unauthorized" | "invalid_wallet" | "not_found") {
  if (error === "unauthorized") {
    return NextResponse.json(
      { error: "Unauthorized — invalid or missing API key" },
      { status: 401 }
    );
  }
  if (error === "not_found") {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }
  return NextResponse.json(
    { error: "Provide Authorization: Bearer pg_… or a valid wallet query" },
    { status: 400 }
  );
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  const auth = await resolveDeveloper(req, wallet);

  if (!auth.ok) {
    // Dashboard with unknown wallet still gets an empty list (not 404).
    if (
      (auth.error === "not_found" || auth.error === "invalid_wallet") &&
      !req.headers.get("authorization")
    ) {
      return NextResponse.json({ endpoints: [] });
    }
    return authErrorResponse(auth.error);
  }

  const { developer } = auth;

  const endpoints = await prisma.endpoint.findMany({
    where: { developerId: developer.id },
    orderBy: { createdAt: "desc" },
  });

  const endpointIds = endpoints.map((e) => e.id);

  const statusCounts = endpointIds.length
    ? await prisma.requestLog.groupBy({
        by: ["endpointId", "status"],
        where: { endpointId: { in: endpointIds } },
        _count: { _all: true },
      })
    : [];

  const settledLogs = endpointIds.length
    ? await prisma.requestLog.findMany({
        where: {
          endpointId: { in: endpointIds },
          status: 200,
          amountWei: { not: null },
        },
        select: { endpointId: true, amountWei: true },
      })
    : [];

  const latencyAverages = endpointIds.length
    ? await prisma.requestLog.groupBy({
        by: ["endpointId"],
        where: {
          endpointId: { in: endpointIds },
          status: 200,
          latencyMs: { not: null },
        },
        _avg: { latencyMs: true },
      })
    : [];

  const avgLatencyByEndpoint = new Map<string, number>();
  for (const row of latencyAverages) {
    if (row._avg.latencyMs != null) {
      avgLatencyByEndpoint.set(row.endpointId, Math.round(row._avg.latencyMs));
    }
  }

  const revenueByEndpoint = new Map<string, bigint>();
  for (const log of settledLogs) {
    const prev = revenueByEndpoint.get(log.endpointId) ?? 0n;
    revenueByEndpoint.set(log.endpointId, prev + BigInt(log.amountWei ?? "0"));
  }

  const countsByEndpoint = new Map<
    string,
    { total: number; ok: number; rejected: number; failed: number }
  >();
  for (const row of statusCounts) {
    const entry = countsByEndpoint.get(row.endpointId) ?? {
      total: 0,
      ok: 0,
      rejected: 0,
      failed: 0,
    };
    entry.total += row._count._all;
    if (row.status === 200) entry.ok += row._count._all;
    if (row.status === 402) entry.rejected += row._count._all;
    if (row.status >= 500) entry.failed += row._count._all;
    countsByEndpoint.set(row.endpointId, entry);
  }

  const origin = req.nextUrl.origin;

  return NextResponse.json({
    endpoints: endpoints.map((e) => {
      const counts = countsByEndpoint.get(e.id) ?? {
        total: 0,
        ok: 0,
        rejected: 0,
        failed: 0,
      };
      const slaPct =
        counts.total > 0
          ? ((counts.ok + counts.rejected) / counts.total) * 100
          : null;
      return {
        ...e,
        proxyUrl: `${origin}/api/v1/gate/${e.id}`,
        totalRequests: counts.total,
        settledRequests: counts.ok,
        rejectedRequests: counts.rejected,
        failedRequests: counts.failed,
        slaPct,
        avgLatencyMs: avgLatencyByEndpoint.get(e.id) ?? null,
        revenueWei: (revenueByEndpoint.get(e.id) ?? 0n).toString(),
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const walletAddress =
    typeof body?.walletAddress === "string" ? body.walletAddress : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const targetApiUrl =
    typeof body?.targetApiUrl === "string" ? body.targetApiUrl.trim() : "";
  const priceMon = typeof body?.priceMon === "string" ? body.priceMon : "";
  const billingType =
    body?.billingType === "METERED" ? "METERED" : "FLAT";
  const pricePerByteMon =
    typeof body?.pricePerByteMon === "string" ? body.pricePerByteMon : "";

  const auth = await resolveDeveloper(req, walletAddress);
  if (!auth.ok) {
    return authErrorResponse(auth.error);
  }
  const { developer } = auth;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!isValidHttpUrl(targetApiUrl)) {
    return NextResponse.json(
      { error: "targetApiUrl must be a valid http(s) URL" },
      { status: 400 }
    );
  }

  let priceWei = 0n;
  let pricePerByteWei: bigint | null = null;

  if (billingType === "METERED") {
    try {
      pricePerByteWei = parseEther(pricePerByteMon);
      if (pricePerByteWei <= 0n) throw new Error("non-positive");
    } catch {
      return NextResponse.json(
        { error: "pricePerByteMon must be a positive decimal MON amount" },
        { status: 400 }
      );
    }
  } else {
    try {
      priceWei = parseEther(priceMon);
      if (priceWei <= 0n) throw new Error("non-positive");
    } catch {
      return NextResponse.json(
        { error: "priceMon must be a positive decimal MON amount" },
        { status: 400 }
      );
    }
  }

  const endpoint = await prisma.endpoint.create({
    data: {
      name,
      targetApiUrl,
      priceWei: priceWei.toString(),
      billingType,
      pricePerByteWei: pricePerByteWei?.toString() ?? null,
      developerId: developer.id,
    },
  });

  return NextResponse.json(
    {
      endpoint: {
        ...endpoint,
        proxyUrl: `${req.nextUrl.origin}/api/v1/gate/${endpoint.id}`,
      },
    },
    { status: 201 }
  );
}
