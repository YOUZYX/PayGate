import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Idempotently provisions the three storefront demo endpoints under the
 * connected wallet's developer account, so every card on /demo/storefront
 * hits a real proxy row in the database. Re-running returns the same rows.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const walletAddress =
    typeof body?.walletAddress === "string"
      ? body.walletAddress.toLowerCase()
      : "";

  if (!WALLET_RE.test(walletAddress)) {
    return NextResponse.json({ error: "Invalid walletAddress" }, { status: 400 });
  }

  const developer = await prisma.developer.upsert({
    where: { walletAddress },
    create: { walletAddress },
    update: {},
  });

  const origin = req.nextUrl.origin;

  const specs = [
    {
      key: "flat",
      name: "[DEMO] Instant Translation API",
      targetApiUrl:
        "https://api.mymemory.translated.net/get?q=Onchain%20payments%20settled%20instantly&langpair=en|es",
      billingType: "FLAT",
      priceWei: parseEther("0.01").toString(),
      pricePerByteWei: null as string | null,
    },
    {
      key: "metered",
      name: "[DEMO] Dynamic Payload Metering",
      targetApiUrl: `${origin}/api/demo/gemini`,
      billingType: "METERED",
      priceWei: "0",
      pricePerByteWei: parseEther("0.000001").toString(),
    },
    {
      key: "corrupted",
      name: "[DEMO] Deterministic SLA Escrows",
      // Intentionally failing upstream to prove Deterministic SLA Escrows
      // (The Vending Machine Pattern) — automatic escrow refund on 5xx.
      targetApiUrl: "https://httpstat.us/500",
      billingType: "METERED",
      priceWei: "0",
      pricePerByteWei: parseEther("0.000001").toString(),
    },
  ];

  const endpoints: Record<
    string,
    {
      id: string;
      name: string;
      proxyUrl: string;
      billingType: string;
      priceWei: string;
      pricePerByteWei: string | null;
      developer: string;
    }
  > = {};

  for (const spec of specs) {
    const existing = await prisma.endpoint.findFirst({
      where: { developerId: developer.id, name: spec.name },
    });

    const endpoint =
      existing ??
      (await prisma.endpoint.create({
        data: {
          name: spec.name,
          targetApiUrl: spec.targetApiUrl,
          billingType: spec.billingType,
          priceWei: spec.priceWei,
          pricePerByteWei: spec.pricePerByteWei,
          developerId: developer.id,
        },
      }));

    // Keep demo targets current (e.g. origin changes between dev ports).
    if (existing && existing.targetApiUrl !== spec.targetApiUrl) {
      await prisma.endpoint.update({
        where: { id: existing.id },
        data: { targetApiUrl: spec.targetApiUrl },
      });
    }

    endpoints[spec.key] = {
      id: endpoint.id,
      name: endpoint.name,
      proxyUrl: `${origin}/api/v1/gate/${endpoint.id}`,
      billingType: spec.billingType,
      priceWei: spec.priceWei,
      pricePerByteWei: spec.pricePerByteWei,
      developer: walletAddress,
    };
  }

  return NextResponse.json({ endpoints });
}
