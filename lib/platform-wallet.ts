import {
  createWalletClient,
  http,
  type Account,
  type Chain,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "@/lib/chain";

/**
 * Server-only platform relayer wallet — the PayGateRouter `owner`.
 * Used exclusively by the gateway to submit gas-paying settlement txs:
 * chargeAgent, settleEscrow, and refundEscrow.
 *
 * Funded independently of any consumer / master wallet. Never import
 * this module from client code.
 */
let cached: WalletClient<Transport, Chain, Account> | null = null;

/** Strip quotes/whitespace and normalize to a 0x-prefixed 32-byte hex key. */
export function normalizePrivateKey(raw: string): `0x${string}` {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (!key.startsWith("0x") && !key.startsWith("0X")) {
    key = `0x${key}`;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "Private key must be a 32-byte hex string (0x + 64 hex chars). Check .env for typos — only 0-9 and a-f are valid."
    );
  }
  return key.toLowerCase() as `0x${string}`;
}

export function getPlatformWallet(): WalletClient<Transport, Chain, Account> {
  if (cached) return cached;

  const raw = process.env.PAYGATE_RELAYER_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "Server Configuration Error: Missing PAYGATE_RELAYER_PRIVATE_KEY for onchain settlement."
    );
  }

  cached = createWalletClient({
    account: privateKeyToAccount(normalizePrivateKey(raw)),
    chain: monadTestnet,
    transport: http(),
  });
  return cached;
}
