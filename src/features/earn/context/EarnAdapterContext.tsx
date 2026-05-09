// useEarnAdapter has a no-provider fallback that returns an unsupported
// value, so the shell renders cleanly under any family route even before
// its provider is wired.
import { createContext, useContext, type ReactNode } from "react";
import type { ChainFamily } from "../../../chains/types";
import { useActiveChainFamily } from "../../../hooks/useActiveChainFamily";
import type { AnyEarnAdapter } from "../adapter/types";
import { adapterFamilyLabel } from "../adapter/types";

export interface EarnAdapterContextValue {
  family: ChainFamily;
  adapter: AnyEarnAdapter | null;
  supported: boolean;
  connectedAddress: string | null;
  isConnected: boolean;
  unsupportedReason: string | null;
}

const EarnAdapterContext = createContext<EarnAdapterContextValue | null>(null);

export interface EarnAdapterProviderProps {
  family: ChainFamily;
  adapter: AnyEarnAdapter | null;
  connectedAddress?: string | null;
  isConnected?: boolean;
  unsupportedReason?: string | null;
  children: ReactNode;
}

export function EarnAdapterProvider({
  family,
  adapter,
  connectedAddress = null,
  isConnected = false,
  unsupportedReason = null,
  children,
}: EarnAdapterProviderProps) {
  return (
    <EarnAdapterContext.Provider
      value={{
        family,
        adapter,
        supported: adapter?.supported ?? false,
        connectedAddress,
        isConnected,
        unsupportedReason,
      }}
    >
      {children}
    </EarnAdapterContext.Provider>
  );
}

export function useEarnAdapter(): EarnAdapterContextValue {
  const activeFamily = useActiveChainFamily();
  const ctx = useContext(EarnAdapterContext);
  if (ctx) return ctx;

  return {
    family: activeFamily,
    adapter: null,
    supported: false,
    connectedAddress: null,
    isConnected: false,
    unsupportedReason: `${adapterFamilyLabel(
      activeFamily,
    )} vaults are not supported for this family yet.`,
  };
}
