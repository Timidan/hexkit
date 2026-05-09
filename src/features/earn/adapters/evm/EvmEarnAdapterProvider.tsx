import { useMemo, type ReactNode } from "react";
import { useAccount, useConfig } from "wagmi";
import { EarnAdapterProvider } from "../../context/EarnAdapterContext";
import { buildEvmEarnAdapter } from "./evmEarnAdapter";

interface EvmEarnAdapterProviderProps {
  children: ReactNode;
}

export function EvmEarnAdapterProvider({ children }: EvmEarnAdapterProviderProps) {
  const { address, isConnected } = useAccount();
  const config = useConfig();

  const adapter = useMemo(
    () =>
      buildEvmEarnAdapter({
        connectedAddress: address ?? null,
        config,
      }),
    [address, config],
  );

  return (
    <EarnAdapterProvider
      family="evm"
      adapter={adapter}
      connectedAddress={address ?? null}
      isConnected={!!isConnected}
    >
      {children}
    </EarnAdapterProvider>
  );
}
