"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Action = "get" | "post";

type TerminalLine = {
  tone: "out" | "ok" | "err" | "raw";
  text: string;
};

const ACTIONS: { key: Action; label: string }[] = [
  { key: "get", label: "[GET] Fetch All Endpoints" },
  { key: "post", label: "[POST] Register New Test Proxy" },
];

export function ApiKeyTester() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [action, setAction] = useState<Action>("get");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [lines, setLines] = useState<TerminalLine[]>([]);

  function reset() {
    setLines([]);
    setStatus("idle");
  }

  async function run() {
    const key = apiKey.trim();
    if (!key) {
      setStatus("err");
      setLines([
        { tone: "err", text: "<-- 401 Unauthorized · paste a pg_… key first" },
      ]);
      return;
    }

    setBusy(true);
    setStatus("idle");
    const next: TerminalLine[] = [];

    try {
      if (action === "get") {
        next.push({
          tone: "out",
          text: "--> GET /api/endpoints",
        });
        next.push({
          tone: "out",
          text: `--> Authorization: Bearer ${key.slice(0, 6)}…`,
        });

        const res = await fetch("/api/endpoints", {
          headers: { Authorization: `Bearer ${key}` },
        });
        const body = await res.json().catch(() => ({ error: "invalid_json" }));

        if (res.status === 401) {
          setStatus("err");
          next.push({
            tone: "err",
            text: "<-- 401 Unauthorized · invalid or revoked API key",
          });
        } else if (!res.ok) {
          setStatus("err");
          next.push({
            tone: "err",
            text: `<-- ${res.status} ${body?.error ?? "request_failed"}`,
          });
        } else {
          setStatus("ok");
          const count = Array.isArray(body.endpoints) ? body.endpoints.length : 0;
          next.push({
            tone: "ok",
            text: `<-- 200 OK · ${count} endpoint${count === 1 ? "" : "s"}`,
          });
        }
        next.push({ tone: "raw", text: JSON.stringify(body, null, 2) });
      } else {
        const payload = {
          name: `[DOCS] Test Proxy ${Date.now().toString(36)}`,
          targetApiUrl: "https://httpbin.org/get",
          priceMon: "0.001",
          billingType: "FLAT",
        };
        next.push({
          tone: "out",
          text: "--> POST /api/endpoints",
        });
        next.push({
          tone: "out",
          text: `--> Authorization: Bearer ${key.slice(0, 6)}…`,
        });
        next.push({
          tone: "out",
          text: `--> body ${JSON.stringify(payload)}`,
        });

        const res = await fetch("/api/endpoints", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({ error: "invalid_json" }));

        if (res.status === 401) {
          setStatus("err");
          next.push({
            tone: "err",
            text: "<-- 401 Unauthorized · invalid or revoked API key",
          });
        } else if (!res.ok) {
          setStatus("err");
          next.push({
            tone: "err",
            text: `<-- ${res.status} ${body?.error ?? "request_failed"}`,
          });
        } else {
          setStatus("ok");
          next.push({
            tone: "ok",
            text: `<-- 201 Created · proxy ${body?.endpoint?.id ?? "live"}`,
          });
        }
        next.push({ tone: "raw", text: JSON.stringify(body, null, 2) });
      }
    } catch (err) {
      setStatus("err");
      next.push({
        tone: "err",
        text: `<-- NETWORK ERROR · ${(err as Error).message}`,
      });
    } finally {
      setLines(next);
      setBusy(false);
    }
  }

  const badge =
    status === "idle"
      ? { text: "AWAITING TOKEN", cls: "border-zinc-700 text-zinc-500" }
      : status === "ok"
        ? { text: "200 AUTHORIZED", cls: "border-acid text-acid" }
        : { text: "401 UNAUTHORIZED", cls: "border-destructive text-destructive" };

  return (
    <div className="border border-[#27272a] bg-zinc-950/60">
      <div className="flex items-center justify-between border-b border-[#27272a] px-4 py-2.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
          Interactive · Developer API Key Tester
        </p>
        <span
          className={cn(
            "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
            badge.cls
          )}
        >
          {badge.text}
        </span>
      </div>

      <div className="space-y-4 px-4 py-5">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            API Key
          </label>
          <div className="flex border border-[#27272a] focus-within:border-acid">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="pg_…"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-xs outline-none placeholder:text-zinc-600"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="border-l border-[#27272a] px-3 text-zinc-500 transition-colors hover:text-acid"
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Endpoint Action
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as Action)}
            className="appearance-none border border-[#27272a] bg-[#09090b] px-3 py-2.5 font-mono text-xs outline-none focus:border-acid"
          >
            {ACTIONS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-36 border border-[#27272a] bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed">
          {lines.length === 0 ? (
            <p className="text-zinc-600">$ awaiting authentication token…</p>
          ) : (
            lines.map((line, i) =>
              line.tone === "raw" ? (
                <pre
                  key={i}
                  className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap border-l-2 border-zinc-700 pl-3 text-zinc-400"
                >
                  {line.text}
                </pre>
              ) : (
                <p
                  key={i}
                  className={cn(
                    line.tone === "ok" && "text-acid",
                    line.tone === "err" && "text-destructive",
                    line.tone === "out" && "text-zinc-300"
                  )}
                >
                  {line.text}
                </p>
              )
            )
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={run}
            className="inline-flex flex-1 items-center justify-center gap-2 border border-acid bg-acid px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3" />
            )}
            Test Programmatic Access
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 border border-zinc-700 px-3 py-2.5 font-mono text-[11px] uppercase tracking-widest text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
          >
            <RotateCcw className="size-3" /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}
