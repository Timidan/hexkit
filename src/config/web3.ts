import { createConfig, http } from "wagmi";
import {
  mainnet,
  polygon,
  bsc,
  arbitrum,
  optimism,
  base,
  avalanche,
} from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

// Get project ID from environment or use a default for development
const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo-project-id";

// Read Alchemy API key from env. Prefer API_KEY (as requested), fallback to VITE_API_KEY
type EnvKeys = {
  API_KEY?: string;
  VITE_API_KEY?: string;
  VITE_WALLETCONNECT_PROJECT_ID?: string;
};
const ALCHEMY_API_KEY =
  (import.meta.env as unknown as EnvKeys).API_KEY ||
  (import.meta.env as unknown as EnvKeys).VITE_API_KEY ||
  "";

// Helper to build an Alchemy transport if supported and key is present
const alchemy = (prefix?: string) =>
  prefix && ALCHEMY_API_KEY ? http(`${prefix}/${ALCHEMY_API_KEY}`) : http();

// Known Alchemy HTTPS prefixes per chain
const ALCHEMY_PREFIX: Record<number, string | undefined> = {
  [mainnet.id]: "https://eth-mainnet.g.alchemy.com/v2",
  [polygon.id]: "https://polygon-mainnet.g.alchemy.com/v2",
  [arbitrum.id]: "https://arb-mainnet.g.alchemy.com/v2",
  [optimism.id]: "https://opt-mainnet.g.alchemy.com/v2",
  [base.id]: "https://base-mainnet.g.alchemy.com/v2",
  // Not supported by Alchemy (as of now) → fallback to default
  [bsc.id]: undefined,
  [avalanche.id]: undefined,
};

// Enhanced multi-chain configuration
export const config = createConfig({
  chains: [mainnet, polygon, bsc, arbitrum, optimism, base, avalanche],
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "Web3 Toolkit",
      appLogoUrl: "https://web3-toolkit.example.com/logo.png",
    }),
    walletConnect({
      projectId,
      metadata: {
        name: "Web3 Toolkit",
        description:
          "A comprehensive Web3 developer toolkit with Dynamic integration",
        url: "https://web3-toolkit.example.com",
        icons: ["https://web3-toolkit.example.com/logo.png"],
      },
    }),
  ],
  transports: {
    [mainnet.id]: alchemy(ALCHEMY_PREFIX[mainnet.id]),
    [polygon.id]: alchemy(ALCHEMY_PREFIX[polygon.id]),
    [bsc.id]: alchemy(ALCHEMY_PREFIX[bsc.id]),
    [arbitrum.id]: alchemy(ALCHEMY_PREFIX[arbitrum.id]),
    [optimism.id]: alchemy(ALCHEMY_PREFIX[optimism.id]),
    [base.id]: alchemy(ALCHEMY_PREFIX[base.id]),
    [avalanche.id]: alchemy(ALCHEMY_PREFIX[avalanche.id]),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
