import type { LlmProvider } from "../utils/llm/types";

export interface LlmProviderSlot {
  model: string;
  customBaseUrl?: string;
}

export interface LlmConfigSnapshot {
  defaultProvider: LlmProvider;
  providers: Record<LlmProvider, LlmProviderSlot>;
  providerKeys: Partial<Record<LlmProvider, string>>;
  consentAcknowledged: boolean;
  cacheSharingDefault: "off" | "on";
  version: number;
}

export const DEFAULT_LLM_CONFIG: LlmConfigSnapshot = {
  defaultProvider: "gemini",
  providers: {
    anthropic: { model: "claude-opus-4-7" },
    openai: { model: "gpt-5.4" },
    gemini: { model: "gemini-2.5-pro" },
    custom: { model: "", customBaseUrl: "" },
  },
  providerKeys: {},
  consentAcknowledged: false,
  cacheSharingDefault: "off",
  version: 1,
};

const PUBLIC_KEY = "web3-toolkit:llm-config";
const SECRETS_KEY = "web3-toolkit:llm-secrets";

class LlmConfigManager {
  private cache: LlmConfigSnapshot | null = null;

  getConfig(): LlmConfigSnapshot {
    if (this.cache) return this.cache;
    this.cache = this.load();
    return this.cache;
  }

  saveConfig(patch: Partial<LlmConfigSnapshot>): void {
    const current = this.getConfig();
    const merged: LlmConfigSnapshot = {
      ...current,
      ...patch,
      providers: { ...current.providers, ...(patch.providers ?? {}) },
      providerKeys: { ...current.providerKeys, ...(patch.providerKeys ?? {}) },
    };
    this.cache = merged;
    if (typeof window !== "undefined") {
      const { providerKeys, ...publicBlob } = merged;
      void providerKeys;
      window.localStorage.setItem(PUBLIC_KEY, JSON.stringify(publicBlob));
      window.localStorage.setItem(SECRETS_KEY, JSON.stringify(merged.providerKeys));
      window.dispatchEvent(new CustomEvent("llm-config-updated"));
    }
  }

  acknowledgeConsent(): void {
    this.saveConfig({ consentAcknowledged: true });
  }

  reset(): void {
    this.cache = { ...DEFAULT_LLM_CONFIG };
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PUBLIC_KEY);
      window.localStorage.removeItem(SECRETS_KEY);
      window.dispatchEvent(new CustomEvent("llm-config-updated"));
    }
  }

  getProviderKey(provider: LlmProvider): string | undefined {
    return this.getConfig().providerKeys[provider];
  }

  hasAnyUserKey(): boolean {
    const keys = this.getConfig().providerKeys;
    return Object.values(keys).some((v) => typeof v === "string" && v.length > 0);
  }

  private load(): LlmConfigSnapshot {
    if (typeof window === "undefined") return { ...DEFAULT_LLM_CONFIG };
    try {
      const publicRaw = window.localStorage.getItem(PUBLIC_KEY);
      const secretsRaw = window.localStorage.getItem(SECRETS_KEY);
      const pub = publicRaw
        ? (JSON.parse(publicRaw) as Partial<LlmConfigSnapshot>)
        : {};
      const secrets = secretsRaw
        ? (JSON.parse(secretsRaw) as Partial<LlmConfigSnapshot["providerKeys"]>)
        : {};
      return {
        ...DEFAULT_LLM_CONFIG,
        ...pub,
        providers: { ...DEFAULT_LLM_CONFIG.providers, ...(pub.providers ?? {}) },
        providerKeys: { ...secrets },
      };
    } catch {
      return { ...DEFAULT_LLM_CONFIG };
    }
  }
}

export const llmConfigManager = new LlmConfigManager();
