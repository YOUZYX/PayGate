"use client";

import { useState } from "react";
import { WagmiProvider, cookieToInitialState } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { wagmiConfig } from "@/lib/wagmi";
// Side-effect import: initializes the Reown AppKit modal once per app load.
import "@/lib/appkit";

export function Providers({
  children,
  cookies,
}: {
  children: React.ReactNode;
  cookies: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const initialState = cookieToInitialState(wagmiConfig, cookies);

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="bottom-right" theme="dark" />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
