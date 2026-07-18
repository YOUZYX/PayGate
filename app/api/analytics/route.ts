import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

type TimeRange = "today" | "7d" | "30d" | "all";
type StatusFilter = "all" | "200" | "402";

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Inclusive UTC start of the window for a given timeRange. Null = all time. */
function rangeStart(timeRange: TimeRange): Date | null {
  const now = new Date();
  if (timeRange === "all") return null;
  if (timeRange === "today") {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  const days = timeRange === "7d" ? 7 : 30;
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Number of day buckets to materialize for the chart series. */
function seriesDayCount(timeRange: TimeRange, earliestLog: Date | null): number {
  if (timeRange === "today") return 1;
  if (timeRange === "7d") return 7;
  if (timeRange === "30d") return 30;
  // all-time: span from first log (or today) to today, capped at 90 days
  // so the chart stays readable with organic sparse data.
  if (!earliestLog) return 14;
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const start = new Date(earliestLog);
  start.setUTCHours(0, 0, 0, 0);
  const diffMs = now.getTime() - start.getTime();
  const days = Math.floor(diffMs / 86_400_000) + 1;
  return Math.min(Math.max(days, 1), 90);
}

function emptySeries(days: number) {
  const series: {
    date: string;
    requests: number;
    rejections: number;
    successes: number;
    revenueWei: string;
  }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    series.push({
      date: dayKey(d),
      requests: 0,
      rejections: 0,
      successes: 0,
      revenueWei: "0",
    });
  }
  return series;
}

function parseTimeRange(raw: string | null): TimeRange {
  if (raw === "today" || raw === "7d" || raw === "30d" || raw === "all") {
    return raw;
  }
  return "7d";
}

function parseStatus(raw: string | null): StatusFilter {
  if (raw === "200" || raw === "402" || raw === "all") return raw;
  return "all";
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  if (!WALLET_RE.test(wallet)) {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }

  const timeRange = parseTimeRange(req.nextUrl.searchParams.get("timeRange"));
  const statusFilter = parseStatus(req.nextUrl.searchParams.get("status"));

  const developer = await prisma.developer.findUnique({
    where: { walletAddress: wallet.toLowerCase() },
  });

  if (!developer) {
    const days = seriesDayCount(timeRange, null);
    return NextResponse.json({
      totals: {
        requests: 0,
        rejected: 0,
        settled: 0,
        failed: 0,
        revenueWei: "0",
      },
      series: emptySeries(days),
      filters: { timeRange, status: statusFilter },
    });
  }

  const since = rangeStart(timeRange);

  const ownerFilter = {
    endpoint: { developerId: developer.id },
    ...(since ? { createdAt: { gte: since } } : {}),
  };

  // Status filter narrows which rows contribute to totals + series.
  const statusWhere =
    statusFilter === "200"
      ? { status: 200 }
      : statusFilter === "402"
        ? { status: 402 }
        : {};

  const where = { ...ownerFilter, ...statusWhere };

  // Totals by status within the selected window (and optional status filter).
  const statusCounts = await prisma.requestLog.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  let requests = 0;
  let rejected = 0;
  let settled = 0;
  let failed = 0;
  for (const row of statusCounts) {
    requests += row._count._all;
    if (row.status === 402) rejected += row._count._all;
    else if (row.status === 200) settled += row._count._all;
    else if (row.status >= 500) failed += row._count._all;
  }

  // Revenue only from settled 200s that still fall inside the filters.
  // When status=402, revenue is necessarily zero.
  let revenueWei = 0n;
  if (statusFilter !== "402") {
    const settledLogs = await prisma.requestLog.findMany({
      where: {
        ...ownerFilter,
        status: 200,
        amountWei: { not: null },
      },
      select: { amountWei: true },
    });
    for (const log of settledLogs) {
      revenueWei += BigInt(log.amountWei ?? "0");
    }
  }

  // Earliest log in-scope for all-time series length.
  let earliest: Date | null = null;
  if (timeRange === "all") {
    const first = await prisma.requestLog.findFirst({
      where: ownerFilter,
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    earliest = first?.createdAt ?? null;
  }

  const days = seriesDayCount(timeRange, earliest);
  const series = emptySeries(days);
  const seriesSince = new Date();
  seriesSince.setUTCDate(seriesSince.getUTCDate() - (days - 1));
  seriesSince.setUTCHours(0, 0, 0, 0);

  const recentLogs = await prisma.requestLog.findMany({
    where: {
      ...where,
      createdAt: { gte: seriesSince },
    },
    select: { status: true, amountWei: true, createdAt: true },
  });

  const byDate = new Map(series.map((s) => [s.date, s]));
  const revenueByDate = new Map<string, bigint>();

  for (const log of recentLogs) {
    const key = dayKey(log.createdAt);
    const bucket = byDate.get(key);
    if (!bucket) continue;
    bucket.requests += 1;
    if (log.status === 402) bucket.rejections += 1;
    if (log.status === 200) {
      bucket.successes += 1;
      const prev = revenueByDate.get(key) ?? 0n;
      revenueByDate.set(key, prev + BigInt(log.amountWei ?? "0"));
    }
  }
  for (const bucket of series) {
    bucket.revenueWei = (revenueByDate.get(bucket.date) ?? 0n).toString();
  }

  return NextResponse.json({
    totals: {
      requests,
      rejected,
      settled,
      failed,
      revenueWei: revenueWei.toString(),
    },
    series,
    filters: { timeRange, status: statusFilter },
  });
}
