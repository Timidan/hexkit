import type { Address } from "viem";
import {
  MEZO_CONTRACTS,
  toMezoPoolTokenAddress,
} from "../../../../../../data/mezoContracts";
import type { MezoLegSpec } from "../../pipeline/mezoLegs";
import type { ViewCallSpec } from "../types";

export interface LiquidityBundleParams {
  account: Address;
  tokenA: Address;
  tokenB: Address;
  stable: boolean;
  amountADesired: bigint;
  amountBDesired: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  deadlineSec: bigint;
}

export function buildLiquidityBundle(p: LiquidityBundleParams): {
  legs: MezoLegSpec[];
  views: ViewCallSpec[];
} {
  const tokenA = toMezoPoolTokenAddress(p.tokenA);
  const tokenB = toMezoPoolTokenAddress(p.tokenB);

  if (sameAddress(tokenA, tokenB)) {
    throw new Error("buildLiquidityBundle: tokenA and tokenB must differ");
  }

  // Mezo's Router has no `addLiquidityETH` — BTC on Mezo is the ERC-20
  // surface at 0x7b7C…0000, so we always approve+addLiquidity. Same
  // pattern as the swap builder.
  const legs: MezoLegSpec[] = [
    {
      type: "approveErc20",
      token: p.tokenA,
      spender: MEZO_CONTRACTS.Router,
      amount: p.amountADesired,
      tokenLabel: tokenLabel(p.tokenA),
    },
    {
      type: "approveErc20",
      token: p.tokenB,
      spender: MEZO_CONTRACTS.Router,
      amount: p.amountBDesired,
      tokenLabel: tokenLabel(p.tokenB),
    },
    {
      type: "routerAddLiquidity",
      tokenA: p.tokenA,
      tokenB: p.tokenB,
      stable: p.stable,
      amountADesired: p.amountADesired,
      amountBDesired: p.amountBDesired,
      amountAMin: p.amountAMin,
      amountBMin: p.amountBMin,
      to: p.account,
      deadline: p.deadlineSec,
    },
  ];

  const views: ViewCallSpec[] = [
    {
      kind: "poolReservesForPair",
      tokenA,
      tokenB,
      stable: p.stable,
      position: "before",
    },
    {
      kind: "lpBalanceOfForPair",
      tokenA,
      tokenB,
      stable: p.stable,
      account: p.account,
      position: "before",
    },
    {
      kind: "lpTotalSupplyForPair",
      tokenA,
      tokenB,
      stable: p.stable,
      position: "before",
    },
    {
      kind: "poolReservesForPair",
      tokenA,
      tokenB,
      stable: p.stable,
      position: "after",
    },
    {
      kind: "lpBalanceOfForPair",
      tokenA,
      tokenB,
      stable: p.stable,
      account: p.account,
      position: "after",
    },
    {
      kind: "lpTotalSupplyForPair",
      tokenA,
      tokenB,
      stable: p.stable,
      position: "after",
    },
  ];

  return { legs, views };
}

function sameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function tokenLabel(token: Address): string {
  if (sameAddress(token, MEZO_CONTRACTS.BTC)) return "BTC";
  if (sameAddress(token, MEZO_CONTRACTS.MUSD)) return "MUSD";
  if (sameAddress(token, MEZO_CONTRACTS.MEZO)) return "MEZO";
  return "token";
}
