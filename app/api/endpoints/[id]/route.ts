import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function findOwnedEndpoint(id: string, walletAddress: string) {
  if (!WALLET_RE.test(walletAddress)) return null;
  const endpoint = await prisma.endpoint.findUnique({
    where: { id },
    include: { developer: true },
  });
  if (
    !endpoint ||
    endpoint.developer.walletAddress !== walletAddress.toLowerCase()
  ) {
    return null;
  }
  return endpoint;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const walletAddress =
    typeof body?.walletAddress === "string" ? body.walletAddress : "";

  const endpoint = await findOwnedEndpoint(id, walletAddress);
  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  }

  const data: {
    active?: boolean;
    name?: string;
    priceWei?: string;
    targetApiUrl?: string;
    billingType?: string;
    pricePerByteWei?: string;
  } = {};

  if (typeof body?.active === "boolean") data.active = body.active;

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 }
      );
    }
    data.name = name;
  }

  if (typeof body?.priceMon === "string") {
    try {
      const priceWei = parseEther(body.priceMon);
      if (priceWei <= 0n) throw new Error("non-positive");
      data.priceWei = priceWei.toString();
    } catch {
      return NextResponse.json(
        { error: "priceMon must be a positive decimal MON amount" },
        { status: 400 }
      );
    }
  }

  if (body?.billingType === "FLAT" || body?.billingType === "METERED") {
    data.billingType = body.billingType;
  }

  if (typeof body?.pricePerByteMon === "string") {
    try {
      const pricePerByteWei = parseEther(body.pricePerByteMon);
      if (pricePerByteWei <= 0n) throw new Error("non-positive");
      data.pricePerByteWei = pricePerByteWei.toString();
    } catch {
      return NextResponse.json(
        { error: "pricePerByteMon must be a positive decimal MON amount" },
        { status: 400 }
      );
    }
  }

  if (typeof body?.targetApiUrl === "string") {
    const targetApiUrl = body.targetApiUrl.trim();
    if (!isValidHttpUrl(targetApiUrl)) {
      return NextResponse.json(
        { error: "targetApiUrl must be a valid http(s) URL" },
        { status: 400 }
      );
    }
    data.targetApiUrl = targetApiUrl;
  }

  const updated = await prisma.endpoint.update({ where: { id }, data });
  return NextResponse.json({ endpoint: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const walletAddress =
    typeof body?.walletAddress === "string" ? body.walletAddress : "";

  const endpoint = await findOwnedEndpoint(id, walletAddress);
  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  }

  await prisma.endpoint.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
