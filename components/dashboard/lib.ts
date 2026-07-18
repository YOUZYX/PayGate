import { formatEther } from "viem";

export type Developer = {
  id: string;
  walletAddress: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
};

export type EndpointRow = {
  id: string;
  name: string;
  targetApiUrl: string;
  priceWei: string;
  billingType: "FLAT" | "METERED";
  pricePerByteWei: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  proxyUrl: string;
  totalRequests: number;
  settledRequests: number;
  rejectedRequests: number;
  failedRequests: number;
  /** (200 + 402) / total × 100, null when no traffic yet. */
  slaPct: number | null;
  /** Mean settled-request latency in ms, null when no 200s yet. */
  avgLatencyMs: number | null;
  revenueWei: string;
};

export type AnalyticsData = {
  totals: {
    requests: number;
    rejected: number;
    settled: number;
    failed: number;
    revenueWei: string;
  };
  series: {
    date: string;
    requests: number;
    rejections: number;
    successes: number;
    revenueWei: string;
  }[];
  filters?: {
    timeRange: string;
    status: string;
  };
};

export async function fetchJson<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Format a wei string as a compact MON amount for dense tables. */
export function formatMon(wei: string, maxDecimals = 4): string {
  let value: string;
  try {
    value = formatEther(BigInt(wei));
  } catch {
    return "0";
  }
  const [whole, frac = ""] = value.split(".");
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function truncateMiddle(value: string, max = 40): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}
