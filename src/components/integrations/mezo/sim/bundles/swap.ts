import type { Address } from "viem";
import {
  MEZO_CONTRACTS,
  toMezoPoolTokenAddress,
} from "../../../../../../data/mezoContracts";
import type {
  MezoLegSpec,
  MezoRouterRoute,
} from "../../pipeline/mezoLegs";
import type { ViewCallSpec } from "../types";

export interface SwapBundleParams {
  account: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOutMin: bigint;
  stable: boolean;
  deadlineSec: bigint;
}

export function buildSwapBundle(p: SwapBundleParams): {
  legs: MezoLegSpec[];
  views: ViewCallSpec[];
} {
  const tokenIn = toMezoPoolTokenAddress(p.tokenIn);
  const tokenOut = toMezoPoolTokenAddress(p.tokenOut);

  if (sameAddress(tokenIn, tokenOut)) {
    throw new Error("buildSwapBundle: tokenIn and tokenOut must differ");
  }

  const route: MezoRouterRoute = {
    from: tokenIn,
    to: tokenOut,
    stable: p.stable,
    factory: MEZO_CONTRACTS.PoolFactory,
  };
  const routes = [route] as const;

  // Mezo's Router only exposes `swapExactTokensForTokens` — there is no
  // ETH-native variant. BTC on Mezo is an ERC-20 surface (0x7b7C…0000)
  // bound to native, so we always approve+swap as if it were a normal token.
  const legs: MezoLegSpec[] = [
    {
      type: "approveErc20",
      token: tokenIn,
      spender: MEZO_CONTRACTS.Router,
      amount: p.amountIn,
      tokenLabel: tokenLabel(tokenIn),
    },
    {
      type: "routerSwap",
      amountIn: p.amountIn,
      amountOutMin: p.amountOutMin,
      routes,
      to: p.account,
      deadline: p.deadlineSec,
    },
  ];

  const views: ViewCallSpec[] = [
    {
      kind: "routerGetAmountsOut",
      amountIn: p.amountIn,
      routes,
      position: "before",
    },
    {
      kind: "erc20BalanceOf",
      token: tokenOut,
      account: p.account,
      tokenLabel: tokenLabel(tokenOut),
      position: "before",
    },
    {
      kind: "erc20BalanceOf",
      token: tokenOut,
      account: p.account,
      tokenLabel: tokenLabel(tokenOut),
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
