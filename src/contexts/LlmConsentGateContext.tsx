import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import { useLlmConfig } from "./LlmConfigContext";
import { LlmConsentModal } from "../components/llm/LlmConsentModal";

interface GateValue {
  requestConsent: (providerName?: string) => Promise<boolean>;
}

const LlmConsentGateContext = createContext<GateValue | null>(null);

export const LlmConsentGateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useLlmConfig();
  const [open, setOpen] = useState(false);
  const [providerName, setProviderName] = useState<string | undefined>(undefined);
  const pending = useRef<Array<(v: boolean) => void>>([]);

  const value = useMemo<GateValue>(() => ({
    requestConsent: (name?: string) => {
      if (config.consentAcknowledged) return Promise.resolve(true);
      setProviderName(name);
      setOpen(true);
      return new Promise<boolean>((resolve) => {
        pending.current.push(resolve);
      });
    },
  }), [config.consentAcknowledged]);

  const settle = (ack: boolean) => {
    const waiters = pending.current;
    pending.current = [];
    setOpen(false);
    for (const resolve of waiters) resolve(ack);
  };

  return (
    <LlmConsentGateContext.Provider value={value}>
      {children}
      <LlmConsentModal
        open={open}
        providerName={providerName}
        onAcknowledge={() => settle(true)}
        onClose={() => settle(false)}
      />
    </LlmConsentGateContext.Provider>
  );
};

export function useLlmConsentGate(): GateValue {
  const v = useContext(LlmConsentGateContext);
  if (!v) throw new Error("useLlmConsentGate must be used inside <LlmConsentGateProvider>");
  return v;
}
