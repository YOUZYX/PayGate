import { createAppKit } from "@reown/appkit/react";
import { networks, projectId, wagmiAdapter } from "@/lib/wagmi";

// Must be called once at module scope, outside any React component.
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId: projectId!,
  metadata: {
    name: "PayGate",
    description: "Onchain micro-paywalls for any HTTP API on Monad",
    url: "http://localhost:3000",
    icons: [],
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#b4ff11",
    "--w3m-border-radius-master": "0px",
  },
});
