"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchJson, truncateAddress } from "@/components/dashboard/lib";

const EXPLORER =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.monadvision.com";

type StatusFilter = "all" | "200" | "402" | "5xx";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "200", label: "200 SUCCESS" },
  { key: "402", label: "402 REQUIRED" },
  { key: "5xx", label: "5XX SERVER ERROR" },
];

type LogRow = {
  id: string;
  createdAt: string;
  endpointId: string;
  endpointName: string;
  status: number;
  latencyMs: number | null;
  txHash: string | null;
  amountWei: string | null;
  escrowStatus: string;
  responseBytes: number;
  sessionKeyUsed: string | null;
  consumerAddress: string | null;
};

/** HH:MM:SS.mmm in the viewer's locale. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function formatDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function StatusBadge({ status }: { status: number }) {
  if (status >= 500) {
    return (
      <span className="inline-block bg-destructive px-1.5 py-0.5 font-mono text-[10px] font-bold text-background">
        {status}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block border px-1.5 py-0.5 font-mono text-[10px] font-bold",
        status === 200
          ? "border-acid/50 text-acid"
          : status === 402
            ? "border-amber-400/50 text-amber-300"
            : "border-border text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}

export function LogsView({ wallet }: { wallet: string }) {
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["logs", wallet, filter],
    queryFn: () =>
      fetchJson<{ logs: LogRow[] }>(
        `/api/logs?wallet=${wallet}&status=${filter}`
      ),
    refetchInterval: 10_000,
  });

  const logs = data?.logs ?? [];

  return (
    <div>
      <div className="mb-6 flex items-end justify-between border-b border-border pb-4">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase">Logs</h1>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            Request audit trail · newest first · auto-refresh 10s
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid hover:text-acid"
        >
          <RefreshCw className={cn("size-3", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors",
              filter === key
                ? key === "5xx"
                  ? "border-destructive bg-destructive/15 text-destructive"
                  : "border-acid bg-acid/10 text-acid"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="border border-border">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border p-3 last:border-b-0"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="ml-auto h-4 w-32" />
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center border border-border px-8 py-16 text-center">
          <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
            No matching log entries
          </p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Traffic through your gateways is recorded here in real time —
            successes, 402 challenges, and upstream failures alike.
          </p>
        </div>
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Time", "Endpoint", "Status", "Latency", "Onchain Proof"].map(
                  (h) => (
                    <TableHead
                      key={h}
                      className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground"
                    >
                      {h}
                    </TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} className="border-border hover:bg-accent/40">
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    <span className="text-foreground">
                      {formatTime(log.createdAt)}
                    </span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {formatDay(log.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-52">
                    <p className="truncate text-sm font-medium">
                      {log.endpointName}
                    </p>
                    <p
                      className="truncate font-mono text-[10px] text-muted-foreground"
                      title={log.endpointId}
                    >
                      {log.endpointId}
                      {log.sessionKeyUsed && (
                        <span className="ml-2 border border-acid/40 px-1 text-[9px] uppercase tracking-widest text-acid">
                          Agent
                        </span>
                      )}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={log.status} />
                    {log.escrowStatus !== "NONE" && (
                      <span
                        className={cn(
                          "ml-2 border px-1 py-px font-mono text-[9px] uppercase tracking-widest",
                          log.escrowStatus === "RELEASED"
                            ? "border-acid/40 text-acid"
                            : log.escrowStatus === "REFUNDED"
                              ? "border-destructive/50 text-destructive"
                              : "border-amber-400/50 text-amber-300"
                        )}
                      >
                        {log.escrowStatus}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.latencyMs != null ? (
                      <span
                        className={cn(
                          log.latencyMs < 1000
                            ? "text-foreground"
                            : "text-amber-300"
                        )}
                      >
                        {log.latencyMs.toLocaleString()}ms
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.txHash ? (
                      <a
                        href={`${EXPLORER}/tx/${log.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-acid underline-offset-2 hover:underline"
                        title={log.txHash}
                      >
                        {truncateAddress(log.txHash)}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
