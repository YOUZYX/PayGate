"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { parseEther } from "viem";
import { ArrowRight, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/dashboard/copy-button";
import { fetchJson, type EndpointRow } from "@/components/dashboard/lib";

type PingResult = {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
};

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function GatewayModal({
  wallet,
  open,
  onOpenChange,
  onCreated,
}: {
  wallet: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Body only mounts while open, so its form state starts fresh on
          every open — no reset effect required. */}
      {open && (
        <GatewayModalBody
          wallet={wallet}
          onOpenChange={onOpenChange}
          onCreated={onCreated}
        />
      )}
    </Dialog>
  );
}

function GatewayModalBody({
  wallet,
  onOpenChange,
  onCreated,
}: {
  wallet: string;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [billingType, setBillingType] = useState<"FLAT" | "METERED">("FLAT");
  const [priceMon, setPriceMon] = useState("");
  const [ping, setPing] = useState<PingResult | null>(null);
  const [created, setCreated] = useState<EndpointRow | null>(null);

  const urlValid = isValidHttpUrl(targetUrl);

  const weiPreview = useMemo(() => {
    if (!priceMon) return null;
    try {
      const wei = parseEther(priceMon);
      return wei > 0n ? wei.toString() : null;
    } catch {
      return null;
    }
  }, [priceMon]);

  const pingMutation = useMutation({
    mutationFn: () =>
      fetchJson<PingResult>("/api/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      }),
    onSuccess: setPing,
    onError: () => setPing({ ok: false, error: "Ping failed" }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ endpoint: EndpointRow }>("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          name,
          targetApiUrl: targetUrl,
          billingType,
          ...(billingType === "METERED"
            ? { pricePerByteMon: priceMon }
            : { priceMon }),
        }),
      }),
    onSuccess: ({ endpoint }) => {
      setCreated(endpoint);
      setStep(2);
      onCreated();
      toast.success("Gateway live");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const curlExample = created
    ? created.billingType === "METERED"
      ? [
          `# 1. Hit the gateway — returns 402 with a requestId + max deposit`,
          `curl -i ${created.proxyUrl}`,
          ``,
          `# 2. Escrow the deposit: depositEscrow(dev, requestId) with`,
          `#    value=maxDepositWei, then retry with the deposit tx hash:`,
          `curl -i ${created.proxyUrl} \\`,
          `  -H "Payment-Signature: $(echo -n '{\"txHash\":\"0x…\",\"requestId\":\"0x…\",\"payer\":\"0x…\"}' | base64)"`,
          ``,
          `# You are charged per byte returned; the rest refunds instantly.`,
        ].join("\n")
      : [
          `# 1. Hit the gateway — returns 402 + payment requirements`,
          `curl -i ${created.proxyUrl}`,
          ``,
          `# 2. Pay processPayment(dev) on the router with value=${created.priceWei} wei,`,
          `#    then retry with the tx hash:`,
          `curl -i ${created.proxyUrl} \\`,
          `  -H "Payment-Signature: $(echo -n '{\"txHash\":\"0x…\",\"payer\":\"0x…\"}' | base64)"`,
        ].join("\n")
    : "";

  return (
    <DialogContent className="border border-border bg-card ring-0 sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {["01", "02", "03"].map((n, i) => (
              <span key={n} className="flex items-center gap-2">
                <span
                  className={cn(
                    "border px-1.5 py-0.5",
                    step === i
                      ? "border-acid text-acid"
                      : step > i
                        ? "border-border text-foreground"
                        : "border-border"
                  )}
                >
                  {n}
                </span>
                {i < 2 && <span>—</span>}
              </span>
            ))}
          </div>
          <DialogTitle className="font-mono uppercase">
            {step === 0 && "Target API"}
            {step === 1 && "Set Price"}
            {step === 2 && "Gateway Live"}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: name + target URL ─────────────────────── */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Gateway name
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="weather-api"
                className="font-mono text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Target API URL
              </Label>
              <div className="flex gap-2">
                <Input
                  value={targetUrl}
                  onChange={(e) => {
                    setTargetUrl(e.target.value);
                    setPing(null);
                  }}
                  placeholder="https://api.example.com/data"
                  className="font-mono text-sm"
                  aria-invalid={targetUrl.length > 0 && !urlValid}
                />
                <button
                  type="button"
                  disabled={!urlValid || pingMutation.isPending}
                  onClick={() => pingMutation.mutate()}
                  className="inline-flex shrink-0 items-center gap-1.5 border border-border px-3 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid hover:text-acid disabled:opacity-40"
                >
                  {pingMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Radio className="size-3" />
                  )}
                  Test
                </button>
              </div>
              {targetUrl.length > 0 && !urlValid && (
                <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
                  Must be a valid http(s) URL
                </p>
              )}
              {ping && (
                <p
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-widest",
                    ping.ok ? "text-acid" : "text-destructive"
                  )}
                >
                  {ping.ok
                    ? `Reachable · ${ping.status} · ${ping.latencyMs}ms`
                    : (ping.error ??
                      `Unreachable · ${ping.status || "ERR"} · ${ping.latencyMs}ms`)}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={!name.trim() || !urlValid}
              onClick={() => setStep(1)}
              className="mt-2 inline-flex items-center justify-center gap-2 border border-acid bg-acid px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid disabled:pointer-events-none disabled:opacity-40"
            >
              Next <ArrowRight className="size-3.5" />
            </button>
          </div>
        )}

        {/* ── Step 2: price ─────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Billing model
              </Label>
              <div className="grid grid-cols-2">
                {(["FLAT", "METERED"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setBillingType(type);
                      setPriceMon("");
                    }}
                    className={cn(
                      "border px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors",
                      billingType === type
                        ? "border-acid bg-acid/10 text-acid"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {type === "FLAT" ? (
                      "Flat / request"
                    ) : (
                      <span className="flex flex-col items-center gap-0.5">
                        <span>Dynamic Metering</span>
                        <span className="text-[9px] font-normal normal-case italic tracking-normal text-muted-foreground">
                          (Taxi Meter Pattern)
                        </span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {billingType === "METERED"
                  ? "Price per byte (MON)"
                  : "Price per request (MON)"}
              </Label>
              <Input
                value={priceMon}
                onChange={(e) => setPriceMon(e.target.value)}
                placeholder={billingType === "METERED" ? "0.000005" : "0.05"}
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
                  = {weiPreview} WEI{billingType === "METERED" && " / BYTE"}
                </p>
              )}
            </div>
            {billingType === "METERED" && (
              <div className="border border-border bg-accent/40 px-3 py-2 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                <span className="font-bold text-acid">
                  Dynamic Payload Metering
                </span>{" "}
                <span className="normal-case italic tracking-normal">
                  (The Taxi Meter Pattern)
                </span>
                {" · "}
                Consumers escrow a max deposit · charged per byte returned ·
                unspent MON refunds instantly ·{" "}
                <span className="font-bold text-acid">
                  Deterministic SLA Escrows
                </span>{" "}
                <span className="normal-case italic tracking-normal">
                  (The Vending Machine Pattern)
                </span>{" "}
                · full refund on upstream failure
              </div>
            )}
            <div className="border border-border bg-accent/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              2% protocol fee · 98% to you
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="border border-border px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!weiPreview || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="inline-flex flex-1 items-center justify-center gap-2 border border-acid bg-acid px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid disabled:pointer-events-none disabled:opacity-40"
              >
                {createMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    Deploy Gateway <ArrowRight className="size-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: live proxy URL + curl ─────────────────── */}
        {step === 2 && created && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Proxy URL
              </Label>
              <div className="flex items-center gap-2 border border-acid bg-accent/40 p-2">
                <span className="flex-1 truncate font-mono text-xs text-acid">
                  {created.proxyUrl}
                </span>
                <CopyButton value={created.proxyUrl} label="Proxy URL copied" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  402 handshake
                </Label>
                <CopyButton value={curlExample} label="curl copied" />
              </div>
              <pre className="overflow-x-auto border border-border bg-background p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {curlExample}
              </pre>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="border border-border px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest transition-colors hover:border-acid hover:text-acid"
            >
              Done
            </button>
          </div>
        )}
    </DialogContent>
  );
}
