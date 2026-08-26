import type { Address } from "viem";
import type { EarnVault } from "../../types";
import type { IdleAsset } from "../types";
import type { ParsedIntent } from "./schema";
import type { IntentRoute } from "../../intentsApi";
import { isNativeToken } from "../../../../../utils/addressConstants";

// Legs that can't execute (no route, unsupported source, etc.) render as
// degraded rows rather than being silently dropped — the user needs to see
// why an asset was skipped.
export type LegDegradeReason =
  | "non-evm-source"
  | "native-source-unsupported"
  | "wallet-not-connected"
  | "source-not-routable"
  | "no-target-vault"
  | "missing-output-token"
  | "amount-too-small";

export interface IntentLegSpec {
  id: string;
  mode: "per-asset" | "consolidate";
  source: {
    chainId: number;
    chainName: string;
    token: Address | string;
    symbol: string | undefined;
    decimals: number;
    amountRaw: string;
    amountDecimal: string;
    amountUsd: number | null;
  };
  destination: {
    vault: EarnVault;
    chainId: number;
    outputToken: Address;
    outputSymbol: string | undefined;
    recipient: Address;
  };
  status: "planned" | "degraded";
  degradedReason?: LegDegradeReason;
}

export interface RoutesIndex {
  has: (
    fromChainId: number,
    fromToken: string,
    toChainId: number,
    toToken: string,
  ) => boolean;
  isEmpty: boolean;
}

// Treat both `undefined` (fetch hasn't resolved) AND `[]` (resolved empty
// — either a transient cache state or a genuinely empty upstream response)
// as "coverage unknown" and optimistically allow every leg. The earlier
// stricter "`[]` means definitely empty" semantics caused the deposit-flow
// picker to disable every cross-chain source for ~200ms during the brief
// window where React Query had cached an empty result before the populated
// fetch completed. The downstream "No quote available" panel in
// `IntentBridgeStep` is the authoritative runtime gate.
export function buildRoutesIndex(routes: IntentRoute[] | undefined): RoutesIndex {
  if (routes === undefined || routes.length === 0) {
    return { isEmpty: true, has: () => true };
  }
  const set = new Set<string>();
  for (const r of routes) {
    if (!r.isActive) continue;
    const key = routeKey(
      Number(r.fromChain.chainId),
      r.fromToken.address,
      Number(r.toChain.chainId),
      r.toToken.address,
    );
    set.add(key);
  }
  return {
    isEmpty: set.size === 0,
    has: (fromChainId, fromToken, toChainId, toToken) =>
      set.has(routeKey(fromChainId, fromToken, toChainId, toToken)),
  };
}

function routeKey(
  fromChainId: number,
  fromToken: string,
  toChainId: number,
  toToken: string,
): string {
  return `${fromChainId}:${fromToken.toLowerCase()}>${toChainId}:${toToken.toLowerCase()}`;
}

interface BuildPlanArgs {
  intent: ParsedIntent;
  sourceAssets: IdleAsset[];
  /** Per-asset best vaults, index-aligned with `sourceAssets`. */
  perAssetVaults?: (EarnVault | null)[];
  consolidateVault?: EarnVault | null;
  walletAddress?: Address | null;
  routesIndex?: RoutesIndex;
}

const EVM_NON_EVM_TAG = /^solana|^sol|tron|tvm|svm/i;

// LI.FI's SVM/TVM chain ids are far above any real EIP-155 chain (Solana
// mainnet is 1151111081099710), so a 9-digit ceiling is a safe heuristic.
function isLikelyEvmChainId(chainId: number): boolean {
  return chainId > 0 && chainId < 1_000_000_000;
}

export function buildIntentLegPlan(args: BuildPlanArgs): IntentLegSpec[] {
  const {
    intent,
    sourceAssets,
    perAssetVaults,
    consolidateVault,
    walletAddress,
    routesIndex,
  } = args;

  return sourceAssets.map((asset, idx) => {
    const mode: IntentLegSpec["mode"] =
      intent.routing_mode === "consolidate" ? "consolidate" : "per-asset";
    const targetVault =
      mode === "consolidate" ? consolidateVault ?? null : perAssetVaults?.[idx] ?? null;

    const baseSource = {
      chainId: asset.chainId,
      chainName: asset.chainName,
      token: asset.token.address,
      symbol: asset.token.symbol,
      decimals: asset.token.decimals,
      amountRaw: asset.amountRaw,
      amountDecimal: asset.amountDecimal,
      amountUsd: asset.amountUsd,
    };

    const degrade = (reason: LegDegradeReason): IntentLegSpec => ({
      id: `${asset.chainId}:${asset.token.address.toLowerCase()}:${idx}`,
      mode,
      source: baseSource,
      destination: {
        // placeholder values — UI only reads these when status === 'planned'.
        vault: targetVault as EarnVault,
        chainId: targetVault?.chainId ?? 0,
        outputToken: ("0x0000000000000000000000000000000000000000" as Address),
        outputSymbol: targetVault?.underlyingTokens?.[0]?.symbol ?? "",
        recipient: ("0x0000000000000000000000000000000000000000" as Address),
      },
      status: "degraded",
      degradedReason: reason,
    });

    if (
      !isLikelyEvmChainId(asset.chainId) ||
      EVM_NON_EVM_TAG.test(asset.chainName)
    ) {
      return degrade("non-evm-source");
    }
    // OIF escrow expects ERC-20 transferFrom; native sources need wrapping.
    if (isNativeToken(asset.token.address)) {
      return degrade("native-source-unsupported");
    }
    if (!walletAddress) return degrade("wallet-not-connected");
    if (!targetVault) return degrade("no-target-vault");

    const outToken = targetVault.underlyingTokens?.[0];
    if (!outToken) return degrade("missing-output-token");

    if (
      routesIndex &&
      !routesIndex.has(
        asset.chainId,
        asset.token.address,
        targetVault.chainId,
        outToken.address,
      )
    ) {
      return degrade("source-not-routable");
    }

    if (BigInt(asset.amountRaw || "0") === 0n) {
      return degrade("amount-too-small");
    }

    return {
      id: `${asset.chainId}:${asset.token.address.toLowerCase()}:${targetVault.slug}`,
      mode,
      source: baseSource,
      destination: {
        vault: targetVault,
        chainId: targetVault.chainId,
        outputToken: outToken.address as Address,
        outputSymbol: outToken.symbol,
        recipient: walletAddress as Address,
      },
      status: "planned",
    };
  });
}

export function describeDegradeReason(reason: LegDegradeReason): string {
  switch (reason) {
    case "non-evm-source":
      return "Source is on a non-EVM chain — wagmi can't sign for it yet.";
    case "native-source-unsupported":
      return "Native tokens (ETH / native) aren't supported yet — wrap to WETH or pick an ERC-20.";
    case "wallet-not-connected":
      return "Connect a wallet to fund this leg.";
    case "source-not-routable":
      return "No active LI.FI Intent route for this token pair.";
    case "no-target-vault":
      return "No target vault selected for this asset.";
    case "missing-output-token":
      return "Target vault doesn't expose an underlying ERC-20.";
    case "amount-too-small":
      return "Amount is zero or below the dust threshold.";
  }
}
