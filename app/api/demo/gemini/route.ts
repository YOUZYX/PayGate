import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GEMINI_MODEL = "gemini-3.5-flash";

/**
 * Upstream target for Dynamic Payload Metering (The Taxi Meter Pattern)
 * demo endpoint ("[DEMO] Dynamic Payload Metering").
 * The PayGate gateway forwards the (already paid-for) request here; this
 * route relays the prompt to the live Gemini free-tier API.
 *
 * Returns 503 when GEMINI_API_KEY is unset — the gateway then treats it as
 * an upstream failure and automatically refunds the caller's escrow
 * (Deterministic SLA Escrows / The Vending Machine Pattern).
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on this deployment" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const prompt =
    typeof body?.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim().slice(0, 2000)
      : "Explain the HTTP 402 status code in two sentences.";

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 512 },
        }),
        signal: AbortSignal.timeout(25_000),
      }
    );
  } catch {
    return NextResponse.json({ error: "gemini_unreachable" }, { status: 504 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "gemini_error", status: upstream.status },
      { status: 502 }
    );
  }

  const data = await upstream.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("") ?? "";

  return NextResponse.json({
    model: GEMINI_MODEL,
    prompt,
    text,
  });
}
