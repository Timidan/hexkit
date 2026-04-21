import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  llmConfigManager,
  type LlmConfigSnapshot,
} from "../config/llmConfig";

interface LlmConfigContextValue {
  config: LlmConfigSnapshot;
  configVersion: number;
  saveConfig: (patch: Partial<LlmConfigSnapshot>) => void;
  acknowledgeConsent: () => void;
  reset: () => void;
  hasAnyUserKey: boolean;
}

const Ctx = createContext<LlmConfigContextValue | undefined>(undefined);

export const LlmConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<LlmConfigSnapshot>(() => llmConfigManager.getConfig());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => {
      setConfig(llmConfigManager.getConfig());
      setVersion((v) => v + 1);
    };
    window.addEventListener("llm-config-updated", onUpdate);
    return () => window.removeEventListener("llm-config-updated", onUpdate);
  }, []);

  const saveConfig = useCallback((patch: Partial<LlmConfigSnapshot>) => {
    llmConfigManager.saveConfig(patch);
  }, []);
  const acknowledgeConsent = useCallback(() => llmConfigManager.acknowledgeConsent(), []);
  const reset = useCallback(() => llmConfigManager.reset(), []);

  const value = useMemo<LlmConfigContextValue>(() => ({
    config,
    configVersion: version,
    saveConfig,
    acknowledgeConsent,
    reset,
    hasAnyUserKey: llmConfigManager.hasAnyUserKey(),
  }), [config, version, saveConfig, acknowledgeConsent, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useLlmConfig(): LlmConfigContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLlmConfig must be used within LlmConfigProvider");
  return v;
}
