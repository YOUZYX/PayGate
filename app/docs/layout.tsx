import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PayGate Docs — x402 API Monetization on Monad",
  description:
    "Integration guides for the PayGate protocol: 402 handshake, payment receipts, Delegated Session Allowances (Corporate Card Pattern), Dynamic Payload Metering (Taxi Meter Pattern), Deterministic SLA Escrows (Vending Machine Pattern), and the PayGateRouter contract spec.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={jetbrainsMono.variable}>{children}</div>;
}
