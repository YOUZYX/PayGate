import { NextRequest } from "next/server";
import type { Developer } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

export type DeveloperAuthResult =
  | { ok: true; developer: Developer }
  | {
      ok: false;
      error: "unauthorized" | "invalid_wallet" | "not_found";
      status: 401 | 400 | 404;
    };

/**
 * Resolve a developer from either:
 *   Authorization: Bearer pg_...
 * or a wallet address query/body field (dashboard path).
 */
export async function resolveDeveloper(
  req: NextRequest,
  walletHint?: string
): Promise<DeveloperAuthResult> {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (bearer?.startsWith("pg_")) {
    const developer = await prisma.developer.findUnique({
      where: { apiKey: bearer },
    });
    if (!developer) {
      return { ok: false, error: "unauthorized", status: 401 };
    }
    return { ok: true, developer };
  }

  // Explicit Bearer that isn't a PayGate key → hard 401 (don't fall through
  // to wallet auth and silently ignore a mistyped token).
  if (auth.toLowerCase().startsWith("bearer ")) {
    return { ok: false, error: "unauthorized", status: 401 };
  }

  const wallet = (walletHint ?? "").toLowerCase();
  if (!WALLET_RE.test(wallet)) {
    return { ok: false, error: "invalid_wallet", status: 400 };
  }

  const developer = await prisma.developer.findUnique({
    where: { walletAddress: wallet },
  });
  if (!developer) {
    return { ok: false, error: "not_found", status: 404 };
  }
  return { ok: true, developer };
}

export { WALLET_RE };
