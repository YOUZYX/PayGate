/**
 * PayGate consumer demo — proves the x402 loop end-to-end:
 *   1. GET the proxy URL          → 402 with MON payment requirements
 *   2. processPayment(developer)  → pay the price in native MON on Monad Testnet
 *   3. Retry with Payment-Signature → 200 with the proxied payload
 *
 * Run: npm run demo:consumer -- http://localhost:3000/api/v1/gate/<proxyId>
 * Requires TEST_CONSUMER_PRIVATE_KEY in .env to simulate a customer wallet transaction.
 */
import { createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, publicClient } from "../lib/chain";
import { paygateRouterAbi } from "../lib/contract";
import { normalizePrivateKey } from "../lib/platform-wallet";
import {
  encodeBase64Json,
  type PaymentRequiredBody,
} from "../lib/x402";

async function main() {
  const proxyUrl = process.argv[2];
  if (!proxyUrl) {
    console.error(
      "Usage: npm run demo:consumer -- <proxy URL>\n" +
        "e.g.   npm run demo:consumer -- http://localhost:3000/api/v1/gate/<proxyId>"
    );
    process.exit(1);
  }

  const rawKey = process.env.TEST_CONSUMER_PRIVATE_KEY;
  if (!rawKey) {
    console.error(
      "Requires TEST_CONSUMER_PRIVATE_KEY in .env to simulate a customer wallet transaction."
    );
    process.exit(1);
  }
  const account = privateKeyToAccount(normalizePrivateKey(rawKey));

  console.log(`Consumer wallet: ${account.address}`);
  console.log(`\n[1/4] GET ${proxyUrl} (no payment)`);

  const first = await fetch(proxyUrl);
  console.log(`      → HTTP ${first.status}`);
  if (first.status !== 402) {
    console.error(`Expected 402, got ${first.status}:`);
    console.error(await first.text());
    process.exit(1);
  }

  const requirements = (await first.json()) as PaymentRequiredBody;
  const accept = requirements.accepts?.[0];
  if (!accept) {
    console.error("402 body is missing accepts[0]:", requirements);
    process.exit(1);
  }

  const routerAddress = (accept.payTo ||
    process.env.NEXT_PUBLIC_PAYGATE_ROUTER) as `0x${string}`;
  const developer = accept.extra.developer as `0x${string}`;
  const amount = BigInt(accept.amount);

  console.log(`      network:   ${accept.network} (${accept.asset})`);
  console.log(`      price:     ${formatEther(amount)} MON (${accept.amount} wei)`);
  console.log(`      payTo:     ${routerAddress}`);
  console.log(`      developer: ${developer}`);

  console.log(`\n[2/4] Sending processPayment(${developer}) with ${formatEther(amount)} MON...`);

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  const txHash = await walletClient.writeContract({
    address: routerAddress,
    abi: paygateRouterAbi,
    functionName: "processPayment",
    args: [developer],
    value: amount,
  });
  console.log(`      tx: ${txHash}`);

  console.log(`\n[3/4] Waiting for confirmation...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`      confirmed in block ${receipt.blockNumber} (status: ${receipt.status})`);
  if (receipt.status !== "success") {
    console.error("Payment transaction reverted.");
    process.exit(1);
  }

  console.log(`\n[4/4] Retrying with Payment-Signature header...`);
  const paymentSignature = encodeBase64Json({ txHash, payer: account.address });
  const second = await fetch(proxyUrl, {
    headers: { "Payment-Signature": paymentSignature },
  });

  console.log(`      → HTTP ${second.status}`);
  const paymentResponse = second.headers.get("x-payment-response");
  if (paymentResponse) {
    console.log(`      X-Payment-Response: ${paymentResponse}`);
    console.log(
      `      (decoded: ${Buffer.from(paymentResponse, "base64").toString("utf8")})`
    );
  }
  const settlement = second.headers.get("x-paygate-settlement");
  if (settlement) {
    console.log(`      X-PayGate-Settlement: ${settlement}`);
  }

  const bodyText = await second.text();
  console.log(`\nResponse body:\n${bodyText}`);

  if (second.ok) {
    console.log("\nDemo complete: 402 → pay MON → 200.");
  } else {
    console.error("\nDemo failed: retry did not succeed.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
