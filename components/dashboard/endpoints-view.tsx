"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/dashboard/copy-button";
import { GatewayModal } from "@/components/dashboard/gateway-modal";
import { EditEndpointModal } from "@/components/dashboard/edit-endpoint-modal";
import {
  fetchJson,
  formatMon,
  truncateMiddle,
  type EndpointRow,
} from "@/components/dashboard/lib";

export function EndpointsView({ wallet }: { wallet: string }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EndpointRow | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["endpoints", wallet],
    queryFn: () =>
      fetchJson<{ endpoints: EndpointRow[] }>(`/api/endpoints?wallet=${wallet}`),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["endpoints", wallet] });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      fetchJson(`/api/endpoints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, active }),
      }),
    onSuccess: (_data, vars) => {
      toast.success(vars.active ? "Gateway resumed" : "Gateway paused");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/endpoints/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet }),
      }),
    onSuccess: () => {
      toast.success("Gateway deleted");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleDelete(id: string) {
    if (armedDelete === id) {
      setArmedDelete(null);
      deleteMutation.mutate(id);
    } else {
      setArmedDelete(id);
      setTimeout(() => setArmedDelete((v) => (v === id ? null : v)), 3000);
    }
  }

  const endpoints = data?.endpoints ?? [];

  return (
    <div>
      <div className="mb-6 flex items-end justify-between border-b border-border pb-4">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase">Endpoints</h1>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            Paywalled proxy gateways · {endpoints.length} active
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 border border-acid bg-acid px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid"
        >
          <Plus className="size-3.5" />
          New Gateway
        </button>
      </div>

      {isLoading ? (
        <div className="border border-border">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border p-3 last:border-b-0"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      ) : endpoints.length === 0 ? (
        <div className="flex flex-col items-center border border-border px-8 py-16 text-center">
          <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
            No gateways yet
          </p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Put any HTTP API behind an onchain MON paywall in under a minute.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-6 border border-acid px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-acid transition-colors hover:bg-acid hover:text-primary-foreground"
          >
            Create Gateway
          </button>
        </div>
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {[
                  "Name",
                  "Target",
                  "Proxy URL",
                  "Price (MON)",
                  "Active",
                  "Reqs",
                  "SLA",
                  "Avg Lat",
                  "Revenue",
                  "",
                ].map((h, i) => (
                  <TableHead
                    key={i}
                    className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((endpoint) => (
                <TableRow
                  key={endpoint.id}
                  className="border-border hover:bg-accent/40"
                >
                  <TableCell className="max-w-40 truncate text-sm font-medium">
                    {endpoint.name}
                  </TableCell>
                  <TableCell
                    className="max-w-52 truncate font-mono text-xs text-muted-foreground"
                    title={endpoint.targetApiUrl}
                  >
                    {truncateMiddle(endpoint.targetApiUrl, 36)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="max-w-48 truncate font-mono text-xs text-foreground"
                        title={endpoint.proxyUrl}
                      >
                        {truncateMiddle(
                          endpoint.proxyUrl.replace(/^https?:\/\//, ""),
                          32
                        )}
                      </span>
                      <CopyButton
                        value={endpoint.proxyUrl}
                        label="Proxy URL copied"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-acid">
                    <div className="flex items-center gap-1.5">
                      {endpoint.billingType === "METERED" ? (
                        <span title="Metered per byte">
                          {formatMon(endpoint.pricePerByteWei ?? "0", 9)}
                          <span className="text-muted-foreground">/B</span>
                        </span>
                      ) : (
                        formatMon(endpoint.priceWei, 6)
                      )}
                      <span
                        className={cn(
                          "border px-1 py-px text-[9px] font-bold uppercase tracking-widest",
                          endpoint.billingType === "METERED"
                            ? "border-acid/50 text-acid"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        {endpoint.billingType === "METERED" ? "MTR" : "FLAT"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={endpoint.active}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({
                          id: endpoint.id,
                          active: checked,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {endpoint.totalRequests}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {endpoint.slaPct == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          "inline-block px-1.5 py-0.5 font-bold",
                          endpoint.slaPct >= 99
                            ? "bg-acid/10 text-acid"
                            : endpoint.slaPct >= 95
                              ? "bg-amber-950/50 text-amber-400"
                              : "bg-red-950/50 text-red-400"
                        )}
                        title={`${endpoint.failedRequests} upstream 5xx of ${endpoint.totalRequests} requests`}
                      >
                        {endpoint.slaPct >= 100
                          ? "100%"
                          : `${endpoint.slaPct.toFixed(1)}%`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {endpoint.avgLatencyMs == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          endpoint.avgLatencyMs < 1000
                            ? "text-foreground"
                            : "text-amber-300"
                        )}
                      >
                        {endpoint.avgLatencyMs.toLocaleString()}ms
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatMon(endpoint.revenueWei)}{" "}
                    <span className="text-muted-foreground">MON</span>
                  </TableCell>
                  <TableCell className="w-20">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing(endpoint)}
                        className="inline-flex h-6 items-center justify-center border border-border px-1.5 text-muted-foreground transition-colors hover:border-acid hover:text-acid"
                        aria-label="Edit gateway"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(endpoint.id)}
                        className={cn(
                          "inline-flex h-6 items-center justify-center gap-1 border px-1.5 text-[10px] font-bold uppercase transition-colors",
                          armedDelete === endpoint.id
                            ? "border-destructive bg-destructive/20 text-destructive"
                            : "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                        )}
                        aria-label="Delete gateway"
                      >
                        <Trash2 className="size-3" />
                        {armedDelete === endpoint.id && "Sure?"}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <GatewayModal
        wallet={wallet}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={invalidate}
      />

      <EditEndpointModal
        wallet={wallet}
        endpoint={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={invalidate}
      />
    </div>
  );
}
