import type { Address, Hex } from "viem";
import type { MezoLegSpec, MezoRouterRoute } from "../pipeline/mezoLegs";

/**
 * Simulation types for the `eth_simulateV1` bundle pipeline (Mezo chain
 * 31611). The RPC executes a multi-leg bundle in one round-trip and returns
 * per-call { status, gasUsed, returnData, logs } plus synthetic Transfer
 * logs for native BTC moves when traceTransfers=true.
 */

/**
 * View calls appended to a bundle to read end-state. "FromPreviousLeg"
 * variants depend on a prior leg's return data (e.g., tokenId from
 * veMezo.createLock) and are resolved to literals by the runner before
 * encoding.
 */
export type ViewCallPosition = "before" | "after";

export type ViewCallSpec =
  | { kind: "musdBalanceOf"; account: Address; position?: ViewCallPosition }
  | { kind: "sMusdBalanceOf"; account: Address; position?: ViewCallPosition }
  | { kind: "mezoBalanceOf"; account: Address; position?: ViewCallPosition }
  | {
      kind: "erc20BalanceOf";
      token: Address;
      account: Address;
      tokenLabel?: string;
      position?: ViewCallPosition;
    }
  | { kind: "troveDebtCollateral"; account: Address; position?: ViewCallPosition }
  | {
      kind: "currentIcr";
      account: Address;
      priceWei: bigint;
      position?: ViewCallPosition;
    }
  | { kind: "priceFeedFetch"; position?: ViewCallPosition }
  | { kind: "veMezoBalanceOfNFTLiteral"; tokenId: bigint; position?: ViewCallPosition }
  | { kind: "veMezoLockedLiteral"; tokenId: bigint; position?: ViewCallPosition }
  | {
      kind: "veMezoBalanceOfNFTFromPreviousLeg";
      legIdx: number;
      position?: ViewCallPosition;
    }
  | {
      kind: "veMezoLockedFromPreviousLeg";
      legIdx: number;
      position?: ViewCallPosition;
    }
  | {
      kind: "routerGetAmountsOut";
      amountIn: bigint;
      routes: readonly MezoRouterRoute[];
      position?: ViewCallPosition;
    }
  | {
      kind: "poolFactoryGetPool";
      tokenA: Address;
      tokenB: Address;
      stable: boolean;
      position?: ViewCallPosition;
    }
  | {
      kind: "poolReservesForPair";
      tokenA: Address;
      tokenB: Address;
      stable: boolean;
      position?: ViewCallPosition;
    }
  | {
      kind: "lpBalanceOfForPair";
      tokenA: Address;
      tokenB: Address;
      stable: boolean;
      account: Address;
      position?: ViewCallPosition;
    }
  | {
      kind: "lpTotalSupplyForPair";
      tokenA: Address;
      tokenB: Address;
      stable: boolean;
      position?: ViewCallPosition;
    }
  | { kind: "lpBalanceOf"; lp: Address; account: Address; position?: ViewCallPosition }
  | { kind: "lpTotalSupply"; lp: Address; position?: ViewCallPosition }
  | {
      kind: "gaugeBalanceOf";
      gauge: Address;
      account: Address;
      position?: ViewCallPosition;
    }
  | { kind: "poolReserves"; pool: Address; position?: ViewCallPosition };

export interface SimLog {
  address: Address;
  topics: Hex[];
  data: Hex;
}

export interface DecodedLeg {
  spec: MezoLegSpec;
  status: "success" | "reverted";
  gasUsed: bigint;
  returnData: Hex;
  logs: SimLog[];
  revertReason?: string;
  decodedSummary: string;
}

export interface DecodedView {
  spec: ViewCallSpec;
  returnData: Hex;
  decoded: unknown;
}

export interface SimulationBalances {
  btc: { before: bigint; after: bigint };
  musd: { before: bigint; after: bigint };
  sMusd: { before: bigint; after: bigint };
  mezo: { before: bigint; after: bigint };
}

export interface SimulationTrove {
  debt: bigint;
  collateral: bigint;
  icrBps: number;
  liquidationPriceUsd: number;
}

export interface SimulationVeMezo {
  tokenId: bigint;
  votingPower: bigint;
  lockEnd: bigint;
}

export interface SimulationSwap {
  amountOut?: bigint;
  amountOutMin: bigint;
  outputBalanceBefore?: bigint;
  outputBalanceAfter?: bigint;
  outputDelta?: bigint;
  priceImpactBps?: number;
}

export interface SimulationLiquidity {
  lpTokensReceived?: bigint;
  poolShareBps?: number;
  lpBalanceBefore?: bigint;
  lpBalanceAfter?: bigint;
  lpTotalSupplyBefore?: bigint;
  lpTotalSupplyAfter?: bigint;
  reserve0Before?: bigint;
  reserve1Before?: bigint;
  reserve0After?: bigint;
  reserve1After?: bigint;
}

export interface SimulationOutcome {
  balances: SimulationBalances;
  trove?: SimulationTrove | null;
  veMezo?: SimulationVeMezo | null;
  swap?: SimulationSwap | null;
  liquidity?: SimulationLiquidity | null;
}

export interface SimulationWarning {
  severity: "info" | "warning" | "caution";
  text: string;
}

export interface SimulationRequest {
  legs: MezoLegSpec[];
  views: ViewCallSpec[];
  beforeBalances: SimulationBalances;
}

export interface SimulationResult {
  legs: DecodedLeg[];
  views: DecodedView[];
  outcome: SimulationOutcome;
  warnings: SimulationWarning[];
}
