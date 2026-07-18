"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  fetchJson,
  formatMon,
  type AnalyticsData,
} from "@/components/dashboard/lib";

const ACID = "#b4ff11";
const GRID = "#262626";
const FG = "#ededed";
const MUTED = "#8f8f8f";
const DIM = "#3d3d3d";

type TimeRange = "today" | "7d" | "30d" | "all";
type StatusFilter = "all" | "200" | "402";

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: "today", label: "TODAY" },
  { key: "7d", label: "7 DAYS" },
  { key: "30d", label: "30 DAYS" },
  { key: "all", label: "ALL TIME" },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "200", label: "200 SETTLED" },
  { key: "402", label: "402 REJECTED" },
];

const RANGE_LABEL: Record<TimeRange, string> = {
  today: "TODAY",
  "7d": "7D",
  "30d": "30D",
  all: "ALL TIME",
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as {
    requests: number;
    rejections: number;
    successes: number;
    revenueWei: string;
  };
  return (
    <div className="border border-border bg-background p-2 font-mono text-[10px] uppercase tracking-widest">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 text-foreground">REQS {row.requests}</p>
      <p className="text-[#8f8f8f]">402 {row.rejections}</p>
      <p className="text-acid">200 {row.successes}</p>
      <p className="text-foreground">{formatMon(row.revenueWei)} MON</p>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors",
        active
          ? "border-acid bg-acid/10 text-acid"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function AnalyticsView({ wallet }: { wallet: string }) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [status, setStatus] = useState<StatusFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", wallet, timeRange, status],
    queryFn: () =>
      fetchJson<AnalyticsData>(
        `/api/analytics?wallet=${wallet}&timeRange=${timeRange}&status=${status}`
      ),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <div className="mb-6 border-b border-border pb-4">
        <h1 className="font-mono text-xl font-bold uppercase">Analytics</h1>
        <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          Organic request-log aggregation · no synthetic fill
        </p>
      </div>

      {/* Brutalist filter control bar */}
      <div className="mb-6 flex flex-col gap-3 border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Range
          </span>
          {TIME_RANGES.map(({ key, label }) => (
            <FilterPill
              key={key}
              active={timeRange === key}
              onClick={() => setTimeRange(key)}
            >
              {label}
            </FilterPill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Status
          </span>
          {STATUS_FILTERS.map(({ key, label }) => (
            <FilterPill
              key={key}
              active={status === key}
              onClick={() => setStatus(key)}
            >
              {label}
            </FilterPill>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border border-border p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-8 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-6 h-72 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total Requests"
              value={String(data.totals.requests)}
            />
            <StatCard label="402 Rejected" value={String(data.totals.rejected)} />
            <StatCard label="200 Settled" value={String(data.totals.settled)} />
            <StatCard
              label="MON Revenue"
              value={formatMon(data.totals.revenueWei)}
            />
          </div>

          <div className="mt-6 border border-border bg-card p-4">
            <p className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground">
              Requests / settlements · {RANGE_LABEL[timeRange]}
              {status !== "all" && ` · ${status}`}
            </p>

            {data.totals.requests === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center border border-dashed border-border text-center">
                <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
                  No traffic in this window
                </p>
                <p className="mt-2 max-w-sm text-xs text-muted-foreground">
                  Charts only render organic RequestLog rows — expand the
                  range or clear the status filter to see more.
                </p>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.series}
                    margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
                  >
                    <CartesianGrid
                      stroke={GRID}
                      strokeWidth={1}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(5)}
                      tick={{
                        fill: MUTED,
                        fontSize: 10,
                        fontFamily: "var(--font-geist-mono)",
                      }}
                      axisLine={{ stroke: GRID }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{
                        fill: MUTED,
                        fontSize: 10,
                        fontFamily: "var(--font-geist-mono)",
                      }}
                      axisLine={{ stroke: GRID }}
                      tickLine={false}
                    />
                    <Tooltip
                      content={ChartTooltip}
                      cursor={{ fill: "#161616" }}
                    />
                    {(status === "all" || status === "402") && (
                      <Bar
                        dataKey="rejections"
                        stackId="reqs"
                        fill={DIM}
                        isAnimationActive={false}
                      />
                    )}
                    {(status === "all" || status === "200") && (
                      <Bar
                        dataKey="successes"
                        stackId="reqs"
                        fill={ACID}
                        isAnimationActive={false}
                      />
                    )}
                    <Line
                      dataKey="requests"
                      type="linear"
                      stroke={FG}
                      strokeWidth={1}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="mt-3 flex gap-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {(status === "all" || status === "200") && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 bg-[#b4ff11]" /> 200
                  settled
                </span>
              )}
              {(status === "all" || status === "402") && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 bg-[#3d3d3d]" /> 402
                  rejected
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-px w-4 bg-foreground" /> total
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
