import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { monadTestnet } from "@/lib/chain";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is not set");
}

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [monadTestnet];

export const wagmiAdapter = new WagmiAdapter({
  // Cookie storage keeps connection state readable during SSR so the
  // server-rendered HTML matches the hydrated client (no hydration warnings).
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
