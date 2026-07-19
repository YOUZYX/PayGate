import Link from "next/link";
import {
  ArrowRight,
  BookText,
  Bot,
  Globe,
  Ruler,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b]">
      {/* ── Top navigation ─────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#09090b]/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-mono text-lg font-bold tracking-tight">
            PAY<span className="text-acid">/</span>GATE
          </span>

          <div className="flex items-center gap-2">
            <span className="border border-zinc-800 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Monad Testnet · 10143
            </span>

            <NavIcon href="/docs" label="Documentation" internal>
              <BookText className="size-4" />
            </NavIcon>
            <NavIcon href="https://github.com/YOUZYX/PayGate" label="View Source">
              <GithubMark className="size-4" />
            </NavIcon>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-zinc-800">
          {/* Toxic-lime radial glow behind the headline. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/4 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-acid opacity-10 blur-[160px]"
          />

          <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28">
            <div>
              <p className="inline-flex items-center gap-2 border border-zinc-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-acid">
                <Zap className="size-3" />
                x402 · HTTP-native payments
              </p>
              <h1 className="mt-6 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
                Onchain micro&#8209;paywalls for any HTTP API on{" "}
                <span className="text-acid">Monad</span>.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
                No code, no keys to hand out. One proxy URL, priced in MON,
                settled onchain in under a second.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 border border-acid bg-acid px-6 py-3 font-mono text-sm font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid"
                >
                  Open Dashboard <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/demo/storefront"
                  className="inline-flex items-center gap-2 border border-zinc-700 px-6 py-3 font-mono text-sm font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                >
                  Live Demo
                </Link>
              </div>
            </div>

            <HeroTerminal />
          </div>
        </section>

        {/* ── Bento feature grid ───────────────────────────── */}
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <p className="font-mono text-[10px] uppercase tracking-widest text-acid">
            Protocol Features
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-extrabold tracking-tight">
            Three industry-firsts for the x402 standard.
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Bento 1 — delegated session allowances */}
            <BentoBox
              span2
              icon={<Bot className="size-4" />}
              title="Delegated Session Allowances"
              metaphor="(The Corporate Card Pattern)"
              body="Issue a pre-authorized corporate expense limit to an autonomous agent. Authorize an ephemeral session key once — your agents can fire thousands of requests in the background with zero wallet popups."
            >
              <div className="mt-auto">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>Allowance: 0.05 MON</span>
                  <span className="flex items-center gap-1.5 text-acid">
                    <span
                      className="size-1.5 bg-acid"
                      style={{ animation: "pg-pulse-dot 1.2s ease-in-out infinite" }}
                    />
                    Agent Live
                  </span>
                </div>
                <div className="mt-2 h-2.5 border border-zinc-700 p-px">
                  <div
                    className="h-full bg-acid"
                    style={{ animation: "pg-drain 7s ease-in-out infinite" }}
                  />
                </div>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  3,412 background calls · 0 popups
                </p>
              </div>
            </BentoBox>

            {/* Bento 2 — dynamic payload metering */}
            <BentoBox
              icon={<Ruler className="size-4" />}
              title="Dynamic Payload Metering"
              metaphor="(The Taxi Meter Pattern)"
              body="Don't overcharge for small data. Bill dynamically based on the exact payload size returned by your API."
            >
              <div className="mt-auto border border-zinc-800 bg-black/40 px-3 py-2">
                <div className="h-7 overflow-hidden">
                  <div style={{ animation: "pg-ticker 6s steps(1, end) infinite" }}>
                    <TickerRow bytes="252" cost="0.000252" />
                    <TickerRow bytes="1,024" cost="0.001024" />
                    <TickerRow bytes="88" cost="0.000088" />
                    <TickerRow bytes="252" cost="0.000252" />
                  </div>
                </div>
              </div>
            </BentoBox>

            {/* Bento 3 — deterministic SLA escrows */}
            <BentoBox
              icon={<ShieldCheck className="size-4" />}
              title="Deterministic SLA Escrows"
              metaphor="(The Vending Machine Pattern)"
              body="Payments are escrowed onchain. If your upstream server crashes or returns a 5xx error, the smart contract instantly refunds the consumer."
            >
              <div className="mt-auto">
                <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest">
                  <span className="border border-acid/60 px-1.5 py-0.5 text-acid">
                    Consumer Wallet
                  </span>
                  <span className="border border-destructive/70 px-1.5 py-0.5 text-destructive">
                    504 Timeout
                  </span>
                </div>
                <div className="relative mt-3 h-2">
                  <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-zinc-700" />
                  <div
                    className="absolute top-1/2 size-2 -translate-y-1/2"
                    style={{ animation: "pg-packet 4s ease-in-out infinite" }}
                  />
                </div>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  refundEscrow() · 100% bounced back
                </p>
              </div>
            </BentoBox>

            {/* Bento 4 — 60-second setup */}
            <BentoBox
              span2
              icon={<Globe className="size-4" />}
              title="No SDKs. Just Native HTTP."
              metaphor="(The 60-Second Setup)"
              body="The x402 standard means you don't need to learn a new library. Paste your URL, get a proxy, and you're monetized on Monad."
            >
              <div className="mt-auto grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="border border-zinc-800 bg-black/40 px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    Original · Unmonetized
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-zinc-400">
                    api.weather.com
                  </p>
                </div>
                <ArrowRight className="mx-auto size-4 rotate-90 text-acid sm:rotate-0" />
                <div className="border border-acid/50 bg-black/40 px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-acid">
                    Monetized · 0.01 MON / call
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-foreground">
                    paygate.so<span className="text-acid">/gate/weather</span>
                  </p>
                </div>
              </div>
            </BentoBox>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            402 Payment Required — as intended since 1997
          </p>
          <p className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:block">
            Built on Monad · Settled in MON
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Pieces
 * ──────────────────────────────────────────────────────────────────────────── */

function NavIcon({
  href,
  label,
  internal,
  children,
}: {
  href: string;
  label: string;
  internal?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "group relative flex size-8 items-center justify-center border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-600 hover:text-white";
  const tooltip = (
    <span className="pointer-events-none absolute right-0 top-full z-30 mt-2 hidden whitespace-nowrap border border-zinc-700 bg-[#09090b] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-300 group-hover:block">
      {label}
    </span>
  );

  if (internal) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {children}
        {tooltip}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className={className}
    >
      {children}
      {tooltip}
    </a>
  );
}

/* Lucide v1.24 has no brand icons, so the GitHub mark is inlined. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function HeroTerminal() {
  return (
    <div className="border border-zinc-800 bg-zinc-950 shadow-[0_0_60px_-20px_rgba(180,255,17,0.25)]">
      {/* macOS-style chrome */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/70 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          consumer@x402 — 80×24
        </span>
      </div>

      <div className="px-4 py-4 font-mono text-[11px] leading-relaxed sm:text-xs">
        {/* Typed curl command (width animates 0 → 39ch, then caret keeps blinking) */}
        <div className="flex text-zinc-200">
          <span className="mr-2 shrink-0 text-acid">$</span>
          <span
            className="overflow-hidden whitespace-nowrap"
            style={{ animation: "pg-type 2.2s steps(39, end) 0.4s both" }}
          >
            curl -i https://paygate.so/gate/weather
          </span>
          <span
            className="w-[1ch] text-acid"
            style={{ animation: "pg-caret 0.9s step-end infinite" }}
          >
            ▌
          </span>
        </div>

        {/* 402 response, revealed line by line after the command finishes */}
        <div className="mt-3 space-y-0.5">
          <TermLine delay={2.8} className="font-bold text-destructive">
            HTTP/1.1 402 Payment Required
          </TermLine>
          <TermLine delay={3.0} className="text-zinc-500">
            content-type: application/json
          </TermLine>
          <TermLine delay={3.2} className="text-zinc-300">
            {"{"}
          </TermLine>
          <TermLine delay={3.3} className="pl-4 text-zinc-300">
            <K>x402Version</K>: <V acid>2</V>,
          </TermLine>
          <TermLine delay={3.4} className="pl-4 text-zinc-300">
            <K>error</K>: <V>&quot;payment_required&quot;</V>,
          </TermLine>
          <TermLine delay={3.5} className="pl-4 text-zinc-300">
            <K>accepts</K>: [{"{"}
          </TermLine>
          <TermLine delay={3.6} className="pl-8 text-zinc-300">
            <K>asset</K>: <V acid>&quot;MON&quot;</V>,
          </TermLine>
          <TermLine delay={3.7} className="pl-8 text-zinc-300">
            <K>amount</K>: <V acid>&quot;10000000000000000&quot;</V>,
          </TermLine>
          <TermLine delay={3.8} className="pl-8 text-zinc-300">
            <K>payTo</K>: <V>&quot;0x8197…b17C&quot;</V>
          </TermLine>
          <TermLine delay={3.9} className="pl-4 text-zinc-300">
            {"}]"}
          </TermLine>
          <TermLine delay={4.0} className="text-zinc-300">
            {"}"}
          </TermLine>
          <TermLine delay={4.4} className="text-zinc-500">
            <span className="text-acid"># </span>pay in MON, retry, get 200. that&apos;s the whole integration.
          </TermLine>
        </div>
      </div>
    </div>
  );
}

function TermLine({
  delay,
  className,
  children,
}: {
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={className}
      style={{ animation: `pg-fade-up 0.3s ease-out ${delay}s both` }}
    >
      {children}
    </p>
  );
}

function K({ children }: { children: React.ReactNode }) {
  return <span className="text-zinc-500">&quot;{children}&quot;</span>;
}

function V({ acid, children }: { acid?: boolean; children: React.ReactNode }) {
  return <span className={acid ? "text-acid" : "text-zinc-200"}>{children}</span>;
}

function BentoBox({
  span2,
  icon,
  title,
  metaphor,
  body,
  children,
}: {
  span2?: boolean;
  icon: React.ReactNode;
  title: string;
  metaphor?: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-4 border border-zinc-800 bg-zinc-950/60 p-6 transition-all duration-300",
        "hover:-translate-y-1 hover:border-acid/40 hover:shadow-[0_0_40px_-16px_rgba(180,255,17,0.35)]",
        span2 && "md:col-span-2"
      )}
    >
      <div>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-acid">
          {icon}
          Protocol Feature
        </p>
        <h3 className="mt-3 text-xl font-extrabold tracking-tight text-acid">
          {title}
        </h3>
        {metaphor ? (
          <p className="mt-1 text-xs italic text-muted-foreground">{metaphor}</p>
        ) : null}
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
      {children}
    </div>
  );
}

function TickerRow({ bytes, cost }: { bytes: string; cost: string }) {
  return (
    <p className="flex h-7 items-center justify-between font-mono text-xs">
      <span className="text-zinc-400">[{bytes} Bytes]</span>
      <span className="text-zinc-600">-&gt;</span>
      <span className="font-bold text-acid">{cost} MON</span>
    </p>
  );
}
