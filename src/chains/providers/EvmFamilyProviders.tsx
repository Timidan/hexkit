import type { ReactNode } from "react";
import {
  RpcAwareWagmiProvider,
  RainbowKitProvider,
  web3ToolkitTheme,
} from "../../config/rainbowkit";
import { useApplyRainbowKitTheme } from "../../config/rainbowkit";

export function EvmFamilyProviders({ children }: { children: ReactNode }) {
  useApplyRainbowKitTheme();

  return (
    <RpcAwareWagmiProvider>
      <RainbowKitProvider theme={web3ToolkitTheme}>
        {children}
      </RainbowKitProvider>
    </RpcAwareWagmiProvider>
  );
}

export default EvmFamilyProviders;
