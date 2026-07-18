"use client";

import { useMemo, useState } from "react";
import { parseEther } from "viem";
import { Loader2, Bot } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const DURATION_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
] as const;

export type SessionConfig = {
  allowanceMon: string;
  allowanceWei: bigint;
  durationDays: number;
  expiresInHours: number;
};

export function CreateSessionModal({
  open,
  onOpenChange,
  onAuthorize,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthorize: (config: SessionConfig) => void;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <CreateSessionBody
          onOpenChange={onOpenChange}
          onAuthorize={onAuthorize}
          pending={pending}
        />
      )}
    </Dialog>
  );
}

function CreateSessionBody({
  onOpenChange,
  onAuthorize,
  pending,
}: {
  onOpenChange: (open: boolean) => void;
  onAuthorize: (config: SessionConfig) => void;
  pending?: boolean;
}) {
  const [allowanceMon, setAllowanceMon] = useState("0.05");
  const [durationDays, setDurationDays] = useState(1);

  const weiPreview = useMemo(() => {
    try {
      const wei = parseEther(allowanceMon);
      return wei > 0n ? wei : null;
    } catch {
      return null;
    }
  }, [allowanceMon]);

  const canSubmit = !!weiPreview && !pending;

  return (
    <DialogContent className="rounded-none border-2 border-zinc-800 bg-[#09090b] ring-0 sm:max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <Bot className="size-3.5 text-acid" />
          Invisible Wallet · Corporate Card
        </div>
        <DialogTitle className="font-mono text-base uppercase tracking-tight text-acid">
          Delegated Session Allowances
        </DialogTitle>
        <p className="text-xs italic text-muted-foreground">
          (The Corporate Card Pattern)
        </p>
      </DialogHeader>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Issue a pre-authorized corporate expense limit to an autonomous agent.
        An ephemeral key is generated in-browser, then your connected wallet
        escrows the allowance onchain. After that, API calls sign with the
        invisible key — zero wallet popups.
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Allowance Amount (MON)
          </Label>
          <Input
            value={allowanceMon}
            onChange={(e) => setAllowanceMon(e.target.value)}
            inputMode="decimal"
            placeholder="0.05"
            className="rounded-none border-2 border-zinc-800 bg-transparent font-mono text-sm focus-visible:border-acid"
            aria-invalid={allowanceMon.length > 0 && !weiPreview}
          />
          {allowanceMon.length > 0 && !weiPreview && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
              Enter a positive decimal MON amount
            </p>
          )}
          {weiPreview && (
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
              = {weiPreview.toString()} WEI escrowed as msg.value
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Duration (max 30 days)
          </Label>
          <div className="grid grid-cols-5 gap-1">
            {DURATION_OPTIONS.map(({ days, label }) => (
              <button
                key={days}
                type="button"
                onClick={() => setDurationDays(days)}
                className={cn(
                  "border-2 px-1 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors",
                  durationDays === days
                    ? "border-acid bg-acid/10 text-acid"
                    : "border-zinc-800 text-muted-foreground hover:border-zinc-600 hover:text-foreground"
                )}
              >
                {label.replace(" days", "d").replace(" day", "d")}
              </button>
            ))}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Gateway session expires in {durationDays * 24}h · key lives in
            sessionStorage only
          </p>
        </div>

        <div className="border-2 border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Private key never leaves this browser tab · cleared on revoke or tab
          close
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="border-2 border-zinc-700 px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!weiPreview) return;
              onAuthorize({
                allowanceMon,
                allowanceWei: weiPreview,
                durationDays,
                expiresInHours: durationDays * 24,
              });
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 border-2 border-acid bg-acid px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid disabled:pointer-events-none disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              "Authorize Agent Onchain"
            )}
          </button>
        </div>
      </div>
    </DialogContent>
  );
}
