import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PayGate — Onchain API Paywalls on Monad",
  description:
    "Onchain micro-paywalls for any HTTP API on Monad. 402 handshake, MON settlement, zero code.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const cookies = headersList.get("cookie");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning: browser extensions (e.g. Bitdefender) inject
          attributes like bis_skin_checked before React hydrates */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers cookies={cookies}>{children}</Providers>
      </body>
    </html>
  );
}
