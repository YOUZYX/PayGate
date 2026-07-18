"use client";

import { useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import {
  BarChart3,
  KeyRound,
  Landmark,
  Network,
  Power,
  ScrollText,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchJson,
  truncateAddress,
  type Developer,
} from "@/components/dashboard/lib";
import { EndpointsView } from "@/components/dashboard/endpoints-view";
import { AnalyticsView } from "@/components/dashboard/analytics-view";
import { LogsView } from "@/components/dashboard/logs-view";
import { TreasuryView } from "@/components/dashboard/treasury-view";
import { ApiKeysView } from "@/components/dashboard/api-keys-view";

type ViewKey = "endpoints" | "analytics" | "logs" | "treasury" | "keys";

const NAV: { key: ViewKey; label: string; icon: typeof Network }[] = [
  { key: "endpoints", label: "Endpoints", icon: Network },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "logs", label: "Logs", icon: ScrollText },
  { key: "treasury", label: "Treasury", icon: Landmark },
  { key: "keys", label: "API Keys", icon: KeyRound },
];

export function DashboardShell() {
  const { address, isConnected, isConnecting } = useAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const [view, setView] = useState<ViewKey>("endpoints");
  // Keyed by wallet address so the derived value is null whenever the
  // connected address changes or disconnects (no reset-in-effect needed).
  const [developerState, setDeveloperState] = useState<{
    address: string;
    developer: Developer;
  } | null>(null);
  const developer =
    address && developerState?.address === address
      ? developerState.developer
      : null;

  // Wallet address is the developer identity: upsert on connect.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetchJson<{ developer: Developer }>("/api/developers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    })
      .then(({ developer }) => {
        if (!cancelled) setDeveloperState({ address, developer });
      })
      .catch((err: Error) => {
        if (!cancelled) toast.error(`Developer sync failed: ${err.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <div className="grid h-screen grid-cols-[14rem_1fr] overflow-hidden bg-background">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="flex h-full flex-col border-r border-border">
        <div className="border-b border-border px-4 py-5">
          <span className="font-mono text-lg font-bold tracking-tight">
            PAY<span className="text-acid">/</span>GATE
          </span>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            x402 gateway console
          </p>
        </div>

        <nav className="flex-1 py-2">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                "flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-xs uppercase tracking-widest transition-colors",
                view === key
                  ? "border-acid bg-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-3 border border-border px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Monad Testnet · 10143
          </div>
          {isConnected && address ? (
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-mono text-xs text-foreground"
                title={address}
              >
                {truncateAddress(address)}
              </span>
              <button
                type="button"
                onClick={() => disconnect()}
                className="inline-flex size-6 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                aria-label="Disconnect wallet"
              >
                <Power className="size-3" />
              </button>
            </div>
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Not connected
            </span>
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="h-full overflow-y-auto">
        {!isConnected || !address ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-full max-w-sm border border-border bg-card p-8">
              <Zap className="mb-4 size-6 text-acid" />
              <h1 className="font-mono text-xl font-bold">CONNECT WALLET</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Your wallet address is your developer identity. Connect to
                manage gateways, view analytics and withdraw MON earnings.
              </p>
              <button
                type="button"
                disabled={isConnecting}
                onClick={() => open()}
                className="mt-6 w-full border border-acid bg-acid px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid disabled:opacity-50"
              >
                {isConnecting ? "CONNECTING…" : "CONNECT WALLET"}
              </button>
              <p className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
                Reown AppKit · Monad Testnet 10143
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {view === "endpoints" && <EndpointsView wallet={address} />}
            {view === "analytics" && <AnalyticsView wallet={address} />}
            {view === "logs" && <LogsView wallet={address} />}
            {view === "treasury" && <TreasuryView wallet={address} />}
            {view === "keys" && (
              <ApiKeysView
                wallet={address}
                developer={developer}
                onDeveloperChange={(dev) =>
                  setDeveloperState({ address, developer: dev })
                }
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
