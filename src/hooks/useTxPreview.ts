import { useEffect, useRef, useState, useCallback } from "react";
import { ethers } from "ethers";
import { useNetworkConfig } from "../contexts/NetworkConfigContext";
import type { ExtendedChain } from "../components/shared/NetworkSelector";
import type { TxPreviewData, TxFetchStatus } from "../components/transaction-builder/types";
import type { Chain } from "../types";

export const ALCHEMY_MISSING_KEY_NOTICE =
  "Alchemy was selected without an API key. Switched back to App Default RPC.";
export const INFURA_MISSING_KEY_NOTICE =
  "Infura was selected without a Project ID. Switched back to App Default RPC.";
export const RPC_AUTO_SWITCH_NOTICE_KEY = "web3-toolkit:rpc-auto-switch-notice";

export type RpcNoticeConfig = {
  rpcMode: "DEFAULT" | "ALCHEMY" | "INFURA" | "CUSTOM";
  alchemyApiKey?: string;
  infuraProjectId?: string;
};

export function formatReplayRpcError(rawError: string, networkName: string, mode: string): string {
  const trimmed = rawError.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes("could not detect network") || lower.includes("nonetwork")) {
    if (mode === "DEFAULT") {
      return `Could not connect to the App Default RPC for ${networkName}. Configure a custom RPC in Settings if this network remains unavailable.`;
    }
    return `Could not connect to the configured ${mode} RPC for ${networkName}. Check your API key or switch providers in Settings.`;
  }

  if (lower.includes("403") || lower.includes("forbidden")) {
    if (mode === "DEFAULT") {
      return `The App Default RPC for ${networkName} rejected the request. Configure a custom RPC in Settings to continue.`;
    }
    return `The configured ${mode} RPC rejected the request. Check your API key or switch providers in Settings.`;
  }

  return trimmed || "Failed to fetch transaction";
}

export function getMissingProviderNotice(config: RpcNoticeConfig): string | null {
  if (config.rpcMode === "ALCHEMY" && !config.alchemyApiKey?.trim()) {
    return ALCHEMY_MISSING_KEY_NOTICE;
  }
  if (config.rpcMode === "INFURA" && !config.infuraProjectId?.trim()) {
    return INFURA_MISSING_KEY_NOTICE;
  }
  return null;
}

export function clearPersistedRpcAutoSwitchNotice() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RPC_AUTO_SWITCH_NOTICE_KEY);
  window.sessionStorage.removeItem(RPC_AUTO_SWITCH_NOTICE_KEY);
}

export function getPersistedRpcAutoSwitchNotice(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem(RPC_AUTO_SWITCH_NOTICE_KEY) ||
    window.sessionStorage.getItem(RPC_AUTO_SWITCH_NOTICE_KEY)
  );
}

export function shouldClearAutoSwitchNotice(
  notice: string | null | undefined,
  config: Pick<RpcNoticeConfig, "alchemyApiKey" | "infuraProjectId">,
): boolean {
  if (notice === ALCHEMY_MISSING_KEY_NOTICE) {
    return Boolean(config.alchemyApiKey?.trim());
  }
  if (notice === INFURA_MISSING_KEY_NOTICE) {
    return Boolean(config.infuraProjectId?.trim());
  }
  return false;
}

interface UseTxPreviewOptions {
  txHash: string;
  selectedNetwork: ExtendedChain;
}

interface UseTxPreviewResult {
  txPreview: TxPreviewData | null;
  txFetchStatus: TxFetchStatus;
  txFetchError: string | null;
  rpcNotice: string | null;
  reset: () => void;
}

export function useTxPreview({ txHash, selectedNetwork }: UseTxPreviewOptions): UseTxPreviewResult {
  const { config, resolveRpcUrl, saveConfig } = useNetworkConfig();

  const [txPreview, setTxPreview] = useState<TxPreviewData | null>(null);
  const [txFetchStatus, setTxFetchStatus] = useState<TxFetchStatus>("idle");
  const [txFetchError, setTxFetchError] = useState<string | null>(null);
  const [rpcNotice, setRpcNotice] = useState<string | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }
    setTxPreview(null);
    setTxFetchStatus("idle");
    setTxFetchError(null);
  }, []);

  useEffect(() => {
    const trimmedHash = txHash.trim();

    if (!trimmedHash || !/^0x[a-fA-F0-9]{64}$/.test(trimmedHash)) {
      setTxPreview(null);
      setTxFetchStatus("idle");
      setTxFetchError(null);
      return;
    }

    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }

    const abortController = new AbortController();
    fetchAbortRef.current = abortController;

    const timer = setTimeout(async () => {
      if (abortController.signal.aborted) return;

      setTxFetchStatus("fetching");
      setTxFetchError(null);
      setTxPreview(null);

      try {
        const missingProviderNotice = getMissingProviderNotice(config);
        if (missingProviderNotice) {
          setRpcNotice(missingProviderNotice);
          saveConfig({ rpcMode: "DEFAULT" });
        }

        const chainForRpc: Chain = {
          id: selectedNetwork.id,
          name: selectedNetwork.name,
          rpcUrl: selectedNetwork.rpcUrl ?? "",
          blockExplorer: selectedNetwork.blockExplorer ?? "",
        } as Chain;

        const rpcResolution = resolveRpcUrl(chainForRpc.id, selectedNetwork.rpcUrl);
        const rpcUrl = rpcResolution.url;
        const persistedNotice = getPersistedRpcAutoSwitchNotice();
        if (shouldClearAutoSwitchNotice(persistedNotice, config)) {
          clearPersistedRpcAutoSwitchNotice();
        } else if (persistedNotice) {
          setRpcNotice(persistedNotice);
        } else if (rpcResolution.note) {
          setRpcNotice(rpcResolution.note);
        }

        if (!rpcUrl) {
          setTxFetchStatus("error");
          setTxFetchError(
            rpcResolution.note ||
              `No RPC available for ${selectedNetwork.name}. Switch to App Default RPC or configure a custom RPC in Settings.`,
          );
          return;
        }

        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const tx = await provider.getTransaction(trimmedHash);

        if (abortController.signal.aborted) return;

        if (!tx) {
          setTxFetchStatus("not_found");
          setTxFetchError(`Transaction not found on ${selectedNetwork?.name || "this network"}`);
          return;
        }

        setTxPreview({
          from: tx.from,
          to: tx.to ?? null,
          value: tx.value?.toString() || "0",
          data: tx.data || "0x",
          blockNumber: tx.blockNumber ?? null,
          nonce: tx.nonce,
        });
        setTxFetchStatus("found");
        setTxFetchError(null);
      } catch (err: any) {
        if (abortController.signal.aborted) return;
        setTxFetchStatus("error");
        setTxFetchError(
          formatReplayRpcError(
            err?.message || "Failed to fetch transaction",
            selectedNetwork?.name || "this network",
            resolveRpcUrl(selectedNetwork.id, selectedNetwork.rpcUrl).mode || "DEFAULT",
          ),
        );
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [txHash, selectedNetwork, resolveRpcUrl, config, saveConfig]);

  return { txPreview, txFetchStatus, txFetchError, rpcNotice, reset };
}
