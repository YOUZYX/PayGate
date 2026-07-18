import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TIMEOUT_MS = 5000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("bad protocol");
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid http(s) URL" },
      { status: 400 }
    );
  }

  const started = Date.now();
  try {
    let res = await fetch(parsed.toString(), {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    // Some APIs don't implement HEAD; retry with GET.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    }
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - started,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: "Unreachable or timed out",
    });
  }
}
