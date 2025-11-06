import type { Chain } from "../types";

export type RpcProviderMode = "DEFAULT" | "ALCHEMY" | "INFURA" | "GENERIC";

export interface UserRpcSettings {
  mode: RpcProviderMode;
  alchemyKey?: string;
  infuraKey?: string;
  genericUrl?: string;
  etherscanKey?: string;
}

interface EffectiveRpcResolution {
  url: string;
  mode: RpcProviderMode;
  requiresChainValidation: boolean;
  note?: string;
}

const STORAGE_KEY = "web3-toolkit:user-rpc-settings";

const DEFAULT_SETTINGS: UserRpcSettings = {
  mode: "DEFAULT",
};

const ALCHEMY_ENDPOINTS: Record<number, (key: string) => string> = {
  1: (key) => `https://eth-mainnet.g.alchemy.com/v2/${key}`,
  11155111: (key) => `https://eth-sepolia.g.alchemy.com/v2/${key}`,
  8453: (key) => `https://base-mainnet.g.alchemy.com/v2/${key}`,
  84532: (key) => `https://base-sepolia.g.alchemy.com/v2/${key}`,
  137: (key) => `https://polygon-mainnet.g.alchemy.com/v2/${key}`,
  80002: (key) => `https://polygon-amoy.g.alchemy.com/v2/${key}`,
  42161: (key) => `https://arb-mainnet.g.alchemy.com/v2/${key}`,
  421614: (key) => `https://arb-sepolia.g.alchemy.com/v2/${key}`,
  10: (key) => `https://opt-mainnet.g.alchemy.com/v2/${key}`,
  11155420: (key) => `https://opt-sepolia.g.alchemy.com/v2/${key}`,
  43114: (key) => `https://avax-mainnet.g.alchemy.com/v2/${key}`,
};

const INFURA_ENDPOINTS: Record<number, (key: string) => string> = {
  1: (key) => `https://mainnet.infura.io/v3/${key}`,
  11155111: (key) => `https://sepolia.infura.io/v3/${key}`,
  8453: (key) => `https://base-mainnet.infura.io/v3/${key}`,
  84532: (key) => `https://base-sepolia.infura.io/v3/${key}`,
  137: (key) => `https://polygon-mainnet.infura.io/v3/${key}`,
  80002: (key) => `https://polygon-amoy.infura.io/v3/${key}`,
  42161: (key) => `https://arbitrum-mainnet.infura.io/v3/${key}`,
  421614: (key) => `https://arbitrum-sepolia.infura.io/v3/${key}`,
  10: (key) => `https://optimism-mainnet.infura.io/v3/${key}`,
  11155420: (key) => `https://optimism-sepolia.infura.io/v3/${key}`,
  43114: (key) => `https://avalanche-mainnet.infura.io/v3/${key}`,
};

const safeParse = (value: string | null): UserRpcSettings => {
  if (!value) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(value) as UserRpcSettings;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_SETTINGS };
    }
    return {
      mode: parsed.mode ?? "DEFAULT",
      alchemyKey: parsed.alchemyKey ?? "",
      infuraKey: parsed.infuraKey ?? "",
      genericUrl: parsed.genericUrl ?? "",
      etherscanKey: parsed.etherscanKey ?? "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const writeSettings = (settings: UserRpcSettings) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("rpc-settings-updated"));
};

const readSettings = (): UserRpcSettings => {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return safeParse(raw);
};

const alchemySupportedChains = Object.keys(ALCHEMY_ENDPOINTS).map((id) =>
  Number(id)
);
const infuraSupportedChains = Object.keys(INFURA_ENDPOINTS).map((id) =>
  Number(id)
);

const normalizeGenericUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
};

const resolveAlchemyUrl = (
  chainId: number,
  key: string
): string | undefined => {
  const builder = ALCHEMY_ENDPOINTS[chainId];
  if (!builder) return undefined;
  const trimmed = key.trim();
  if (!trimmed) return undefined;
  return builder(trimmed);
};

const resolveInfuraUrl = (
  chainId: number,
  key: string
): string | undefined => {
  const builder = INFURA_ENDPOINTS[chainId];
  if (!builder) return undefined;
  const trimmed = key.trim();
  if (!trimmed) return undefined;
  return builder(trimmed);
};

export const userRpcManager = {
  getSettings(): UserRpcSettings {
    return readSettings();
  },

  saveSettings(settings: UserRpcSettings) {
    writeSettings({
      ...DEFAULT_SETTINGS,
      ...settings,
    });
  },

  getEtherscanKey(): string | undefined {
    const key = this.getSettings().etherscanKey;
    const trimmed = key?.trim();
    return trimmed ? trimmed : undefined;
  },

  setEtherscanKey(key: string) {
    const current = this.getSettings();
    this.saveSettings({
      ...current,
      etherscanKey: key.trim(),
    });
  },

  clearSettings() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("rpc-settings-updated"));
  },

  getEffectiveRpcUrl(
    chain: Chain | number,
    defaultUrl: string
  ): EffectiveRpcResolution {
    const chainId = typeof chain === "number" ? chain : chain.id;
    const settings = this.getSettings();
    const base: EffectiveRpcResolution = {
      url: defaultUrl,
      mode: "DEFAULT",
      requiresChainValidation: false,
    };

    if (settings.mode === "GENERIC") {
      const rawUrl = settings.genericUrl ? normalizeGenericUrl(settings.genericUrl) : "";
      if (rawUrl) {
        return {
          url: rawUrl,
          mode: "GENERIC",
          requiresChainValidation: true,
        };
      }
      return {
        ...base,
        note: "Generic RPC selected but no URL configured. Falling back to default RPC.",
      };
    }

    if (settings.mode === "ALCHEMY") {
      const resolved = settings.alchemyKey
        ? resolveAlchemyUrl(chainId, settings.alchemyKey)
        : undefined;
      if (resolved) {
        return {
          url: resolved,
          mode: "ALCHEMY",
          requiresChainValidation: false,
        };
      }

      const supported = alchemySupportedChains.includes(chainId);
      return {
        ...base,
        note: supported
          ? "Alchemy selected but API key missing. Using fallback RPC."
          : "Alchemy does not currently support this network. Using fallback RPC.",
      };
    }

    if (settings.mode === "INFURA") {
      const resolved = settings.infuraKey
        ? resolveInfuraUrl(chainId, settings.infuraKey)
        : undefined;
      if (resolved) {
        return {
          url: resolved,
          mode: "INFURA",
          requiresChainValidation: false,
        };
      }

      const supported = infuraSupportedChains.includes(chainId);
      return {
        ...base,
        note: supported
          ? "Infura selected but Project ID missing. Using fallback RPC."
          : "Infura does not currently support this network. Using fallback RPC.",
      };
    }

    return base;
  },
};

export const getRpcProviderLabel = (mode: RpcProviderMode): string => {
  switch (mode) {
    case "ALCHEMY":
      return "Alchemy";
    case "INFURA":
      return "Infura";
    case "GENERIC":
      return "Custom RPC";
    default:
      return "Default";
  }
};

export const isValidRpcUrl = (value: string): boolean => {
  const trimmed = normalizeGenericUrl(value);
  return /^https?:\/\//i.test(trimmed);
};
