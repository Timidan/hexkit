import type { ReactNode } from "react";
import {
  queryClient,
  RainbowKitProvider,
  QueryClientProvider,
  web3ToolkitTheme,
  RpcAwareWagmiProvider,
  useApplyRainbowKitTheme,
} from "../../config/rainbowkit";

export function Provider({ children }: { children: ReactNode }) {
  useApplyRainbowKitTheme();

  return (
    <RpcAwareWagmiProvider>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={web3ToolkitTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </RpcAwareWagmiProvider>
  );
}
