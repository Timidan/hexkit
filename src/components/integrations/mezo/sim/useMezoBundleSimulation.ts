import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { decodeFunctionResult, type Address } from "viem";
import { MEZO_ABIS } from "../abi";
import { MEZO_RPC_URL } from "../constants";
import {
  simulateBundle,
  maxBalanceOverride,
  type StateOverrides,
} from "./ethSimulateV1";
import { encodeWrite } from "./buildCalls";
import { encodeView } from "./views";
import { decodeBundle } from "./decodeResults";
import type {
  SimulationRequest,
  SimulationResult,
  SimulationOutcome,
  ViewCallSpec,
} from "./types";
import type { MezoLegSpec } from "../pipeline/mezoLegs";

export function useMezoBundleSimulation(
  request: SimulationRequest | null,
  options: { enabled?: boolean } = {},
) {
  const { address } = useAccount();

  return useQuery<SimulationResult>({
    queryKey: ["mezo-sim", address, request ? serializeRequest(request) : null],
    enabled: !!(address && request && (options.enabled ?? true)),
    staleTime: 4_000,
    retry: 1,
    queryFn: async () => {
      if (!address || !request) throw new Error("missing inputs");
      return await runBundleSimulation(address, request);
    },
  });
}

async function runBundleSimulation(
  account: Address,
  request: SimulationRequest,
): Promise<SimulationResult> {
  const overrides: StateOverrides = {
    ...maxBalanceOverride(account),
  };

  // "FromPreviousLeg" views need a two-pass simulator (encode writes, read
  // tokenIds from returnData, re-encode views). Not yet wired in v1.
  const nonPoolResolvedViews: ViewCallSpec[] = request.views.map((v) => {
    if (
      v.kind === "veMezoBalanceOfNFTFromPreviousLeg" ||
      v.kind === "veMezoLockedFromPreviousLeg"
    ) {
      throw new Error(
        "useMezoBundleSimulation: FromPreviousLeg views require a two-pass simulator; not yet implemented in v1",
      );
    }
    return v;
  });
  const literalViews = await resolvePoolViews(account, nonPoolResolvedViews);
  const beforeViews = literalViews.filter((v) => viewPosition(v) === "before");
  const afterViews = literalViews.filter((v) => viewPosition(v) === "after");

  const result = await simulateBundle(MEZO_RPC_URL, {
    stateOverrides: overrides,
    calls: [
      ...beforeViews.map((view) => encodeView(account, view)),
      ...request.legs.map((leg) => encodeWrite(account, leg)),
      ...afterViews.map((view) => encodeView(account, view)),
    ],
  });

  const decoded = decodeBundle(result, request.legs, literalViews);

  const outcome = buildOutcome(request, decoded);
  const warnings = buildWarnings(decoded, outcome);

  return {
    legs: decoded.legs,
    views: decoded.views,
    outcome,
    warnings,
  };
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as Address;

function viewPosition(view: ViewCallSpec): "before" | "after" {
  return view.position ?? "after";
}

async function resolvePoolViews(
  account: Address,
  views: ViewCallSpec[],
): Promise<ViewCallSpec[]> {
  const poolCache = new Map<string, Address>();

  const resolvePool = async (
    tokenA: Address,
    tokenB: Address,
    stable: boolean,
  ): Promise<Address> => {
    const key = `${tokenA.toLowerCase()}:${tokenB.toLowerCase()}:${stable}`;
    const cached = poolCache.get(key);
    if (cached) return cached;

    const poolView: ViewCallSpec = {
      kind: "poolFactoryGetPool",
      tokenA,
      tokenB,
      stable,
    };
    const result = await simulateBundle(
      MEZO_RPC_URL,
      {
        calls: [encodeView(account, poolView)],
      },
      { traceTransfers: false },
    );
    const call = result.calls[0];
    if (!call || call.status !== "0x1") {
      throw new Error("PoolFactory.getPool simulation failed");
    }
    const pool = decodeFunctionResult({
      abi: MEZO_ABIS.PoolFactory,
      functionName: "getPool",
      data: call.returnData,
    }) as Address;
    poolCache.set(key, pool);
    return pool;
  };

  return Promise.all(
    views.map(async (view): Promise<ViewCallSpec> => {
      if (view.kind === "poolReservesForPair") {
        const pool = await resolvePool(view.tokenA, view.tokenB, view.stable);
        if (isZeroAddress(pool)) {
          return {
            kind: "poolFactoryGetPool",
            tokenA: view.tokenA,
            tokenB: view.tokenB,
            stable: view.stable,
            position: view.position,
          };
        }
        return { kind: "poolReserves", pool, position: view.position };
      }

      if (view.kind === "lpBalanceOfForPair") {
        const pool = await resolvePool(view.tokenA, view.tokenB, view.stable);
        if (isZeroAddress(pool)) {
          return {
            kind: "poolFactoryGetPool",
            tokenA: view.tokenA,
            tokenB: view.tokenB,
            stable: view.stable,
            position: view.position,
          };
        }
        return {
          kind: "lpBalanceOf",
          lp: pool,
          account: view.account,
          position: view.position,
        };
      }

      if (view.kind === "lpTotalSupplyForPair") {
        const pool = await resolvePool(view.tokenA, view.tokenB, view.stable);
        if (isZeroAddress(pool)) {
          return {
            kind: "poolFactoryGetPool",
            tokenA: view.tokenA,
            tokenB: view.tokenB,
            stable: view.stable,
            position: view.position,
          };
        }
        return {
          kind: "lpTotalSupply",
          lp: pool,
          position: view.position,
        };
      }

      return view;
    }),
  );
}

function isZeroAddress(addr: Address): boolean {
  return addr.toLowerCase() === ZERO_ADDR;
}

function buildOutcome(
  request: SimulationRequest,
  decoded: ReturnType<typeof decodeBundle>,
): SimulationOutcome {
  const findView = (kind: string, position?: "before" | "after") =>
    decoded.views.find(
      (v) =>
        v.spec.kind === kind &&
        (position === undefined || viewPosition(v.spec) === position),
    );

  const musdAfter =
    (findView("musdBalanceOf")?.decoded as bigint | undefined) ??
    request.beforeBalances.musd.after;
  const sMusdAfter =
    (findView("sMusdBalanceOf")?.decoded as bigint | undefined) ??
    request.beforeBalances.sMusd.after;
  const mezoAfter =
    (findView("mezoBalanceOf")?.decoded as bigint | undefined) ??
    request.beforeBalances.mezo.after;

  // BTC: not readable via eth_call; derive from native value transfers in
  // the openTrove / troveAdjust legs.
  let btcAfter = request.beforeBalances.btc.before;
  for (const leg of decoded.legs) {
    if (leg.spec.type === "openTrove") {
      btcAfter -= leg.spec.collateralWei;
    } else if (leg.spec.type === "troveAdjust") {
      btcAfter -= leg.spec.collDeposit;
      btcAfter += leg.spec.collWithdrawal;
    }
  }

  let trove: SimulationOutcome["trove"] = null;
  const troveView = findView("troveDebtCollateral");
  if (troveView && troveView.decoded) {
    try {
      const raw = troveView.decoded as readonly [
        bigint,
        bigint,
        bigint,
        bigint,
        number,
        bigint,
        bigint,
        bigint,
        bigint,
      ];
      const [coll, principal, interestOwed, , status] = raw;
      const debt = principal + interestOwed;
      if (status === 1) {
        const priceView = findView("priceFeedFetch");
        const price =
          (priceView?.decoded as bigint | undefined) ?? 77365n * 10n ** 18n;
        const icrBps = Number((coll * price * 10000n) / (debt * 10n ** 18n));
        const liquidationPriceUsd =
          (Number(debt) * 1.1) / 1e18 / (Number(coll) / 1e18);
        trove = { debt, collateral: coll, icrBps, liquidationPriceUsd };
      }
    } catch {
      trove = null;
    }
  }

  const swapLeg = decoded.legs.map((l) => l.spec).find(isSwapLegSpec);
  let swap: SimulationOutcome["swap"] = null;
  if (swapLeg) {
    const quoteAmounts = findView("routerGetAmountsOut", "before")?.decoded as
      | readonly bigint[]
      | undefined;
    const quotedOut =
      quoteAmounts && quoteAmounts.length > 0
        ? quoteAmounts[quoteAmounts.length - 1]
        : undefined;
    const outputBalanceBefore = findView(
      "erc20BalanceOf",
      "before",
    )?.decoded as bigint | undefined;
    const outputBalanceAfter = findView("erc20BalanceOf", "after")?.decoded as
      | bigint
      | undefined;
    const outputDelta =
      outputBalanceBefore !== undefined && outputBalanceAfter !== undefined
        ? outputBalanceAfter - outputBalanceBefore
        : undefined;
    swap = {
      amountOut: quotedOut ?? outputDelta,
      amountOutMin: swapLeg.amountOutMin,
      outputBalanceBefore,
      outputBalanceAfter,
      outputDelta,
    };
  }

  const liquidityLeg = decoded.legs
    .map((l) => l.spec)
    .find(isLiquidityLegSpec);
  let liquidity: SimulationOutcome["liquidity"] = null;
  if (liquidityLeg) {
    const lpBalanceBefore = findView("lpBalanceOf", "before")?.decoded as
      | bigint
      | undefined;
    const lpBalanceAfter = findView("lpBalanceOf", "after")?.decoded as
      | bigint
      | undefined;
    const lpTotalSupplyBefore = findView(
      "lpTotalSupply",
      "before",
    )?.decoded as bigint | undefined;
    const lpTotalSupplyAfter = findView("lpTotalSupply", "after")?.decoded as
      | bigint
      | undefined;
    const reservesBefore = findView("poolReserves", "before")?.decoded as
      | readonly [bigint, bigint, bigint]
      | undefined;
    const reservesAfter = findView("poolReserves", "after")?.decoded as
      | readonly [bigint, bigint, bigint]
      | undefined;
    const lpTokensReceived =
      lpBalanceBefore !== undefined && lpBalanceAfter !== undefined
        ? lpBalanceAfter - lpBalanceBefore
        : undefined;
    const poolShareBps =
      lpTokensReceived !== undefined &&
      lpTotalSupplyAfter !== undefined &&
      lpTotalSupplyAfter > 0n
        ? Number((lpTokensReceived * 10000n) / lpTotalSupplyAfter)
        : undefined;

    liquidity = {
      lpTokensReceived,
      poolShareBps,
      lpBalanceBefore,
      lpBalanceAfter,
      lpTotalSupplyBefore,
      lpTotalSupplyAfter,
      reserve0Before: reservesBefore?.[0],
      reserve1Before: reservesBefore?.[1],
      reserve0After: reservesAfter?.[0],
      reserve1After: reservesAfter?.[1],
    };
  }

  return {
    balances: {
      btc: { before: request.beforeBalances.btc.before, after: btcAfter },
      musd: { before: request.beforeBalances.musd.before, after: musdAfter },
      sMusd: {
        before: request.beforeBalances.sMusd.before,
        after: sMusdAfter,
      },
      mezo: { before: request.beforeBalances.mezo.before, after: mezoAfter },
    },
    trove,
    veMezo: null,
    swap,
    liquidity,
  };
}

function buildWarnings(
  decoded: ReturnType<typeof decodeBundle>,
  outcome: SimulationOutcome,
): SimulationResult["warnings"] {
  const warnings: SimulationResult["warnings"] = [];

  // Per-step revert reasons are surfaced inline in DecodedLegList; no
  // duplicate banner here.

  if (outcome.trove) {
    if (outcome.trove.icrBps < 13000) {
      warnings.push({
        severity: outcome.trove.icrBps < 11500 ? "caution" : "warning",
        text: `Collateral ratio ${(outcome.trove.icrBps / 100).toFixed(0)}% — close to liquidation threshold (110%).`,
      });
    }
  }

  return warnings;
}

function isSwapLegSpec(
  spec: MezoLegSpec,
): spec is Extract<MezoLegSpec, { type: "routerSwap" }> {
  return spec.type === "routerSwap";
}

function isLiquidityLegSpec(
  spec: MezoLegSpec,
): spec is Extract<MezoLegSpec, { type: "routerAddLiquidity" }> {
  return spec.type === "routerAddLiquidity";
}

function serializeRequest(req: SimulationRequest): string {
  return JSON.stringify(req, (_k, v) =>
    typeof v === "bigint" ? `0x${v.toString(16)}` : v,
  );
}

export function decodeBalanceOfView(returnData: `0x${string}`): bigint {
  return decodeFunctionResult({
    abi: MEZO_ABIS.MUSD,
    functionName: "balanceOf",
    data: returnData,
  }) as bigint;
}
