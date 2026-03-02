/**
 * useWalletHelpers – wallet chain-id helpers and ethers provider factory.
 *
 * Extracted from SimpleGridMain.tsx (pure structural split – no behaviour changes).
 */
import { useCallback } from "react";
import { ethers } from "ethers";
import { SUPPORTED_CHAINS } from "../../../utils/chains";
import { networkConfigManager } from "../../../config/networkConfig";
import { validateGenericRpcEndpoint, FALLBACK_RPCS } from "../utils";

export interface UseWalletHelpersDeps {
  accountChainId: number | undefined;
  chainId: number | undefined;
  showWarning: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}

export function useWalletHelpers(deps: UseWalletHelpersDeps) {
  const { accountChainId, chainId, showWarning, showError } = deps;

  const getWalletChainId = useCallback(
    async (client?: any | null): Promise<number | undefined> => {
      let current = accountChainId ?? client?.chain?.id ?? chainId;
      if (client && typeof client.getChainId === 'function') {
        try {
          const fetched = await client.getChainId();
          if (typeof fetched === 'number') current = fetched;
        } catch {
          // Failed to read chainId from walletClient
        }
      }
      return current;
    },
    [accountChainId, chainId]
  );

  const createEthersProvider = useCallback(async (selectedNetwork: any) => {
    if (!selectedNetwork) throw new Error("No network selected");

    const currentNetworkConfig = SUPPORTED_CHAINS.find((chain) => chain.id === selectedNetwork.id);

    const fallbackRPCs = FALLBACK_RPCS;

    let rpcUrl = currentNetworkConfig?.rpcUrl || selectedNetwork.rpcUrl;
    if (!rpcUrl || rpcUrl.includes("undefined") || rpcUrl.includes("null")) {
      rpcUrl = fallbackRPCs[selectedNetwork.id];
      if (!rpcUrl) throw new Error(`No valid RPC URL available for network ${selectedNetwork.name} (ID: ${selectedNetwork.id})`);
    }

    const defaultRpcUrl = rpcUrl;
    const resolution = networkConfigManager.resolveRpcUrl(selectedNetwork.id, defaultRpcUrl);
    if (resolution.note) showWarning("RPC configuration", resolution.note);

    if (resolution.mode === "CUSTOM") {
      const isValid = await validateGenericRpcEndpoint(resolution.url, selectedNetwork.id);
      if (!isValid) {
        showError("Custom RPC mismatch", `The custom RPC endpoint did not return chain ID ${selectedNetwork.id}. The default RPC for ${selectedNetwork.name} will be used instead.`);
        const currentConfig = networkConfigManager.getConfig();
        if (currentConfig.rpcMode === "CUSTOM") networkConfigManager.saveConfig({ rpcMode: "DEFAULT" });
        rpcUrl = defaultRpcUrl;
      } else {
        rpcUrl = resolution.url;
      }
    } else if (resolution.mode !== "DEFAULT") {
      rpcUrl = resolution.url;
    }

    const networkConfig = {
      name: selectedNetwork.name.toLowerCase().replace(/\s+/g, "-"),
      chainId: selectedNetwork.id,
      ensAddress: selectedNetwork.id === 1 ? "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" : undefined,
    };

    try {
      const provider = new ethers.providers.JsonRpcProvider({ url: rpcUrl, timeout: 30000, allowGzip: true }, networkConfig);
      const originalDetectNetwork = provider.detectNetwork.bind(provider);
      provider.detectNetwork = async () => {
        try { return await originalDetectNetwork(); } catch {
          return networkConfig as any;
        }
      };
      return provider;
    } catch (error) {
      throw new Error(`Failed to create provider for ${selectedNetwork.name}: ${error}`);
    }
  }, [showWarning, showError]);

  return {
    getWalletChainId,
    createEthersProvider,
  };
}
