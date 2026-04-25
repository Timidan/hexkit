import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEarnVaults, extractUniqueUnderlyings } from "../../earnApi";
import { CHAIN_REGISTRY, isTestnet } from "../../../../../utils/chains";
import { fetchAssetPrices, applyPricesToAssets } from "./fetchAssetPrices";
import type { EarnVault } from "../../types";
import type { IdleAsset } from "../types";
import { scanEvmChainBalances } from "../../../../../features/earn/adapters/evm/idleScan";

export function useIdleBalances(targetAddress: string | null, perChainTimeoutMs = 8000) {

  const vaultsQuery = useQuery({
    queryKey: ["earn-vaults", "all"],
    queryFn: async () => {
      const SAFETY_MAX_PAGES = 200;
      const all: EarnVault[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < SAFETY_MAX_PAGES; i++) {
        const page = await fetchEarnVaults({ cursor });
        all.push(...page.data);
        if (!page.nextCursor) return all;
        cursor = page.nextCursor;
      }
      console.warn(
        `[concierge] earn-vaults pagination hit safety cap (${SAFETY_MAX_PAGES} pages); ` +
          `subsequent vaults were not loaded.`
      );
      return all;
    },
    staleTime: 5 * 60 * 1000,
  });

  const underlyingsByChain = useMemo(
    () =>
      vaultsQuery.data ? extractUniqueUnderlyings(vaultsQuery.data) : new Map(),
    [vaultsQuery.data]
  );

  const scanQuery = useQuery({
    queryKey: ["concierge-idle-balances", targetAddress, underlyingsByChain.size],
    enabled:
      !!targetAddress && (underlyingsByChain?.size ?? 0) > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<{
      idleAssets: IdleAsset[];
      dustAssets: IdleAsset[];
      dustHidden: number;
      chainsScanned: number;
      chainsReachable: number;
    }> => {
      if (!targetAddress || !targetAddress.startsWith("0x")) throw new Error("no address");

      const chainIds = Array.from(underlyingsByChain.keys()).filter(
        (id) => !isTestnet(id as number)
      ) as number[];

      // eslint-disable-next-line no-console
      console.log(
        `[concierge] scanning ${chainIds.length} chains:`,
        chainIds.map((id) => {
          const meta = CHAIN_REGISTRY.find((c) => c.id === id);
          return `${meta?.name ?? id}(${(underlyingsByChain.get(id) ?? []).length} tokens)`;
        })
      );

      const chainResults = await Promise.all(
        chainIds.map((chainId) =>
          scanEvmChainBalances({
            chainId,
            address: targetAddress as `0x${string}`,
            tokens: underlyingsByChain.get(chainId) ?? [],
            timeoutMs: perChainTimeoutMs,
          }).catch((err) => {
            console.warn(
              `[concierge] chain ${chainId} (${CHAIN_REGISTRY.find((c) => c.id === chainId)?.name ?? "?"}) scan failed:`,
              err?.message ?? err
            );
            return null;
          })
        )
      );

      const scannedAssets: IdleAsset[] = [];
      let reachable = 0;
      for (const result of chainResults) {
        if (result === null) continue;
        reachable += 1;
        scannedAssets.push(...result);
      }

      // fetchAssetPrices swallows per-chunk errors → missing prices leave
      // amountUsd=null rather than failing the scan.
      const prices = await fetchAssetPrices(scannedAssets);
      const allAssets = applyPricesToAssets(scannedAssets, prices);

      // Separate dust tokens (< $1.50) — no vault deposit is viable at that
      // size, but we still surface them in a collapsible list.
      const idleAssets: IdleAsset[] = [];
      const dustAssets: IdleAsset[] = [];
      for (const a of allAssets) {
        if (a.amountUsd != null && a.amountUsd < 1.5) {
          dustAssets.push(a);
        } else {
          idleAssets.push(a);
        }
      }

      idleAssets.sort((a, b) => {
        const au = a.amountUsd ?? -1;
        const bu = b.amountUsd ?? -1;
        return bu - au;
      });

      dustAssets.sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0));

      return {
        idleAssets,
        dustAssets,
        dustHidden: dustAssets.length,
        chainsScanned: chainIds.length,
        chainsReachable: reachable,
      };
    },
  });

  // Refetch both so Rescan can recover from an initial vaults-fetch failure.
  const refetch = async () => {
    await vaultsQuery.refetch();
    return scanQuery.refetch();
  };

  return {
    isLoading: vaultsQuery.isLoading || scanQuery.isLoading,
    isError: vaultsQuery.isError || scanQuery.isError,
    error: vaultsQuery.error ?? scanQuery.error,
    vaults: vaultsQuery.data ?? [],
    idleAssets: scanQuery.data?.idleAssets ?? [],
    dustAssets: scanQuery.data?.dustAssets ?? [],
    dustHidden: scanQuery.data?.dustHidden ?? 0,
    chainsScanned: scanQuery.data?.chainsScanned ?? 0,
    chainsReachable: scanQuery.data?.chainsReachable ?? 0,
    refetch,
  };
}
