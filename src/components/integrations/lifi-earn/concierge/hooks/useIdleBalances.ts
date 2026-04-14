import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { fetchEarnVaults, extractUniqueUnderlyings } from "../../earnApi";
import { CHAIN_REGISTRY, isTestnet } from "../../../../../utils/chains";
import { networkConfigManager } from "../../../../../config/networkConfig";
import { fetchAssetPrices, applyPricesToAssets } from "./fetchAssetPrices";
import type { EarnToken, EarnVault } from "../../types";
import type { IdleAsset } from "../types";

const NATIVE_SENTINELS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

// Multicall3 is deployed at this address on virtually every EVM chain.
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

function isNative(address: string): boolean {
  return NATIVE_SENTINELS.has(address.toLowerCase());
}

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
          scanSingleChain({
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

async function scanSingleChain(args: {
  chainId: number;
  address: `0x${string}`;
  tokens: EarnToken[];
  timeoutMs: number;
}): Promise<IdleAsset[]> {
  const { chainId, address, tokens, timeoutMs } = args;

  const chainMeta = CHAIN_REGISTRY.find((c) => c.id === chainId);
  if (!chainMeta) return [];

  const resolution = networkConfigManager.resolveRpcUrl(chainId, chainMeta.rpcUrl);
  const rpcUrl = resolution.url;
  if (!rpcUrl) return [];

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const erc20s = tokens.filter((t) => !isNative(t.address));
  const nativeTokenMeta = tokens.find((t) => isNative(t.address));

  const multicallCalls = erc20s.map((tok) => ({
    address: tok.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [address] as const,
  }));

  // Always fetch native balance — the user may hold native tokens on chains
  // where no vault explicitly lists the native sentinel as an underlying.
  const [erc20Results, nativeBalance] = await Promise.all([
    multicallCalls.length > 0
      ? withTimeout(
          client.multicall({
            contracts: multicallCalls,
            allowFailure: true,
            multicallAddress: MULTICALL3_ADDRESS,
          }),
          timeoutMs
        )
      : Promise.resolve([] as any[]),
    withTimeout(client.getBalance({ address }), timeoutMs),
  ]);

  const assets: IdleAsset[] = [];

  erc20Results.forEach((r: any, i: number) => {
    if (r.status !== "success") return;
    const raw = r.result as bigint;
    if (raw === 0n) return;
    const tok = erc20s[i];
    assets.push(toIdleAsset(chainId, chainMeta.name, tok, raw));
  });

  if ((nativeBalance as bigint) > 0n) {
    // Use vault-provided native token metadata if available, otherwise
    // synthesise it from the chain's nativeCurrency config.
    const nativeTok: EarnToken = nativeTokenMeta ?? {
      address: "0x0000000000000000000000000000000000000000",
      symbol: chainMeta.nativeCurrency.symbol,
      decimals: chainMeta.nativeCurrency.decimals,
      name: chainMeta.nativeCurrency.name,
      chainId,
      logoURI: "",
    };
    assets.push(
      toIdleAsset(chainId, chainMeta.name, nativeTok, nativeBalance as bigint)
    );
  }

  return assets;
}

function toIdleAsset(
  chainId: number,
  chainName: string,
  token: EarnToken,
  raw: bigint
): IdleAsset {
  return {
    chainId,
    chainName,
    token,
    amountRaw: raw.toString(),
    amountDecimal: formatUnits(raw, token.decimals),
    amountUsd: null,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
