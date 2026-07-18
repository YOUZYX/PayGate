"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/dashboard/copy-button";
import { fetchJson, type Developer } from "@/components/dashboard/lib";

export function ApiKeysView({
  wallet,
  developer,
  onDeveloperChange,
}: {
  wallet: string;
  developer: Developer | null;
  onDeveloperChange: (developer: Developer) => void;
}) {
  const [armed, setArmed] = useState(false);

  const regenerateMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ developer: Developer }>("/api/developers/regenerate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet }),
      }),
    onSuccess: ({ developer }) => {
      onDeveloperChange(developer);
      toast.success("API key regenerated", {
        description: "The previous key is now invalid.",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleRegenerate() {
    if (armed) {
      setArmed(false);
      regenerateMutation.mutate();
    } else {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
    }
  }

  return (
    <div>
      <div className="mb-6 border-b border-border pb-4">
        <h1 className="font-mono text-xl font-bold uppercase">API Keys</h1>
        <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          Programmatic access credentials
        </p>
      </div>

      <div className="max-w-2xl border border-border bg-card p-6">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Developer key
        </p>

        {developer ? (
          <div className="mt-3 flex items-center gap-2 border border-border bg-background p-3">
            <span className="flex-1 truncate font-mono text-sm text-acid">
              {developer.apiKey}
            </span>
            <CopyButton value={developer.apiKey} label="API key copied" />
          </div>
        ) : (
          <Skeleton className="mt-3 h-11 w-full" />
        )}

        <button
          type="button"
          disabled={!developer || regenerateMutation.isPending}
          onClick={handleRegenerate}
          className={cn(
            "mt-4 inline-flex items-center gap-2 border px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors disabled:pointer-events-none disabled:opacity-40",
            armed
              ? "border-destructive bg-destructive/20 text-destructive"
              : "border-border text-muted-foreground hover:border-acid hover:text-acid"
          )}
        >
          {regenerateMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {armed ? "Click again to confirm" : "Regenerate"}
        </button>

        <div className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            This key identifies your developer account for programmatic gateway
            management. It is not required by API consumers — they pay per
            request onchain via the 402 handshake. Regenerating immediately
            invalidates the previous key.
          </p>
        </div>
      </div>
    </div>
  );
}
