"use client";

/**
 * PayGate storefront demo — a live, zero-mock proof of the three x402 flows
 * against the deployed PayGateRouter on Monad Testnet:
 *   A. Delegated Session Allowances (The Corporate Card Pattern)
 *   B. Dynamic Payload Metering (The Taxi Meter Pattern)
 *   C. Deterministic SLA Escrows (The Vending Machine Pattern)
 * Plus a terminal-style pipeline inspector logging every network/onchain step.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { formatEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  Activity,
  Bot,
  Check,
  Copy,
  Languages,
  Radio,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
  Trash2,
  Wallet,
} from "lucide-react";
import { PAYGATE_ROUTER_ADDRESS, paygateRouterAbi } from "@/lib/contract";
import {
  agentSessionMessage,
  encodeBase64Json,
  type PaymentRequiredBody,
} from "@/lib/x402";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CreateSessionModal,
  type SessionConfig,
} from "@/components/demo/create-session-modal";

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

type DemoEndpoint = {
  id: string;
  name: string;
  proxyUrl: string;
  billingType: string;
  priceWei: string;
  pricePerByteWei: string | null;
  developer: string;
};

type DemoEndpoints = {
  flat: DemoEndpoint;
  metered: DemoEndpoint;
  corrupted: DemoEndpoint;
};

type LogKind = "out" | "in" | "chain" | "ok" | "err" | "raw";

type LogLine = {
  id: number;
  ts: string;
  kind: LogKind;
  text: string;
};

type StoredAgentSession = {
  privateKey: `0x${string}`;
  agentAddress: string;
  allowanceWei: string;
  expiresAt: number;
};

const AGENT_KEY_STORAGE = "paygate_demo_agent_key";
const AGENT_META_STORAGE = "paygate_demo_agent_meta";
/** Legacy key from the first storefront build — cleared on load. */
const LEGACY_AGENT_KEY = "paygate.demo.agentKey";

const EXPLORER =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.monadvision.com";

function short(value: string, head = 10, tail = 6): string {
  return value.length > head + tail + 1
    ? `${value.slice(0, head)}…${value.slice(-tail)}`
    : value;
}

function fmtMon(wei: bigint, maxDecimals = 6): string {
  const [whole, frac = ""] = formatEther(wei).split(".");
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function readStoredSession(): StoredAgentSession | null {
  if (typeof window === "undefined") return null;
  try {
    localStorage.removeItem(LEGACY_AGENT_KEY);
  } catch {
    /* ignore */
  }
  const privateKey = sessionStorage.getItem(AGENT_KEY_STORAGE);
  const metaRaw = sessionStorage.getItem(AGENT_META_STORAGE);
  if (!privateKey?.startsWith("0x") || !metaRaw) return null;
  try {
    const meta = JSON.parse(metaRaw) as Omit<StoredAgentSession, "privateKey">;
    if (!meta.expiresAt || meta.expiresAt <= Date.now()) {
      clearStoredSession();
      return null;
    }
    return {
      privateKey: privateKey as `0x${string}`,
      agentAddress: meta.agentAddress,
      allowanceWei: meta.allowanceWei,
      expiresAt: meta.expiresAt,
    };
  } catch {
    clearStoredSession();
    return null;
  }
}

function writeStoredSession(session: StoredAgentSession) {
  sessionStorage.setItem(AGENT_KEY_STORAGE, session.privateKey);
  sessionStorage.setItem(
    AGENT_META_STORAGE,
    JSON.stringify({
      agentAddress: session.agentAddress,
      allowanceWei: session.allowanceWei,
      expiresAt: session.expiresAt,
    })
  );
}

function clearStoredSession() {
  sessionStorage.removeItem(AGENT_KEY_STORAGE);
  sessionStorage.removeItem(AGENT_META_STORAGE);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────── */

export default function StorefrontPage() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  /* ── Pipeline inspector state ─────────────────────────── */
  const [lines, setLines] = useState<LogLine[]>([]);
  const nextId = useRef(0);
  const terminalRef = useRef<HTMLDivElement>(null);

  const log = useCallback((kind: LogKind, text: string) => {
    setLines((prev) => [
      ...prev,
      {
        id: nextId.current++,
        ts: new Date().toISOString().slice(11, 23),
        kind,
        text,
      },
    ]);
  }, []);

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [lines]);

  /* ── Demo endpoint provisioning (real DB rows) ────────── */
  const { data: endpoints } = useQuery({
    queryKey: ["demo-endpoints", address],
    enabled: isConnected && !!address,
    queryFn: async () => {
      const res = await fetch("/api/demo/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!res.ok) throw new Error("Demo setup failed");
      const data = (await res.json()) as { endpoints: DemoEndpoints };
      return data.endpoints;
    },
  });

  /* ── Delegated Session Allowances (The Corporate Card Pattern) ─── */
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [agentSession, setAgentSession] = useState<StoredAgentSession | null>(
    () => readStoredSession()
  );

  const agentKey = agentSession?.privateKey ?? null;
  const maxAllowanceWei = agentSession
    ? BigInt(agentSession.allowanceWei)
    : 0n;

  const agentAccount = useMemo(
    () => (agentKey ? privateKeyToAccount(agentKey) : null),
    [agentKey]
  );

  const { data: agentRemaining } = useQuery({
    queryKey: ["agent-allowance", address, agentAccount?.address],
    enabled: !!address && !!agentAccount && !!publicClient,
    refetchInterval: 4000,
    queryFn: async () =>
      publicClient!.readContract({
        address: PAYGATE_ROUTER_ADDRESS,
        abi: paygateRouterAbi,
        functionName: "agentAllowances",
        args: [address!, agentAccount!.address],
      }),
  });

  const agentActive =
    !!agentAccount && !!agentSession && (agentRemaining ?? 0n) > 0n;

  const authorizeAgent = useMutation({
    mutationFn: async (config: SessionConfig) => {
      if (!address || !publicClient) throw new Error("Wallet not connected");

      // Ephemeral keypair generated in-browser — never leaves this tab.
      const privateKey = generatePrivateKey();
      const agent = privateKeyToAccount(privateKey);
      const allowance = config.allowanceWei;
      const expiresAt = Date.now() + config.expiresInHours * 3_600_000;

      log(
        "out",
        `GENERATING EPHEMERAL AGENT KEY ${agent.address} (invisible wallet)`
      );
      log(
        "chain",
        `INITIATING approveAgent(${short(agent.address)}, ${fmtMon(allowance)} MON) · ${config.durationDays}d session`
      );

      const txHash = await writeContractAsync({
        address: PAYGATE_ROUTER_ADDRESS,
        abi: paygateRouterAbi,
        functionName: "approveAgent",
        args: [agent.address, allowance],
        value: allowance,
      });
      log("chain", `[TX HASH] ${txHash}`);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      log(
        "ok",
        `[TX HASH] 🟢 AgentApproved: ${fmtMon(allowance)} MON · approveAgent(${short(agent.address)})`
      );

      const res = await fetch("/api/session-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterAddress: address,
          agentAddress: agent.address,
          maxAllowanceWei: allowance.toString(),
          expiresInHours: config.expiresInHours,
        }),
      });
      if (!res.ok) {
        throw new Error(`Session key registration failed (${res.status})`);
      }
      log(
        "ok",
        `SESSION KEY REGISTERED WITH GATEWAY (${config.expiresInHours}H)`
      );

      const stored: StoredAgentSession = {
        privateKey,
        agentAddress: agent.address,
        allowanceWei: allowance.toString(),
        expiresAt,
      };
      writeStoredSession(stored);
      setAgentSession(stored);
      setSessionModalOpen(false);
    },
    onError: (err: Error) =>
      log("err", `AGENT AUTHORIZATION FAILED: ${err.message}`),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["agent-allowance"] }),
  });

  const revokeAgent = useMutation({
    mutationFn: async () => {
      if (!address || !agentAccount || !publicClient) throw new Error("No agent");

      log("chain", `INITIATING revokeAgent(${short(agentAccount.address)})`);
      const txHash = await writeContractAsync({
        address: PAYGATE_ROUTER_ADDRESS,
        abi: paygateRouterAbi,
        functionName: "revokeAgent",
        args: [agentAccount.address],
      });
      log("chain", `[TX HASH] ${txHash}`);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      log(
        "ok",
        `[TX HASH] 🔴 AgentRevoked: revokeAgent(${short(agentAccount.address)}) · unspent returned`
      );

      await fetch("/api/session-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterAddress: address,
          agentAddress: agentAccount.address,
        }),
      });

      clearStoredSession();
      setAgentSession(null);
    },
    onError: (err: Error) => log("err", `REVOKE FAILED: ${err.message}`),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["agent-allowance"] }),
  });

  /** Wipe the invisible key locally without an onchain revoke (tab reset). */
  const clearLocalSession = () => {
    clearStoredSession();
    setAgentSession(null);
    log("ok", "LOCAL AGENT SESSION CLEARED FROM sessionStorage");
    queryClient.invalidateQueries({ queryKey: ["agent-allowance"] });
  };

  /* ── Card action state ────────────────────────────────── */
  const [busy, setBusy] = useState<string | null>(null);
  const [flatResult, setFlatResult] = useState<string | null>(null);
  const [geminiPrompt, setGeminiPrompt] = useState(
    "Explain HTTP 402 in one sentence."
  );
  const [geminiResult, setGeminiResult] = useState<string | null>(null);
  const [byteCounter, setByteCounter] = useState<{
    bytes: number;
    costWei: bigint;
    refundedWei: bigint;
  } | null>(null);
  const [refundResult, setRefundResult] = useState<{
    depositWei: bigint;
    refundTx: string;
    restoredWei: bigint;
  } | null>(null);

  const invalidateAllowance = () =>
    queryClient.invalidateQueries({ queryKey: ["agent-allowance"] });

  /** Shared: fetch with signed agent headers (no 402, no wallet popup). */
  const agentFetch = useCallback(
    async (endpoint: DemoEndpoint, init?: RequestInit) => {
      const live = readStoredSession();
      if (!live) {
        setAgentSession(null);
        throw new Error("Agent session expired or missing — authorize again");
      }
      if (!agentAccount || agentAccount.address.toLowerCase() !== live.agentAddress.toLowerCase()) {
        throw new Error("Agent account mismatch — clear session and re-authorize");
      }
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = await agentAccount.signMessage({
        message: agentSessionMessage(endpoint.id, timestamp),
      });
      log(
        "out",
        `INVISIBLE WALLET SIGN — X-Agent-Address ${short(agentAccount.address)} · bypassing 402`
      );
      return fetch(endpoint.proxyUrl, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          "X-Agent-Address": agentAccount.address,
          "X-Agent-Signature": signature,
          "X-Agent-Timestamp": timestamp,
        },
      });
    },
    [agentAccount, log]
  );

  /* ── Card 1: flat-rate 402 upgrade ────────────────────── */
  const runFlat = async () => {
    if (!endpoints || !publicClient || !address) return;
    const endpoint = endpoints.flat;
    setBusy("flat");
    setFlatResult(null);
    try {
      log("out", `FETCH REQUEST sent to Proxy URL ${endpoint.proxyUrl}`);

      let response: Response;

      if (agentActive) {
        response = await agentFetch(endpoint);
      } else {
        const first = await fetch(endpoint.proxyUrl);
        log("in", `RECEIVING ${first.status} PAYMENT REQUIRED`);
        if (first.status !== 402) throw new Error(`Expected 402, got ${first.status}`);

        const requirements = (await first.json()) as PaymentRequiredBody;
        log("raw", JSON.stringify(requirements, null, 2));

        const accept = requirements.accepts[0];
        const amount = BigInt(accept.amount);
        log(
          "chain",
          `INITIATING ONCHAIN CONTRACT TRANSACTION processPayment(${short(accept.extra.developer)}) value=${fmtMon(amount)} MON`
        );
        const txHash = await writeContractAsync({
          address: accept.payTo as `0x${string}`,
          abi: paygateRouterAbi,
          functionName: "processPayment",
          args: [accept.extra.developer as `0x${string}`],
          value: amount,
        });
        log("chain", `[TX HASH] ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        log(
          "ok",
          `[TX HASH] 🟢 PaymentSettled: ${fmtMon(amount)} MON · processPayment()`
        );

        log("out", "FORWARDING UPSTREAM — retrying with Payment-Signature");
        response = await fetch(endpoint.proxyUrl, {
          headers: {
            "Payment-Signature": encodeBase64Json({ txHash, payer: address }),
          },
        });
      }

      const bodyText = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${bodyText}`);

      const settlement = response.headers.get("x-paygate-settlement");
      log("in", `FORWARDED RESPONSE ${bodyText.length} bytes captured`);
      log(
        "ok",
        `FINAL STATUS: [200 OK]${settlement ? ` · settlement ${settlement}` : ""}`
      );
      setFlatResult(bodyText);
      invalidateAllowance();
    } catch (err) {
      log("err", `FINAL STATUS: [FAILED] ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  /** Shared metered escrow runner (used by Gemini + corrupted stream).
   *  Never call while an agent session is active — agent paths must skip
   *  depositEscrow and settle via chargeAgent instead. */
  const runEscrow = async (
    endpoint: DemoEndpoint,
    init: RequestInit | undefined,
    onSettled: (payload: {
      status: number;
      bodyText: string;
      paymentResponse: Record<string, unknown> | null;
      refundTx: string | null;
      depositWei: bigint;
      /** Explicit refund / restore amount for UI (not raw RPC delta). */
      restoredWei: bigint;
      balanceDeltaWei: bigint;
    }) => void
  ) => {
    if (!publicClient || !address) return;
    if (agentActive) {
      throw new Error(
        "Agent session active — skip depositEscrow; use X-Agent-Signature path"
      );
    }

    log("out", `FETCH REQUEST sent to Proxy URL ${endpoint.proxyUrl}`);
    const first = await fetch(endpoint.proxyUrl, init);
    log("in", `RECEIVING ${first.status} PAYMENT REQUIRED`);
    if (first.status !== 402) throw new Error(`Expected 402, got ${first.status}`);

    const requirements = (await first.json()) as PaymentRequiredBody;
    log("raw", JSON.stringify(requirements, null, 2));

    const accept = requirements.accepts[0];
    const requestId = accept.extra.requestId as `0x${string}`;
    const deposit = BigInt(accept.extra.maxDepositWei ?? accept.amount);

    log(
      "chain",
      `INITIATING ONCHAIN CONTRACT TRANSACTION depositEscrow(dev, ${short(requestId)}) value=${fmtMon(deposit)} MON`
    );
    const depositTx = await writeContractAsync({
      address: accept.payTo as `0x${string}`,
      abi: paygateRouterAbi,
      functionName: "depositEscrow",
      args: [accept.extra.developer as `0x${string}`, requestId],
      value: deposit,
    });
    log("chain", `[TX HASH] ${depositTx}`);
    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    log(
      "ok",
      `[TX HASH] 🔒 EscrowHeld: ${fmtMon(deposit)} MON · depositEscrow(${short(requestId)})`
    );

    const [, , , active] = await publicClient.readContract({
      address: accept.payTo as `0x${string}`,
      abi: paygateRouterAbi,
      functionName: "escrows",
      args: [requestId],
    });
    log(
      "in",
      `VERIFYING ESCROW STATE: [${active ? "HELD" : "INACTIVE"}] · requestId ${short(requestId)}`
    );

    const balanceBefore = await publicClient.getBalance({ address });

    log("out", "FORWARDING UPSTREAM — retrying with Payment-Signature");
    const second = await fetch(endpoint.proxyUrl, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "Payment-Signature": encodeBase64Json({
          txHash: depositTx,
          requestId,
          payer: address,
        }),
      },
    });

    const bodyText = await second.text();
    const paymentHeader = second.headers.get("x-payment-response");
    const paymentResponse = paymentHeader
      ? (JSON.parse(atob(paymentHeader)) as Record<string, unknown>)
      : null;
    const refundTx = second.headers.get("x-paygate-refund");

    // Prefer explicit onchain refund metadata over sequential RPC balance
    // snapshots (those lag and produce "+0 MON" after refundEscrow).
    let restoredWei = 0n;
    if (refundTx) {
      try {
        const parsed = JSON.parse(bodyText) as {
          refund?: { amountWei?: string };
        };
        if (parsed.refund?.amountWei) {
          restoredWei = BigInt(parsed.refund.amountWei);
        }
      } catch {
        /* body may be non-JSON */
      }
      if (restoredWei === 0n) {
        restoredWei = deposit;
      }
      try {
        await publicClient.waitForTransactionReceipt({
          hash: refundTx as `0x${string}`,
        });
      } catch {
        /* gateway already waited; RPC may have the receipt */
      }
      // Brief settle window so the next balance read reflects the refund.
      await new Promise((r) => setTimeout(r, 1500));
    } else if (paymentResponse?.refundedWei) {
      restoredWei = BigInt(paymentResponse.refundedWei as string);
      const settleHash =
        typeof paymentResponse.txHash === "string"
          ? (paymentResponse.txHash as `0x${string}`)
          : null;
      if (settleHash) {
        try {
          await publicClient.waitForTransactionReceipt({ hash: settleHash });
        } catch {
          /* already confirmed by gateway */
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    const balanceAfter = await publicClient.getBalance({ address });

    onSettled({
      status: second.status,
      bodyText,
      paymentResponse,
      refundTx,
      depositWei: deposit,
      restoredWei,
      balanceDeltaWei: balanceAfter - balanceBefore,
    });
  };

  /* ── Card 2: Dynamic Payload Metering (The Taxi Meter Pattern) ── */
  const runGemini = async () => {
    if (!endpoints) return;
    const endpoint = endpoints.metered;
    setBusy("metered");
    setGeminiResult(null);
    setByteCounter(null);
    try {
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: geminiPrompt }),
      };

      if (agentActive) {
        const response = await agentFetch(endpoint, init);
        const bodyText = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${bodyText}`);
        const header = response.headers.get("x-payment-response");
        const decoded = header
          ? (JSON.parse(atob(header)) as Record<string, unknown>)
          : null;
        const bytes = Number(decoded?.responseBytes ?? bodyText.length);
        const cost = BigInt((decoded?.costWei as string) ?? "0");
        animateBytes(bytes, cost, 0n);
        const chargeTx = typeof decoded?.txHash === "string" ? decoded.txHash : null;
        if (chargeTx) log("chain", `[TX HASH] ${chargeTx}`);
        log(
          "ok",
          `[TX HASH] 🟢 AgentCharged: ${fmtMon(cost)} MON · chargeAgent() · ${bytes} bytes`
        );
        log("ok", "FINAL STATUS: [200 OK / CHARGED VIA SESSION KEY]");
        setGeminiResult(parseGeminiText(bodyText));
        invalidateAllowance();
        return;
      }

      await runEscrow(endpoint, init, (result) => {
        if (result.status >= 400) {
          if (result.refundTx) {
            log("chain", `[TX HASH] ${result.refundTx}`);
            log(
              "err",
              `[TX HASH] 🔴 EscrowRefunded: ${fmtMon(result.depositWei)} MON · refundEscrow()`
            );
          }
          log(
            "err",
            `FINAL STATUS: [${result.status} ERROR / ESCROW ${result.refundTx ? "REFUNDED" : "HELD"}]`
          );
          setGeminiResult(result.bodyText);
          return;
        }
        const bytes = Number(result.paymentResponse?.responseBytes ?? 0);
        const cost = BigInt((result.paymentResponse?.actualCostWei as string) ?? "0");
        const refunded = BigInt(
          (result.paymentResponse?.refundedWei as string) ?? "0"
        );
        const settleTx =
          typeof result.paymentResponse?.txHash === "string"
            ? result.paymentResponse.txHash
            : null;
        animateBytes(bytes, cost, refunded);
        log(
          "in",
          `METERED ${bytes} BYTES → COST ${fmtMon(cost)} MON · REFUNDED ${fmtMon(refunded)} MON`
        );
        if (settleTx) {
          log("chain", `[TX HASH] ${settleTx}`);
          log(
            "ok",
            `[TX HASH] 🟢 EscrowReleased: ${fmtMon(cost)} MON settled · ${fmtMon(refunded)} MON refunded · settleEscrow()`
          );
        }
        log("ok", "FINAL STATUS: [200 OK / ESCROW RELEASED]");
        setGeminiResult(parseGeminiText(result.bodyText));
      });
    } catch (err) {
      log("err", `FINAL STATUS: [FAILED] ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  function parseGeminiText(bodyText: string): string {
    try {
      const data = JSON.parse(bodyText);
      return data.text ?? bodyText;
    } catch {
      return bodyText;
    }
  }

  /** Animates the live byte/cost counter up to the settled values. */
  const animateBytes = (bytes: number, costWei: bigint, refundedWei: bigint) => {
    const steps = 24;
    let step = 0;
    const tick = () => {
      step++;
      const ratio = step / steps;
      setByteCounter({
        bytes: Math.round(bytes * ratio),
        costWei: (costWei * BigInt(step)) / BigInt(steps),
        refundedWei: step === steps ? refundedWei : 0n,
      });
      if (step < steps) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /* ── Card 3: Deterministic SLA Escrows (The Vending Machine Pattern) ── */
  const runCorrupted = async () => {
    if (!endpoints) return;
    setBusy("corrupted");
    setRefundResult(null);
    try {
      // Agent session takes absolute precedence — never depositEscrow.
      if (agentActive) {
        const response = await agentFetch(endpoints.corrupted);
        const bodyText = await response.text();
        log(
          "in",
          `AGENT BYPASS · HTTP ${response.status} · no depositEscrow (SLA charge skipped on 5xx)`
        );
        if (response.status >= 500 || response.status === 502) {
          log("err", "FINAL STATUS: [UPSTREAM FAILED / SESSION NOT CHARGED]");
        } else {
          log("ok", `FINAL STATUS: [HTTP ${response.status}]`);
        }
        log("raw", bodyText.slice(0, 400));
        invalidateAllowance();
        return;
      }

      await runEscrow(endpoints.corrupted, undefined, (result) => {
        if (result.refundTx) {
          const restored =
            result.restoredWei > 0n ? result.restoredWei : result.depositWei;
          log("in", `CAUGHT X-PayGate-Refund HEADER: ${result.refundTx}`);
          log("chain", `[TX HASH] ${result.refundTx}`);
          log(
            "err",
            `[TX HASH] 🔴 EscrowRefunded: ${fmtMon(restored)} MON · refundEscrow()`
          );
          log(
            "in",
            `WALLET BALANCE RESTORED: +${fmtMon(restored)} MON (from refund metadata)`
          );
          log("err", "FINAL STATUS: [500 ERROR / ESCROW REFUNDED]");
          setRefundResult({
            depositWei: result.depositWei,
            refundTx: result.refundTx,
            restoredWei: restored,
          });
        } else {
          log("err", `FINAL STATUS: [${result.status}] no refund header`);
        }
      });
    } catch (err) {
      log("err", `FINAL STATUS: [FAILED] ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  /* ── Render ───────────────────────────────────────────── */

  const remaining = agentRemaining ?? 0n;
  const allowancePct =
    agentActive && maxAllowanceWei > 0n
      ? Number((remaining * 100n) / maxAllowanceWei)
      : 0;

  const expiresLabel = agentSession
    ? new Date(agentSession.expiresAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col border-x-2 border-zinc-800">
        {/* ── SECTION A: infrastructure header ─────────────── */}
        <header className="border-b-2 border-zinc-800">
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-4">
              <span className="font-mono text-lg font-bold tracking-tight">
                PAY<span className="text-acid">/</span>GATE
              </span>
              <span className="hidden border-2 border-zinc-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:block">
                Storefront Demo · Live x402
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden border-2 border-zinc-700 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground md:block">
                Monad Testnet · 10143
              </span>
              <button
                type="button"
                onClick={() => open()}
                className="inline-flex items-center gap-2 border-2 border-acid bg-acid px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid"
              >
                <Wallet className="size-3.5" />
                {isConnected && address ? short(address, 6, 4) : "Connect Wallet"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 border-t-2 border-zinc-800 md:grid-cols-3">
            <InfraCell
              label="Router Contract"
              value={PAYGATE_ROUTER_ADDRESS}
              href={`${EXPLORER}/address/${PAYGATE_ROUTER_ADDRESS}`}
            />
            <InfraCell label="RPC" value="testnet-rpc.monad.xyz" />
            <InfraCell label="Protocol Fee" value="200 BPS · 2%" accent />
          </div>

          {/* Delegated Session Allowances sub-panel */}
          <div className="flex flex-col gap-3 border-t-2 border-zinc-800 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Bot className={cn("size-4", agentActive ? "text-acid" : "text-muted-foreground")} />
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest text-acid">
                  Delegated Session Allowances{" "}
                  <span className={agentActive ? "text-acid" : "text-muted-foreground"}>
                    [{agentActive ? "ACTIVE" : "INACTIVE"}]
                  </span>
                </p>
                <p className="mt-0.5 text-xs italic text-muted-foreground">
                  (The Corporate Card Pattern)
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {agentActive && agentAccount
                    ? `Invisible key ${short(agentAccount.address, 8, 6)} · zero popups · expires ${expiresLabel}`
                    : "Issue a pre-authorized corporate expense limit to an autonomous agent"}
                </p>
              </div>
            </div>

            {agentActive ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-56">
                  <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>Remaining Allowance</span>
                    <span className="text-acid">
                      {fmtMon(remaining)} / {fmtMon(maxAllowanceWei)} MON
                    </span>
                  </div>
                  <div className="mt-1 h-2 border-2 border-zinc-700">
                    <div
                      className="h-full bg-acid transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, allowancePct))}%` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearLocalSession}
                  className="border-2 border-zinc-700 px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-zinc-500 hover:text-foreground"
                >
                  Clear Session
                </button>
                <button
                  type="button"
                  disabled={revokeAgent.isPending}
                  onClick={() => revokeAgent.mutate()}
                  className="border-2 border-red-500 px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-red-500 transition-colors hover:bg-red-500 hover:text-background disabled:opacity-40"
                >
                  {revokeAgent.isPending ? "Revoking…" : "Revoke Onchain"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!isConnected}
                onClick={() => setSessionModalOpen(true)}
                className="border-2 border-zinc-600 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors hover:border-acid hover:text-acid disabled:opacity-40"
              >
                Authorize Corporate Card
              </button>
            )}
          </div>
        </header>

        {/* ── SECTION B: marketplace grid ───────────────────── */}
        <main className="grid flex-1 grid-cols-1 lg:grid-cols-3">
          {/* Card 1: flat */}
          <DemoCard
            icon={<Languages className="size-4" />}
            title="Instant Translation API"
            subtitle="Flat rate · exact-native scheme"
            badge="0.01 MON / CALL"
            ready={!!endpoints && isConnected}
            busy={busy === "flat"}
            actionLabel="Execute Call"
            onAction={runFlat}
          >
            {flatResult && (
              <ResultBlock label="Proxied upstream payload" text={flatResult} />
            )}
          </DemoCard>

          {/* Card 2: Dynamic Payload Metering (The Taxi Meter Pattern) */}
          <DemoCard
            icon={<Sparkles className="size-4" />}
            title="Dynamic Payload Metering"
            subtitle="(The Taxi Meter Pattern)"
            badge="0.000001 MON / BYTE"
            ready={!!endpoints && isConnected}
            busy={busy === "metered"}
            actionLabel="Stream Response"
            onAction={runGemini}
          >
            <input
              value={geminiPrompt}
              onChange={(e) => setGeminiPrompt(e.target.value)}
              placeholder="Custom prompt for Gemini…"
              className="w-full border-2 border-zinc-700 bg-transparent px-3 py-2 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-acid"
            />
            {byteCounter && (
              <div className="grid grid-cols-3 divide-x-2 divide-zinc-800 border-2 border-zinc-800">
                <Metric label="Bytes" value={byteCounter.bytes.toLocaleString()} />
                <Metric label="Cost" value={`${fmtMon(byteCounter.costWei)} MON`} accent />
                <Metric
                  label="Refunded"
                  value={`${fmtMon(byteCounter.refundedWei)} MON`}
                />
              </div>
            )}
            {geminiResult && (
              <ResultBlock
                label="Gemini response"
                text={geminiResult}
              />
            )}
          </DemoCard>

          {/* Card 3: Deterministic SLA Escrows (The Vending Machine Pattern) */}
          <DemoCard
            icon={<ShieldAlert className="size-4 text-red-500" />}
            title="Deterministic SLA Escrows"
            subtitle="(The Vending Machine Pattern)"
            badge="0.02 MON DEPOSIT"
            badgeTone="red"
            ready={!!endpoints && isConnected}
            busy={busy === "corrupted"}
            actionLabel="Fetch Payload"
            actionTone="red"
            onAction={runCorrupted}
          >
            {refundResult && (
              <div className="border-2 border-red-500/60 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-red-500">
                  Upstream 500 · Escrow Refunded
                </p>
                <dl className="mt-2 space-y-1 font-mono text-[11px]">
                  <Row k="Deposit locked" v={`${fmtMon(refundResult.depositWei)} MON`} />
                  <Row
                    k="Refund tx"
                    v={short(refundResult.refundTx, 12, 8)}
                    href={`${EXPLORER}/tx/${refundResult.refundTx}`}
                  />
                  <Row
                    k="Balance restored"
                    v={`+${fmtMon(refundResult.restoredWei)} MON`}
                  />
                </dl>
              </div>
            )}
          </DemoCard>
        </main>

        {/* ── SECTION C: pipeline inspector ─────────────────── */}
        <section className="border-t-2 border-zinc-800">
          <Accordion defaultValue={["pipeline"]}>
            <AccordionItem value="pipeline" className="border-0">
              <div className="flex items-center justify-between border-b-2 border-zinc-800 px-6">
                <AccordionTrigger className="flex-1 rounded-none py-3 hover:no-underline **:data-[slot=accordion-trigger-icon]:text-acid">
                  <div className="flex items-center gap-2">
                    <TerminalSquare className="size-4 text-acid" />
                    <span className="font-mono text-xs font-bold uppercase tracking-widest">
                      Protocol Pipeline &amp; State Inspector
                    </span>
                    {lines.length > 0 && (
                      <span className="border border-zinc-700 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                        {lines.length} lines
                      </span>
                    )}
                  </div>
                </AccordionTrigger>
                <div
                  className="flex items-center gap-2 py-3 pl-3"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <InlineCopyButton
                    value={lines
                      .map((l) => `[${l.ts}] ${l.kind.toUpperCase()} ${l.text}`)
                      .join("\n")}
                    disabled={lines.length === 0}
                    label="Pipeline copied"
                  />
                  <button
                    type="button"
                    onClick={() => setLines([])}
                    disabled={lines.length === 0}
                    className="inline-flex size-7 items-center justify-center border-2 border-zinc-700 text-muted-foreground transition-colors hover:border-red-500 hover:text-red-500 disabled:opacity-40"
                    aria-label="Clear pipeline"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <AccordionContent className="pb-0">
                <div
                  ref={terminalRef}
                  className="h-72 overflow-y-auto bg-black/40 px-6 py-4 font-mono text-[11px] leading-relaxed"
                >
                  {lines.length === 0 ? (
                    <p className="text-muted-foreground">
                      <span className="text-acid">$</span> awaiting protocol
                      activity — trigger a marketplace action above…
                    </p>
                  ) : (
                    lines.map((line) => (
                      <TerminalLine key={line.id} line={line} />
                    ))
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {!isConnected && (
          <div className="border-t-2 border-zinc-800 px-6 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Connect a wallet on Monad Testnet to provision the live demo endpoints
          </div>
        )}
      </div>

      <CreateSessionModal
        open={sessionModalOpen}
        onOpenChange={setSessionModalOpen}
        pending={authorizeAgent.isPending}
        onAuthorize={(config) => authorizeAgent.mutate(config)}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Presentational pieces
 * ──────────────────────────────────────────────────────────────────────────── */

function InfraCell({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className={cn("font-mono text-xs", accent && "text-acid")}>{value}</span>
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col gap-1 border-b-2 border-zinc-800 px-6 py-3 transition-colors last:border-b-0 hover:bg-zinc-900/50 md:border-b-0 md:border-r-2 md:last:border-r-0"
    >
      {inner}
    </a>
  ) : (
    <div className="flex flex-col gap-1 border-b-2 border-zinc-800 px-6 py-3 last:border-b-0 md:border-b-0 md:border-r-2 md:last:border-r-0">
      {inner}
    </div>
  );
}

function DemoCard({
  icon,
  title,
  subtitle,
  badge,
  badgeTone,
  ready,
  busy,
  actionLabel,
  actionTone,
  onAction,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge: string;
  badgeTone?: "red";
  ready: boolean;
  busy: boolean;
  actionLabel: string;
  actionTone?: "red";
  onAction: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b-2 border-zinc-800 p-6 lg:border-b-0 lg:border-r-2 lg:last:border-r-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h3 className="font-mono text-sm font-bold uppercase tracking-wide text-acid">
              {title}
            </h3>
            <p className="mt-0.5 text-xs italic text-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 border-2 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest",
            badgeTone === "red"
              ? "border-red-500 text-red-500"
              : "border-acid text-acid"
          )}
        >
          {badge}
        </span>
      </div>

      {!ready ? (
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse bg-zinc-800 font-mono" />
          <div className="h-4 w-1/2 animate-pulse bg-zinc-800" />
          <div className="h-9 w-full animate-pulse bg-zinc-800" />
        </div>
      ) : (
        <>
          {children}
          <button
            type="button"
            disabled={busy}
            onClick={onAction}
            className={cn(
              "mt-auto inline-flex items-center justify-center gap-2 border-2 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50",
              actionTone === "red"
                ? "border-red-500 text-red-500 hover:bg-red-500 hover:text-background"
                : "border-acid bg-acid text-primary-foreground hover:bg-transparent hover:text-acid"
            )}
          >
            {busy ? (
              <>
                <Activity className="size-3.5 animate-pulse" /> Processing…
              </>
            ) : (
              <>
                <Radio className="size-3.5" />
                {actionLabel}
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

function InlineCopyButton({
  value,
  label = "Copied",
  disabled,
}: {
  value: string;
  label?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (disabled || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be denied; ignore silently in demo */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled}
      className={cn(
        "inline-flex size-7 items-center justify-center border-2 border-zinc-700 text-muted-foreground transition-all hover:border-acid hover:text-acid disabled:opacity-40",
        copied && "border-acid text-acid"
      )}
      aria-label={label}
      title={label}
    >
      {copied ? (
        <Check className="size-3.5 animate-in fade-in zoom-in duration-200" />
      ) : (
        <Copy className="size-3.5 transition-transform group-active:scale-90" />
      )}
    </button>
  );
}

function ResultBlock({
  label,
  text,
  maxHeight = "max-h-40",
}: {
  label: string;
  text: string;
  maxHeight?: string;
}) {
  return (
    <div className="border-2 border-zinc-800">
      <div className="flex items-center justify-between border-b-2 border-zinc-800 px-3 py-1.5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <InlineCopyButton value={text} label={`${label} copied`} />
      </div>
      <pre
        className={cn(
          "overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground",
          maxHeight
        )}
      >
        {text}
      </pre>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn("font-mono text-xs font-bold", accent && "text-acid")}>
        {value}
      </p>
    </div>
  );
}

function Row({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-acid underline-offset-2 hover:underline">
            {v}
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

function TerminalLine({ line }: { line: LogLine }) {
  const prefix =
    line.kind === "out"
      ? "-->"
      : line.kind === "in"
        ? "<--"
        : line.kind === "chain"
          ? "==>"
          : line.kind === "ok"
            ? "<--"
            : line.kind === "err"
              ? "<--"
              : "   ";

  if (line.kind === "raw") {
    return (
      <pre className="my-1 max-h-48 overflow-auto whitespace-pre-wrap border-l-2 border-zinc-700 pl-3 text-zinc-500">
        {line.text}
      </pre>
    );
  }

  return (
    <p
      className={cn(
        "whitespace-pre-wrap break-all",
        line.kind === "ok" && "text-acid",
        line.kind === "err" && "text-red-500",
        line.kind === "chain" && "text-amber-300",
        (line.kind === "out" || line.kind === "in") && "text-zinc-300"
      )}
    >
      <span className="text-zinc-600">[{line.ts}]</span> {prefix} {line.text}
    </p>
  );
}
