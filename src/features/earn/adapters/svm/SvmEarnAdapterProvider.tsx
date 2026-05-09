import type { ReactNode } from "react";
import { EarnAdapterProvider } from "../../context/EarnAdapterContext";
import { buildSvmEarnAdapterStub } from "./svmEarnAdapter.stub";

interface SvmEarnAdapterProviderProps {
  children: ReactNode;
}

export function SvmEarnAdapterProvider({ children }: SvmEarnAdapterProviderProps) {
  const adapter = buildSvmEarnAdapterStub();

  return (
    <EarnAdapterProvider
      family="svm"
      adapter={adapter}
      connectedAddress={null}
      isConnected={false}
      unsupportedReason={adapter.unsupportedReason ?? null}
    >
      {children}
    </EarnAdapterProvider>
  );
}
