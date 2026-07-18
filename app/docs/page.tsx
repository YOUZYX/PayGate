"use client";

/**
 * PayGate protocol documentation — brutalist three-pane layout:
 * sticky sidebar nav (scroll-spy), markdown-style body, "on this page"
 * outline. All snippets document the real deployed protocol surface.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Play, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiKeyTester } from "@/components/docs/api-key-tester";

const ROUTER = "0x8197f76762F5b2cfeCbdfc1B90FBBAC3FC29b17C";
const EXPLORER =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.monadvision.com";

/* ────────────────────────────────────────────────────────────────────────────
 * Navigation model
 * ──────────────────────────────────────────────────────────────────────────── */

type NavGroup = { group: string; items: { id: string; label: string }[] };

const NAV: NavGroup[] = [
  {
    group: "Getting Started",
    items: [
      { id: "introduction", label: "Introduction" },
      { id: "quick-start", label: "Quick Start (60s)" },
    ],
  },
  {
    group: "API Providers",
    items: [
      { id: "creating-a-proxy", label: "Creating a Proxy" },
      { id: "pricing-models", label: "Setting Pricing Models" },
      { id: "developer-api-keys", label: "Developer API Keys" },
    ],
  },
  {
    group: "API Consumers / Agents",
    items: [
      { id: "handling-402", label: "Handling 402 Errors" },
      { id: "submitting-receipts", label: "Submitting Receipts" },
    ],
  },
  {
    group: "Smart Contract Spec",
    items: [
      { id: "router-addresses", label: "Router Addresses" },
      { id: "contract-methods", label: "Contract Methods" },
    ],
  },
  {
    group: "Core v2 Advanced Feats",
    items: [
      { id: "session-keys", label: "Delegated Session Allowances" },
      { id: "metered-billing", label: "Dynamic Payload Metering" },
      { id: "sla-escrow", label: "Deterministic SLA Escrows" },
    ],
  },
];

const ALL_SECTIONS = NAV.flatMap((g) => g.items);

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────── */

export default function DocsPage() {
  const [activeId, setActiveId] = useState<string>("introduction");
  const [navQuery, setNavQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredNav = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return NAV;
    return NAV.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          group.group.toLowerCase().includes(q)
      ),
    })).filter((group) => group.items.length > 0);
  }, [navQuery]);

  const filteredSections = useMemo(
    () => filteredNav.flatMap((g) => g.items),
    [filteredNav]
  );

  // Cmd/Ctrl+K focuses the sidebar search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scroll-spy: the section whose heading most recently crossed the top
  // quarter of the viewport is "current".
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-15% 0px -75% 0px" }
    );
    for (const { id } of ALL_SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-foreground">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-[#27272a] bg-[#09090b]/90 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-mono text-lg font-bold tracking-tight">
              PAY<span className="text-acid">/</span>GATE
            </Link>
            <span className="border border-[#27272a] px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-acid">
              Docs
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden border border-[#27272a] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:block">
              Monad Testnet · 10143
            </span>
            <Link
              href="/dashboard"
              className="border border-acid px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-acid transition-colors hover:bg-acid hover:text-primary-foreground"
            >
              Open Dashboard
            </Link>
          </div>
        </div>

        {/* Mobile nav: horizontal chip rail */}
        <nav className="flex gap-2 overflow-x-auto border-t border-[#27272a] px-4 py-2 lg:hidden">
          {filteredSections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                "shrink-0 border px-2 py-1 font-mono text-[10px] uppercase tracking-widest",
                activeId === s.id
                  ? "border-acid text-acid"
                  : "border-[#27272a] text-muted-foreground"
              )}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      {/* ── Three-pane body ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr]">
        {/* Sidebar */}
        <aside className="hidden border-r border-[#27272a] lg:block">
          <nav className="sticky top-[61px] max-h-[calc(100vh-61px)] overflow-y-auto px-6 py-8">
            <div className="mb-6">
              <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                Pay/Gate Docs
              </p>
              <div className="relative flex items-center border border-[#27272a] bg-[#09090b] focus-within:border-acid">
                <Search className="ml-2.5 size-3.5 shrink-0 text-zinc-500" />
                <input
                  ref={searchRef}
                  type="search"
                  value={navQuery}
                  onChange={(e) => setNavQuery(e.target.value)}
                  placeholder="Search docs…"
                  className="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-xs outline-none placeholder:text-zinc-600"
                  aria-label="Search documentation navigation"
                />
                <kbd className="mr-2 hidden shrink-0 border border-[#27272a] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500 sm:inline">
                  ⌘/Ctrl K
                </kbd>
              </div>
            </div>

            {filteredNav.length === 0 ? (
              <p className="font-mono text-[11px] text-zinc-500">
                No sections match &ldquo;{navQuery}&rdquo;
              </p>
            ) : (
              filteredNav.map((group) => (
                <div key={group.group} className="mb-7">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    {group.group}
                  </p>
                  <ul className="mt-2 border-l border-[#27272a]">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          className={cn(
                            "-ml-px block border-l py-1.5 pl-4 font-mono text-xs transition-colors",
                            activeId === item.id
                              ? "border-acid font-bold text-acid"
                              : "border-transparent text-zinc-400 hover:border-zinc-500 hover:text-white"
                          )}
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </nav>
        </aside>

        {/* Body */}
        <main className="min-w-0 px-6 py-10 lg:px-12">
          <Introduction />
          <QuickStart />
          <CreatingAProxy />
          <PricingModels />
          <DeveloperApiKeys />
          <Handling402 />
          <SubmittingReceipts />
          <RouterAddresses />
          <ContractMethods />
          <SessionKeys />
          <MeteredBilling />
          <SlaEscrow />

          <footer className="mt-16 border-t border-[#27272a] pt-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              402 Payment Required — as intended since 1997
            </p>
          </footer>
        </main>

        {/* On this page */}
        <aside className="hidden border-l border-[#27272a] lg:block">
          <div className="sticky top-[61px] px-6 py-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              On This Page
            </p>
            <ul className="mt-3 space-y-1">
              {(navQuery.trim() ? filteredSections : ALL_SECTIONS).map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={cn(
                      "flex items-center gap-2 py-0.5 font-mono text-[11px] transition-colors",
                      activeId === s.id
                        ? "text-acid"
                        : "text-zinc-500 hover:text-white"
                    )}
                  >
                    <span
                      className={cn(
                        "size-1",
                        activeId === s.id ? "bg-acid" : "bg-zinc-700"
                      )}
                    />
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Content sections
 * ──────────────────────────────────────────────────────────────────────────── */

function Section({
  id,
  kicker,
  title,
  metaphor,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  metaphor?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-16 scroll-mt-28">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-acid">
        {kicker}
      </p>
      <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-acid sm:text-3xl">
        {title}
      </h2>
      {metaphor ? (
        <p className="mt-1 text-xs italic text-muted-foreground">{metaphor}</p>
      ) : null}
      <div className="mt-5 space-y-5 text-sm leading-relaxed text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function Introduction() {
  return (
    <Section id="introduction" kicker="Getting Started" title="Introduction">
      <p>
        PayGate turns any HTTP API into an onchain-monetized endpoint using
        the <strong className="text-white">x402 standard</strong> — the HTTP{" "}
        <code className="docs-inline">402 Payment Required</code> status code,
        finally used as intended. You paste a URL, set a price in MON, and get
        a proxy URL. Unpaid requests are rejected with structured payment
        requirements; paid requests are verified against the Monad Testnet and
        forwarded to your origin in under a second.
      </p>
      <p>
        There is <strong className="text-white">no SDK</strong>. The entire
        integration surface is two HTTP headers and one smart contract — the{" "}
        <code className="docs-inline">PayGateRouter</code> at{" "}
        <a
          className="text-acid underline-offset-2 hover:underline"
          href={`${EXPLORER}/address/${ROUTER}`}
          target="_blank"
          rel="noreferrer"
        >
          {ROUTER.slice(0, 10)}…{ROUTER.slice(-6)}
        </a>
        , which settles payments, escrows metered deposits, and manages agent
        allowances. The protocol takes a 2% fee (200 bps); developers withdraw
        the rest at any time.
      </p>
      <HandshakeSimulator />
    </Section>
  );
}

function QuickStart() {
  return (
    <Section id="quick-start" kicker="Getting Started" title="Quick Start (60s)">
      <p>
        <strong className="text-white">Step 1 — hit a proxy without paying.</strong>{" "}
        Every PayGate proxy lives under{" "}
        <code className="docs-inline">/api/v1/gate/[proxyId]</code>:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "bash",
            lang: "bash",
            code: `curl -i http://localhost:3000/api/v1/gate/[proxyId]`,
          },
          {
            label: "javascript",
            lang: "ts",
            code: `const res = await fetch("http://localhost:3000/api/v1/gate/[proxyId]");\nif (res.status === 402) {\n  const requirements = await res.json(); // payment instructions\n}`,
          },
          {
            label: "python",
            lang: "python",
            code: `import requests\n\nres = requests.get("http://localhost:3000/api/v1/gate/[proxyId]")\nif res.status_code == 402:\n    requirements = res.json()  # payment instructions`,
          },
        ]}
      />
      <p>
        <strong className="text-white">Step 2 — read the 402.</strong> The
        response is a machine-readable price sheet (this is a live capture
        from the gateway, not pseudo-JSON):
      </p>
      <CodeBlock
        tabs={[
          {
            label: "402 response",
            lang: "json",
            code: `{
  "x402Version": 2,
  "error": "payment_required",
  "accepts": [{
    "scheme": "exact-native",
    "network": "eip155:10143",
    "asset": "MON",
    "amount": "10000000000000000",
    "payTo": "${ROUTER}",
    "maxTimeoutSeconds": 300,
    "extra": {
      "developer": "0x08e7c5ea6c00047e5fbb9994c7e0409e28c7d1c9",
      "contract": "${ROUTER}",
      "function": "processPayment(address)",
      "chainId": 10143,
      "rpcUrl": "https://testnet-rpc.monad.xyz"
    }
  }],
  "resource": {
    "url": "http://localhost:3000/api/v1/gate/[proxyId]",
    "description": "Instant Translation API"
  }
}`,
          },
        ]}
      />
      <p>
        <strong className="text-white">Step 3 — pay onchain and retry.</strong>{" "}
        Call <code className="docs-inline">processPayment(developer)</code> on
        the router with <code className="docs-inline">amount</code> as{" "}
        <code className="docs-inline">msg.value</code>, then resubmit with the
        receipt in the <code className="docs-inline">Payment-Signature</code>{" "}
        header — base64-encoded JSON containing the transaction hash:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "bash",
            lang: "bash",
            code: `# Payment-Signature = base64({"txHash": "0x…", "payer": "0x…"})
SIG=$(echo -n '{"txHash":"0xYOUR_TX_HASH","payer":"0xYOUR_ADDRESS"}' | base64 -w0)

curl -H "Payment-Signature: $SIG" \\
  http://localhost:3000/api/v1/gate/[proxyId]`,
          },
          {
            label: "javascript",
            lang: "ts",
            code: `import { createWalletClient, custom, parseEther } from "viem";

// 1. pay the router (amount + developer come from the 402 body)
const txHash = await wallet.writeContract({
  address: accept.payTo,
  abi: paygateRouterAbi,
  functionName: "processPayment",
  args: [accept.extra.developer],
  value: BigInt(accept.amount),
});

// 2. retry with the receipt
const paid = await fetch(proxyUrl, {
  headers: {
    "Payment-Signature": btoa(JSON.stringify({ txHash, payer: account })),
  },
});
// -> 200 OK, upstream payload, X-PayGate-Settlement header`,
          },
        ]}
      />
      <p>
        The gateway verifies the transaction onchain (correct contract, correct
        developer, sufficient value, not replayed) and forwards your request.
        That is the whole integration.
      </p>
    </Section>
  );
}

function CreatingAProxy() {
  return (
    <Section id="creating-a-proxy" kicker="API Providers" title="Creating a Proxy">
      <p>
        The fastest path is the{" "}
        <Link href="/dashboard" className="text-acid underline-offset-2 hover:underline">
          dashboard
        </Link>
        : connect a wallet, click <strong className="text-white">New Gateway</strong>,
        paste your origin URL, set a price, and copy the proxy link. Everything
        the dashboard does is also plain HTTP:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "bash",
            lang: "bash",
            code: `curl -X POST http://localhost:3000/api/endpoints \\
  -H "Content-Type: application/json" \\
  -d '{
    "walletAddress": "0xYOUR_WALLET",
    "name": "Weather API",
    "targetApiUrl": "https://api.weather.com/v1/current",
    "priceMon": "0.01",
    "billingType": "FLAT"
  }'`,
          },
          {
            label: "response",
            lang: "json",
            code: `{
  "endpoint": {
    "id": "cmrnzryh60003vgtob9f76ndn",
    "name": "Weather API",
    "proxyUrl": "/api/v1/gate/cmrnzryh60003vgtob9f76ndn",
    "priceWei": "10000000000000000",
    "billingType": "FLAT",
    "active": true
  }
}`,
          },
        ]}
      />
      <p>
        Your origin URL is never revealed to consumers — they only ever see the
        proxy. Earnings accrue inside the router contract under your wallet;
        call <code className="docs-inline">withdrawEarnings()</code> (or click
        Withdraw in the Treasury tab) to pull the balance at any time.
      </p>
    </Section>
  );
}

function PricingModels() {
  return (
    <Section id="pricing-models" kicker="API Providers" title="Setting Pricing Models">
      <p>PayGate supports two billing types per endpoint:</p>
      <DocsTable
        head={["Model", "Config", "Scheme in 402", "Settlement"]}
        rows={[
          [
            "FLAT",
            "priceMon — fixed MON per request",
            "exact-native",
            "processPayment() before each call; whole price settles instantly",
          ],
          [
            "METERED",
            "pricePerByteMon — MON per response byte",
            "metered-escrow",
            "depositEscrow() max cap up front; exact byte cost settles after the response, remainder auto-refunds",
          ],
        ]}
      />
      <p>
        Metered deposits are capped at{" "}
        <code className="docs-inline">pricePerByteWei × 20,000 bytes</code>.
        Responses larger than the cap settle at the cap — the consumer can
        never be charged more than the deposit they escrowed.
      </p>
      <CodeBlock
        tabs={[
          {
            label: "metered endpoint",
            lang: "bash",
            code: `curl -X POST http://localhost:3000/api/endpoints \\
  -H "Content-Type: application/json" \\
  -d '{
    "walletAddress": "0xYOUR_WALLET",
    "name": "LLM Oracle",
    "targetApiUrl": "https://your-model-server.com/generate",
    "billingType": "METERED",
    "pricePerByteMon": "0.000001"
  }'`,
          },
        ]}
      />
    </Section>
  );
}

function DeveloperApiKeys() {
  return (
    <Section
      id="developer-api-keys"
      kicker="API Providers"
      title="Developer API Keys"
    >
      <p>
        Your <code className="docs-inline">pg_…</code> key is a{" "}
        <strong className="text-white">Web2 secret bearer token</strong> for
        server-to-server automation. Pass it as{" "}
        <code className="docs-inline">Authorization: Bearer pg_…</code> to
        manage gateways without a browser wallet popup.
      </p>
      <p>
        It is issued from the dashboard{" "}
        <Link
          href="/dashboard"
          className="text-acid underline-offset-2 hover:underline"
        >
          API Keys
        </Link>{" "}
        tab and is{" "}
        <strong className="text-white">
          completely decoupled from consumer x402 onchain flows
        </strong>
        . API consumers never see it — they settle MON via the 402 handshake.
        Regenerating the key immediately invalidates the previous one.
      </p>

      <DocsTable
        head={["Capability", "Auth", "Notes"]}
        rows={[
          [
            "GET /api/endpoints",
            "Bearer pg_…",
            "List all gateways for the authenticated developer",
          ],
          [
            "POST /api/endpoints",
            "Bearer pg_…",
            "Create a flat or metered proxy without walletAddress in the body",
          ],
          [
            "PATCH / DELETE /api/endpoints/[id]",
            "wallet body (dashboard)",
            "Mutations still accept wallet ownership; Bearer support coming for CI",
          ],
          [
            "Consumer gate calls",
            "Payment-Signature / X-Agent-*",
            "Never use the developer API key on /api/v1/gate/[proxyId]",
          ],
        ]}
      />

      <CodeBlock
        tabs={[
          {
            label: "bash",
            lang: "bash",
            code: `# List your gateways programmatically
curl -s http://localhost:3000/api/endpoints \\
  -H "Authorization: Bearer pg_YOUR_KEY"

# Register a new flat proxy (no walletAddress required with Bearer)
curl -s -X POST http://localhost:3000/api/endpoints \\
  -H "Authorization: Bearer pg_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Weather API",
    "targetApiUrl": "https://api.weather.com/v1/current",
    "priceMon": "0.01",
    "billingType": "FLAT"
  }'`,
          },
          {
            label: "javascript",
            lang: "ts",
            code: `const res = await fetch("http://localhost:3000/api/endpoints", {
  headers: { Authorization: \`Bearer \${process.env.PAYGATE_API_KEY}\` },
});
if (res.status === 401) throw new Error("invalid_api_key");
const { endpoints } = await res.json();`,
          },
        ]}
      />

      <ApiKeyTester />
    </Section>
  );
}

function Handling402() {
  return (
    <Section id="handling-402" kicker="Consumers / Agents" title="Handling 402 Errors">
      <p>
        A 402 is not a failure — it is the protocol handing you a price sheet.
        Parse the body and inspect{" "}
        <code className="docs-inline">accepts[0]</code>:
      </p>
      <DocsTable
        head={["Field", "Meaning"]}
        rows={[
          ["scheme", "exact-native (flat) or metered-escrow (per byte)"],
          ["amount", "Wei to pay (flat price, or max deposit when metered)"],
          ["payTo", "The PayGateRouter contract address"],
          ["extra.developer", "Address to pass to processPayment / depositEscrow"],
          ["extra.function", "Exact contract function to call"],
          ["extra.requestId", "metered only — bytes32 key for your escrow"],
          ["extra.rpcUrl / chainId", "Where to send the transaction"],
        ]}
      />
      <p>
        A rejected payment returns 402 again with a{" "}
        <code className="docs-inline">reason</code> field —{" "}
        <code className="docs-inline">tx_not_found</code>,{" "}
        <code className="docs-inline">insufficient_payment_amount</code>,{" "}
        <code className="docs-inline">payment_already_used</code> (replay
        protection), <code className="docs-inline">session_allowance_exhausted</code>,
        and friends — so agents can self-correct without human eyes.
      </p>
    </Section>
  );
}

function SubmittingReceipts() {
  return (
    <Section id="submitting-receipts" kicker="Consumers / Agents" title="Submitting Receipts">
      <p>
        Receipts travel in the{" "}
        <code className="docs-inline">Payment-Signature</code> request header
        as base64-encoded JSON. The shape depends on the scheme:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "flat (exact-native)",
            lang: "json",
            code: `{
  "txHash": "0x…",   // your processPayment transaction
  "payer": "0x…"     // optional, echoed into analytics
}`,
          },
          {
            label: "metered (escrow)",
            lang: "json",
            code: `{
  "txHash": "0x…",     // your depositEscrow transaction
  "requestId": "0x…",  // the bytes32 from the 402's extra.requestId
  "payer": "0x…"
}`,
          },
        ]}
      />
      <p>
        Each transaction hash is single-use — the gateway stores it with a
        unique constraint, so replaying an old receipt yields{" "}
        <code className="docs-inline">402 payment_already_used</code>. On
        success the response carries{" "}
        <code className="docs-inline">X-Payment-Response</code> (base64 JSON
        settlement summary) and{" "}
        <code className="docs-inline">X-PayGate-Settlement</code> (the
        settlement transaction hash you can verify on the explorer).
      </p>
    </Section>
  );
}

function RouterAddresses() {
  return (
    <Section id="router-addresses" kicker="Contract Spec" title="Router Addresses">
      <DocsTable
        head={["Parameter", "Value"]}
        rows={[
          ["Contract", "PayGateRouter (Solidity 0.8.x, Foundry)"],
          ["Address", ROUTER],
          ["Network", "Monad Testnet · Chain ID 10143"],
          ["RPC", "https://testnet-rpc.monad.xyz"],
          ["Explorer", `${EXPLORER}/address/${ROUTER}`],
          ["Protocol fee", "200 bps (2%) on every settlement path"],
          ["Owner", "PayGate platform wallet — sole settlement authority"],
        ]}
      />
      <p>
        The <code className="docs-inline">owner</code> is the only address
        permitted to call{" "}
        <code className="docs-inline">settleEscrow</code>,{" "}
        <code className="docs-inline">refundEscrow</code>, and{" "}
        <code className="docs-inline">chargeAgent</code> — enforced by an{" "}
        <code className="docs-inline">onlyOwner</code> modifier and verified by
        fuzzed access-control tests. Consumers and developers never need to
        trust the proxy with custody: funds sit in the contract, and every
        state change is checks-effects-interactions ordered.
      </p>
    </Section>
  );
}

function ContractMethods() {
  return (
    <Section id="contract-methods" kicker="Contract Spec" title="Contract Methods">
      <DocsTable
        head={["Method", "Access", "Purpose"]}
        rows={[
          [
            "processPayment(address developer) payable",
            "anyone",
            "Flat payment: 2% fee to treasury, 98% credited to developer balance",
          ],
          [
            "withdrawEarnings()",
            "developer",
            "Pull your accrued balance to your wallet",
          ],
          [
            "approveAgent(address agent, uint256 allowance) payable",
            "master wallet",
            "Escrow msg.value == allowance as a spending cap for an ephemeral agent key",
          ],
          [
            "revokeAgent(address agent)",
            "master wallet",
            "Kill the session; unspent allowance returns to the master instantly",
          ],
          [
            "chargeAgent(master, agent, developer, amount)",
            "owner only",
            "Settle one agent request against the escrowed allowance",
          ],
          [
            "depositEscrow(address developer, bytes32 requestId) payable",
            "anyone",
            "Lock a metered max-cap deposit under a unique request id",
          ],
          [
            "settleEscrow(bytes32 requestId, uint256 actualCost)",
            "owner only",
            "Release exact metered cost to the developer, refund the remainder to the consumer",
          ],
          [
            "refundEscrow(bytes32 requestId)",
            "owner only",
            "Return 100% of a locked deposit after an upstream failure",
          ],
          [
            "balances / agentAllowances / escrows",
            "view",
            "Public read access to developer earnings, session caps, escrow records",
          ],
        ]}
      />
    </Section>
  );
}

function SessionKeys() {
  return (
    <Section
      id="session-keys"
      kicker="Core v2"
      title="Delegated Session Allowances"
      metaphor="(The Corporate Card Pattern)"
    >
      <p>
        Agents cannot click through wallet popups. Delegated session allowances
        fix this by issuing a pre-authorized corporate expense limit to an
        autonomous agent: the master wallet escrows a spending cap once, and the
        agent draws against it. You generate a throwaway keypair, escrow an
        allowance onchain for it, and register it with the gateway. From then
        on the agent signs plain HTTP headers —{" "}
        <strong className="text-white">zero popups, zero 402s</strong> — and
        the platform settles each request against the escrowed allowance via{" "}
        <code className="docs-inline">chargeAgent</code>.
      </p>
      <p>
        <strong className="text-white">
          Step 1 — issue the corporate allowance onchain:
        </strong>
      </p>
      <CodeBlock
        tabs={[
          {
            label: "viem",
            lang: "ts",
            code: `import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseEther } from "viem";

const agentKey = generatePrivateKey();          // ephemeral, never leaves you
const agent = privateKeyToAccount(agentKey);

// escrow 0.05 MON as the agent's spending cap
await wallet.writeContract({
  address: "${ROUTER}",
  abi: paygateRouterAbi,
  functionName: "approveAgent",
  args: [agent.address, parseEther("0.05")],
  value: parseEther("0.05"),   // msg.value must equal the allowance
});`,
          },
          {
            label: "ethers.js",
            lang: "ts",
            code: `import { ethers } from "ethers";

const agentWallet = ethers.Wallet.createRandom();
const allowance = ethers.parseEther("0.05");

const router = new ethers.Contract("${ROUTER}", abi, signer);
await router.approveAgent(agentWallet.address, allowance, {
  value: allowance, // msg.value must equal the allowance
});`,
          },
        ]}
      />
      <p>
        <strong className="text-white">Step 2 — register with the gateway</strong>{" "}
        (it verifies the onchain allowance before accepting):
      </p>
      <CodeBlock
        tabs={[
          {
            label: "bash",
            lang: "bash",
            code: `curl -X POST http://localhost:3000/api/session-keys \\
  -H "Content-Type: application/json" \\
  -d '{
    "masterAddress": "0xYOUR_WALLET",
    "agentAddress": "0xAGENT_ADDRESS",
    "maxAllowanceWei": "50000000000000000",
    "expiresInHours": 24
  }'`,
          },
        ]}
      />
      <p>
        <strong className="text-white">Step 3 — the agent signs requests.</strong>{" "}
        Each call carries three headers; the signature is EIP-191 over{" "}
        <code className="docs-inline">paygate:agent:&lt;proxyId&gt;:&lt;timestamp&gt;</code>{" "}
        (timestamps older than 120s are rejected):
      </p>
      <CodeBlock
        tabs={[
          {
            label: "javascript",
            lang: "ts",
            code: `const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = await agent.signMessage({
  message: \`paygate:agent:\${proxyId}:\${timestamp}\`,
});

const res = await fetch(proxyUrl, {
  headers: {
    "X-Agent-Address": agent.address,
    "X-Agent-Signature": signature,
    "X-Agent-Timestamp": timestamp,
  },
});
// -> 200 directly. No 402. No wallet popup. Fire thousands of these.`,
          },
        ]}
      />
      <p>
        Revoke any time with{" "}
        <code className="docs-inline">revokeAgent(agentAddress)</code> — the
        unspent allowance returns to the master wallet in the same transaction.
      </p>
    </Section>
  );
}

function MeteredBilling() {
  return (
    <Section
      id="metered-billing"
      kicker="Core v2"
      title="Dynamic Payload Metering"
      metaphor="(The Taxi Meter Pattern)"
    >      <p>
        Flat pricing overcharges small responses and undercharges large ones.
        Metered endpoints bill for the{" "}
        <strong className="text-white">exact bytes returned</strong>, using an
        escrow lifecycle the consumer never has to trust:
      </p>
      <DocsTable
        head={["Phase", "Call", "Who", "Effect"]}
        rows={[
          [
            "1 · Lock",
            "depositEscrow(developer, requestId)",
            "consumer",
            "Max-cap deposit (pricePerByte × 20,000) locked under the 402's requestId",
          ],
          [
            "2 · Meter",
            "— gateway proxies upstream —",
            "PayGate",
            "Response streamed, exact byte length counted: cost = bytes × pricePerByteWei",
          ],
          [
            "3 · Settle",
            "settleEscrow(requestId, actualCost)",
            "PayGate (owner)",
            "Developer gets 98% of actual cost, 2% fee, unspent deposit refunds to the consumer in the same transaction",
          ],
        ]}
      />
      <p>
        The settlement summary rides back on the response in the{" "}
        <code className="docs-inline">X-Payment-Response</code> header:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "decoded header",
            lang: "json",
            code: `{
  "success": true,
  "scheme": "metered-escrow",
  "requestId": "0x50439185b40688b7405618887b605dc235cbf821…",
  "txHash": "0x…",            // the settleEscrow transaction
  "network": "eip155:10143",
  "responseBytes": 252,
  "actualCostWei": "252000000000000",
  "refundedWei": "19748000000000000"
}`,
          },
        ]}
      />
      <p>
        Zero-byte responses (e.g. HTTP 204) settle at cost 0 — the full deposit
        refunds with no protocol fee taken.
      </p>
    </Section>
  );
}

function SlaEscrow() {
  return (
    <Section
      id="sla-escrow"
      kicker="Core v2"
      title="Deterministic SLA Escrows"
      metaphor="(The Vending Machine Pattern)"
    >
      <p>
        Under the Vending Machine Pattern, a jammed machine must return the
        coin. Because metered payments are escrowed rather than paid directly,
        the contract can enforce this:{" "}
        <strong className="text-white">
          if the upstream returns a 5xx or times out, the gateway automatically
          calls <code className="docs-inline">refundEscrow(requestId)</code>
        </strong>{" "}
        and 100% of the locked MON returns to the consumer&apos;s wallet — no
        support ticket, no goodwill, just the state machine.
      </p>
      <CodeBlock
        tabs={[
          {
            label: "failed request",
            lang: "bash",
            code: `curl -i -H "Payment-Signature: $SIG" \\
  http://localhost:3000/api/v1/gate/[proxyId]

# HTTP/1.1 502 Bad Gateway
# X-PayGate-Refund: 0xREFUND_TX_HASH   <- your money is already back
#
# {"error":"upstream_failed","refund":{"txHash":"0x…","amountWei":"20000000000000000"}}`,
          },
        ]}
      />
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        Contract security guarantees
      </p>
      <DocsTable
        head={["Guarantee", "Mechanism"]}
        rows={[
          [
            "No reentrancy on refunds",
            "Escrow records are deactivated before any transfer (checks-effects-interactions), proven by reentrancy-probe tests",
          ],
          [
            "Only the proxy settles",
            "settleEscrow / refundEscrow / chargeAgent revert with NotOwner for every other caller (fuzz-tested)",
          ],
          [
            "No double-settlement",
            "An escrow can settle or refund exactly once; the record deactivates atomically",
          ],
          [
            "No replay",
            "Deposit tx hashes are unique-constrained; agent signatures expire after 120 seconds",
          ],
          [
            "Bounded charge",
            "settleEscrow caps actualCost at the deposit; consumers can never pay more than they locked",
          ],
        ]}
      />
      <p>
        The full Foundry suite (33 tests, including fuzzed access control and
        reentrancy probes) lives in{" "}
        <code className="docs-inline">contracts/test/PayGateRouter.t.sol</code>.
      </p>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Interactive: x402 handshake simulator
 * ──────────────────────────────────────────────────────────────────────────── */

type SimPhase = "idle" | "fetch" | "blocked" | "paying" | "settled";

const SIM_STEPS: { phase: SimPhase; delay: number; line: string; tone: "out" | "err" | "chain" | "ok" }[] = [
  { phase: "fetch", delay: 0, line: "--> GET /api/v1/gate/weather", tone: "out" },
  { phase: "blocked", delay: 900, line: "<-- 402 PAYMENT REQUIRED · amount 0.01 MON", tone: "err" },
  { phase: "paying", delay: 1900, line: "==> processPayment(developer) · value 0.01 MON", tone: "chain" },
  { phase: "paying", delay: 2900, line: "==> tx confirmed in ~0.4s (Monad block)", tone: "chain" },
  { phase: "settled", delay: 3700, line: "<-- 200 OK · X-PayGate-Settlement: 0x8197…b17c", tone: "ok" },
];

function HandshakeSimulator() {
  const [phase, setPhase] = useState<SimPhase>("idle");
  const [visible, setVisible] = useState<number>(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("idle");
    setVisible(0);
  }, []);

  const run = useCallback(() => {
    reset();
    SIM_STEPS.forEach((step, i) => {
      timers.current.push(
        setTimeout(() => {
          setPhase(step.phase);
          setVisible(i + 1);
        }, step.delay)
      );
    });
  }, [reset]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const packetPos =
    phase === "idle" ? 0 : phase === "fetch" ? 50 : phase === "blocked" ? 50 : phase === "paying" ? 100 : 50;
  const packetColor =
    phase === "blocked" ? "bg-destructive" : phase === "paying" ? "bg-amber-300" : "bg-acid";

  const statusBadge =
    phase === "idle"
      ? { text: "AWAITING REQUEST", cls: "border-zinc-700 text-zinc-500" }
      : phase === "blocked"
        ? { text: "402 BLOCKED", cls: "border-destructive text-destructive" }
        : phase === "settled"
          ? { text: "200 SETTLED", cls: "border-acid text-acid" }
          : { text: "IN FLIGHT…", cls: "border-amber-300 text-amber-300" };

  return (
    <div className="border border-[#27272a] bg-zinc-950/60">
      <div className="flex items-center justify-between border-b border-[#27272a] px-4 py-2.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
          Interactive · x402 Handshake Simulator
        </p>
        <span className={cn("border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest", statusBadge.cls)}>
          {statusBadge.text}
        </span>
      </div>

      <div className="px-4 py-5">
        {/* Node track */}
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
          <span className="border border-zinc-700 px-2 py-1 text-zinc-300">Client</span>
          <span
            className={cn(
              "border px-2 py-1 transition-colors",
              phase === "blocked" ? "border-destructive text-destructive" : "border-zinc-700 text-zinc-300"
            )}
          >
            PayGate Proxy
          </span>
          <span
            className={cn(
              "border px-2 py-1 transition-colors",
              phase === "paying" || phase === "settled"
                ? "border-acid text-acid"
                : "border-zinc-700 text-zinc-300"
            )}
          >
            Monad · 10143
          </span>
        </div>
        <div className="relative mt-3 h-2">
          <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-zinc-800" />
          <div
            className={cn("absolute top-1/2 size-2 -translate-y-1/2 transition-all duration-700", packetColor)}
            style={{ left: `calc(${packetPos}% - ${packetPos / 12.5}px)`, opacity: phase === "idle" ? 0.3 : 1 }}
          />
        </div>

        {/* Log */}
        <div className="mt-4 min-h-28 border border-[#27272a] bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed">
          {visible === 0 ? (
            <p className="text-zinc-600">$ press simulate to run the packet lifecycle…</p>
          ) : (
            SIM_STEPS.slice(0, visible).map((s, i) => (
              <p
                key={i}
                className={cn(
                  s.tone === "err" && "text-destructive",
                  s.tone === "chain" && "text-amber-300",
                  s.tone === "ok" && "text-acid",
                  s.tone === "out" && "text-zinc-300"
                )}
              >
                {s.line}
              </p>
            ))
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={run}
            className="inline-flex items-center gap-2 border border-acid bg-acid px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid"
          >
            <Play className="size-3" /> Simulate x402 Handshake
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 border border-zinc-700 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
          >
            <RotateCcw className="size-3" /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Code block with tabs, copy, and lightweight syntax highlighting
 * ──────────────────────────────────────────────────────────────────────────── */

type Lang = "bash" | "json" | "ts" | "python";

interface CodeTab {
  label: string;
  lang: Lang;
  code: string;
}

/** [regex source, tailwind class] pairs, tried in order within one pass. */
const TOKEN_RULES: Record<Lang, [string, string][]> = {
  bash: [
    ["#[^\\n]*", "text-zinc-600"],
    ["\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'", "text-acid"],
    ["\\b(curl|echo|base64|export)\\b", "text-sky-300"],
    ["(?:^|\\s)(-{1,2}[\\w-]+)", "text-amber-300"],
  ],
  json: [
    ["\"(?:[^\"\\\\]|\\\\.)*\"(?=\\s*:)", "text-zinc-400"],
    ["\"(?:[^\"\\\\]|\\\\.)*\"", "text-acid"],
    ["\\b(true|false|null)\\b", "text-sky-300"],
    ["-?\\b\\d+(?:\\.\\d+)?\\b", "text-amber-300"],
    ["//[^\\n]*", "text-zinc-600"],
  ],
  ts: [
    ["//[^\\n]*", "text-zinc-600"],
    ["\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`", "text-acid"],
    [
      "\\b(const|let|var|await|async|function|return|import|from|new|if|else|throw|export)\\b",
      "text-sky-300",
    ],
    ["\\b\\d+(?:\\.\\d+)?n?\\b", "text-amber-300"],
  ],
  python: [
    ["#[^\\n]*", "text-zinc-600"],
    ["\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'", "text-acid"],
    ["\\b(import|from|def|return|if|else|with|as|print)\\b", "text-sky-300"],
    ["\\b\\d+(?:\\.\\d+)?\\b", "text-amber-300"],
  ],
};

function highlight(code: string, lang: Lang): React.ReactNode[] {
  const rules = TOKEN_RULES[lang];
  const combined = new RegExp(
    rules.map(([src]) => `(${src})`).join("|"),
    "gm"
  );

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of code.matchAll(combined)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(code.slice(last, index));
    const groupIdx = match.slice(1).findIndex((g) => g !== undefined);
    nodes.push(
      <span key={key++} className={rules[groupIdx]?.[1] ?? ""}>
        {match[0]}
      </span>
    );
    last = index + match[0].length;
  }
  if (last < code.length) nodes.push(code.slice(last));
  return nodes;
}

function CodeBlock({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const tab = tabs[active];
  const highlighted = useMemo(() => highlight(tab.code, tab.lang), [tab]);

  const copy = async () => {
    await navigator.clipboard.writeText(tab.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border border-[#27272a] bg-zinc-950">
      <div className="flex items-center justify-between border-b border-[#27272a]">
        <div className="flex">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "border-r border-[#27272a] px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors",
                i === active
                  ? "bg-black text-acid"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-white"
        >
          {copied ? (
            <>
              <Check className="size-3 text-acid" />
              <span className="text-acid">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-[family-name:var(--font-jbmono)] text-[12px] leading-relaxed text-zinc-200">
        <code>{highlighted}</code>
      </pre>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Table
 * ──────────────────────────────────────────────────────────────────────────── */

function DocsTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto border border-[#27272a]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[#27272a] bg-zinc-950">
            {head.map((h) => (
              <th
                key={h}
                className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#27272a] last:border-b-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    "px-3 py-2.5 align-top text-xs leading-relaxed",
                    j === 0
                      ? "whitespace-nowrap font-[family-name:var(--font-jbmono)] text-acid"
                      : "text-zinc-300"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
