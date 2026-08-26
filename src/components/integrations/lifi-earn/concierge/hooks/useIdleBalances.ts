import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { fetchEarnVaults, extractUniqueUnderlyings } from "../../earnApi";
import { CHAIN_REGISTRY, isTestnet } from "../../../../../utils/chains";
import { networkConfigManager } from "../../../../../config/networkConfig";
import { fetchAssetPrices, applyPricesToAssets } from "./fetchAssetPrices";
import type { EarnToken, EarnVault } from "../../types";
import type { IdleAsset } from "../types";
import { isNativeToken, MULTICALL3_ADDRESS } from "../../../../../utils/addressConstants";

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

      const chainResults = await Promise.all(
        chainIds.map((chainId) =>
          scanSingleChain({
            chainId,
            address: targetAddress as `0x${string}`,
            tokens: underlyingsByChain.get(chainId) ?? [],
            timeoutMs: perChainTimeoutMs,
          }).catch(() => null)
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

  // Filter to real 0x-prefixed 40-hex addresses. The upstream LI.FI Earn
  // /vaults feed occasionally ships non-EVM identifiers in `underlyingTokens`
  // (seen in the wild: `coingecko:universal-btc`). viem's multicall ABI-encodes
  // each entry as `address`, and a single malformed entry corrupts the whole
  // aggregate3 calldata — Alchemy rejects with "invalid hex string" and viem
  // maps the entire batch to all-failure, silently dropping every legitimate
  // balance (USDC on Base, BNB-chain ERC-20s, etc.).
  const isHexAddress = (a: string | undefined) =>
    typeof a === "string" && /^0x[a-f0-9]{40}$/i.test(a);
  const erc20s = tokens.filter(
    (t) => !isNativeToken(t.address) && isHexAddress(t.address),
  );
  const nativeTokenMeta = tokens.find((t) => isNativeToken(t.address));

  const multicallCalls = erc20s.map((tok) => ({
    address: tok.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [address] as const,
  }));

  // Multicall in parallel chunks so a single oversize aggregate3 payload
  // doesn't reach gas/size limits on tighter-budget RPCs. Errors bubble up
  // to the outer chain-scan catch (which already logs and degrades cleanly).
  const MULTICALL_CHUNK = 50;
  async function multicallChunked(): Promise<any[]> {
    if (multicallCalls.length === 0) return [];
    const chunks: (typeof multicallCalls)[] = [];
    for (let i = 0; i < multicallCalls.length; i += MULTICALL_CHUNK) {
      chunks.push(multicallCalls.slice(i, i + MULTICALL_CHUNK));
    }
    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        client.multicall({
          contracts: chunk,
          allowFailure: true,
          multicallAddress: MULTICALL3_ADDRESS,
        }),
      ),
    );
    return chunkResults.flat();
  }

  // Always fetch native balance — the user may hold native tokens on chains
  // where no vault explicitly lists the native sentinel as an underlying.
  const [erc20Results, nativeBalance] = await Promise.all([
    withTimeout(multicallChunked(), timeoutMs * 2),
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
