"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatEther, parseEther } from "viem";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson, type EndpointRow } from "@/components/dashboard/lib";

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function EditEndpointModal({
  wallet,
  endpoint,
  onOpenChange,
  onSaved,
}: {
  wallet: string;
  /** The endpoint being edited; null closes the dialog. */
  endpoint: EndpointRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!endpoint} onOpenChange={onOpenChange}>
      {/* Body mounts per-endpoint so field state re-seeds on every open. */}
      {endpoint && (
        <EditEndpointBody
          key={endpoint.id}
          wallet={wallet}
          endpoint={endpoint}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function EditEndpointBody({
  wallet,
  endpoint,
  onOpenChange,
  onSaved,
}: {
  wallet: string;
  endpoint: EndpointRow;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const metered = endpoint.billingType === "METERED";

  const [name, setName] = useState(endpoint.name);
  const [targetUrl, setTargetUrl] = useState(endpoint.targetApiUrl);
  const [priceMon, setPriceMon] = useState(() =>
    formatEther(
      BigInt(metered ? (endpoint.pricePerByteWei ?? "0") : endpoint.priceWei)
    )
  );

  const urlValid = isValidHttpUrl(targetUrl);

  const weiPreview = useMemo(() => {
    try {
      const wei = parseEther(priceMon);
      return wei > 0n ? wei.toString() : null;
    } catch {
      return null;
    }
  }, [priceMon]);

  const dirty =
    name.trim() !== endpoint.name ||
    targetUrl.trim() !== endpoint.targetApiUrl ||
    weiPreview !==
      (metered ? (endpoint.pricePerByteWei ?? "0") : endpoint.priceWei);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/endpoints/${endpoint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          name: name.trim(),
          targetApiUrl: targetUrl.trim(),
          ...(metered
            ? { pricePerByteMon: priceMon }
            : { priceMon }),
        }),
      }),
    onSuccess: () => {
      toast.success("Gateway updated");
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSave =
    !!name.trim() && urlValid && !!weiPreview && dirty && !saveMutation.isPending;

  return (
    <DialogContent className="border border-border bg-card ring-0 sm:max-w-lg">
      <DialogHeader>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Mutate · {endpoint.id}
        </div>
        <DialogTitle className="font-mono uppercase">Edit Gateway</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Gateway name
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-mono text-sm"
            aria-invalid={!name.trim()}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Target API URL
          </Label>
          <Input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className="font-mono text-sm"
            aria-invalid={targetUrl.length > 0 && !urlValid}
          />
          {targetUrl.length > 0 && !urlValid && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
              Must be a valid http(s) URL
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {metered ? "Price per byte (MON)" : "Price per request (MON)"}
            <span className="ml-2 border border-border px-1 py-px text-[9px] text-muted-foreground">
              {metered ? "METERED" : "FLAT"}
            </span>
          </Label>
          <Input
            value={priceMon}
            onChange={(e) => setPriceMon(e.target.value)}
            inputMode="decimal"
            className="font-mono text-sm"
            aria-invalid={priceMon.length > 0 && !weiPreview}
          />
          {priceMon.length > 0 && !weiPreview && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
              Enter a positive decimal MON amount
            </p>
          )}
          {weiPreview && (
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
              = {weiPreview} WEI{metered && " / BYTE"}
            </p>
          )}
        </div>

        <div className="border border-border bg-accent/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Edits apply instantly · in-flight escrows settle at their original
          price
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="border border-border px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => saveMutation.mutate()}
            className="inline-flex flex-1 items-center justify-center gap-2 border border-acid bg-acid px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid disabled:pointer-events-none disabled:opacity-40"
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                <Save className="size-3.5" /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </DialogContent>
  );
}
