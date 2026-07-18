"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copied",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(label);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-acid hover:text-acid",
        className
      )}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check className="size-3 text-acid" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}
