/**
 * PayGate metered escrow demo —
 * Dynamic Payload Metering (The Taxi Meter Pattern) +
 * Deterministic SLA Escrows (The Vending Machine Pattern):
 *   1. GET the metered proxy URL → 402 with pricePerByteWei, maxDepositWei,
 *      and a server-generated requestId.
 *   2. depositEscrow(developer, requestId) with value = maxDepositWei.
 *   3. Retry with Payment-Signature: base64({txHash, requestId, payer}) —
 *      the gateway meters the exact response bytes, settles the actual
 *      cost onchain, and the contract instantly refunds the remainder.
 *
 * Run: npm run demo:metered -- http://localhost:3000/api/v1/gate/<proxyId>
 * Requires TEST_CONSUMER_PRIVATE_KEY in .env to simulate a customer wallet transaction.
 */
import { createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, publicClient } from "../lib/chain";
import { paygateRouterAbi } from "../lib/contract";
import { normalizePrivateKey } from "../lib/platform-wallet";
import { encodeBase64Json, type PaymentRequiredBody } from "../lib/x402";

async function main() {
  const proxyUrl = process.argv[2];
  if (!proxyUrl) {
    console.error(
      "Usage: npm run demo:metered -- http://localhost:3000/api/v1/gate/<proxyId>"
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
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  console.log(`Consumer wallet: ${account.address}`);
  console.log(`\n[1/4] GET ${proxyUrl} (no payment)`);

  const first = await fetch(proxyUrl);
  console.log(`      → HTTP ${first.status}`);
  if (first.status !== 402) {
    console.error(`Expected 402, got ${first.status}:`, await first.text());
    process.exit(1);
  }

  const requirements = (await first.json()) as PaymentRequiredBody;
  const accept = requirements.accepts?.[0];
  if (!accept || accept.scheme !== "metered-escrow") {
    console.error("Endpoint is not metered-escrow:", requirements);
    process.exit(1);
  }

  const routerAddress = accept.payTo as `0x${string}`;
  const developer = accept.extra.developer as `0x${string}`;
  const requestId = accept.extra.requestId!;
  const maxDeposit = BigInt(accept.extra.maxDepositWei!);

  console.log(`      scheme:        ${accept.scheme}`);
  console.log(`      price/byte:    ${accept.extra.pricePerByteWei} wei`);
  console.log(`      max deposit:   ${formatEther(maxDeposit)} MON`);
  console.log(`      requestId:     ${requestId}`);

  console.log(`\n[2/4] depositEscrow(${developer}, requestId) with ${formatEther(maxDeposit)} MON...`);
  const depositTx = await walletClient.writeContract({
    address: routerAddress,
    abi: paygateRouterAbi,
    functionName: "depositEscrow",
    args: [developer, requestId],
    value: maxDeposit,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: depositTx,
  });
  console.log(`      tx: ${depositTx} (block ${receipt.blockNumber})`);

  console.log(`\n[3/4] Retrying with Payment-Signature (deposit tx + requestId)...`);
  const balanceBefore = await publicClient.getBalance({
    address: account.address,
  });

  const second = await fetch(proxyUrl, {
    headers: {
      "Payment-Signature": encodeBase64Json({
        txHash: depositTx,
        requestId,
        payer: account.address,
      }),
    },
  });
  console.log(`      → HTTP ${second.status}`);

  const paymentResponse = second.headers.get("x-payment-response");
  if (paymentResponse) {
    const decoded = JSON.parse(
      Buffer.from(paymentResponse, "base64").toString("utf8")
    );
    console.log(`      settle tx:     ${decoded.txHash}`);
    console.log(`      responseBytes: ${decoded.responseBytes}`);
    console.log(
      `      actual cost:   ${formatEther(BigInt(decoded.actualCostWei))} MON`
    );
    console.log(
      `      refunded:      ${formatEther(BigInt(decoded.refundedWei))} MON (instant)`
    );
  }

  const bodyText = await second.text();
  console.log(
    `\nResponse body (${bodyText.length} chars):\n${bodyText.slice(0, 300)}${bodyText.length > 300 ? "…" : ""}`
  );

  console.log(`\n[4/4] Verifying escrow state onchain...`);
  const [, , amount, active] = await publicClient.readContract({
    address: routerAddress,
    abi: paygateRouterAbi,
    functionName: "escrows",
    args: [requestId],
  });
  console.log(`      escrow active: ${active} (amount: ${formatEther(amount)} MON)`);

  const balanceAfter = await publicClient.getBalance({
    address: account.address,
  });
  console.log(
    `      consumer balance delta since retry: ${formatEther(balanceAfter - balanceBefore)} MON (refund received)`
  );

  if (second.ok && !active) {
    console.log(
      "\nDemo complete: 402 → escrow deposit → metered settle → instant refund."
    );
  } else {
    console.error("\nDemo failed.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
