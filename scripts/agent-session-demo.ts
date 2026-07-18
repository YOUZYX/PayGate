/**
 * PayGate agent session demo — Delegated Session Allowances
 * (The Corporate Card Pattern):
 *
 * Assumes the master wallet has ALREADY:
 *   1. Generated an ephemeral key in the Storefront UI
 *   2. Called approveAgent() onchain and registered the session with the gateway
 *
 * This script uses ONLY that ephemeral key to sign X-Agent-* headers and
 * hit a PayGate proxy — zero master wallet, zero approve/revoke, zero 402.
 *
 * Run:
 *   set AGENT_SESSION_PRIVATE_KEY=0x...   # from Storefront sessionStorage
 *   npm run demo:agent -- http://localhost:3000/api/v1/gate/<proxyId>
 */
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { normalizePrivateKey } from "../lib/platform-wallet";
import { agentSessionMessage } from "../lib/x402";

async function main() {
  const proxyUrl = process.argv[2];
  if (!proxyUrl) {
    console.error(
      "Usage: npm run demo:agent -- http://localhost:3000/api/v1/gate/<proxyId>"
    );
    process.exit(1);
  }

  const rawKey = process.env.AGENT_SESSION_PRIVATE_KEY;
  if (!rawKey) {
    console.error(
      "Error: Missing AGENT_SESSION_PRIVATE_KEY. Generate an autonomous session key in the PayGate Storefront UI, approve the onchain allowance, and set this variable."
    );
    process.exit(1);
  }

  const proxyId = proxyUrl.split("/").filter(Boolean).pop()!;
  const agent = privateKeyToAccount(normalizePrivateKey(rawKey));

  console.log(`\n$ npm run demo:agent -- ${proxyUrl}`);
  console.log(`[AGENT] Waking up...`);
  console.log(`[AGENT] Identity: ${agent.address} (Ephemeral Session Key)`);

  console.log(`[AGENT] Signing request payload...`);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await agent.signMessage({
    message: agentSessionMessage(proxyId, timestamp),
  });

  console.log(`[AGENT] Executing proxied call...`);
  const res = await fetch(proxyUrl, {
    headers: {
      "X-Agent-Address": agent.address,
      "X-Agent-Signature": signature,
      "X-Agent-Timestamp": timestamp,
    },
  });

  const body = await res.text();
  if (res.status !== 200) {
    console.error(`-> HTTP ${res.status}`);
    console.error(body);
    process.exit(1);
  }

  console.log(`-> HTTP 200 OK`);

  const paymentHeader = res.headers.get("x-payment-response");
  const settlement = res.headers.get("x-paygate-settlement");
  if (paymentHeader) {
    try {
      const decoded = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf8")
      ) as { txHash?: string; costWei?: string };
      const tx = decoded.txHash ?? settlement ?? "n/a";
      const cost =
        decoded.costWei != null
          ? `${formatEther(BigInt(decoded.costWei))} MON`
          : "n/a";
      console.log(`-> Settled Onchain: ${tx} (Cost: ${cost})`);
    } catch {
      console.log(
        `-> Settled Onchain: ${settlement ?? "n/a"} (Cost: n/a)`
      );
    }
  } else if (settlement) {
    console.log(`-> Settled Onchain: ${settlement} (Cost: n/a)`);
  }

  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
