import type { Address } from "viem";

export interface MezoRouterRoute {
  from: Address;
  to: Address;
  stable: boolean;
  factory: Address;
}

/**
 * Every write Mezo Lens can perform. v1 variants have handlers; v2
 * variants exist for forward-typed dispatch (throw at encode/execute time).
 */
export type MezoLegSpec =
  | {
      type: "openTrove";
      debtAmount: bigint;
      collateralWei: bigint;
      upperHint: Address;
      lowerHint: Address;
    }
  | {
      type: "troveAdjust";
      collDeposit: bigint;
      collWithdrawal: bigint;
      debtChange: bigint;
      isDebtIncrease: boolean;
      upperHint: Address;
      lowerHint: Address;
    }
  | { type: "repayMUSD"; amount: bigint; upperHint: Address; lowerHint: Address }
  | { type: "closeTrove" }
  | {
      type: "approveErc20";
      token: Address;
      spender: Address;
      amount: bigint;
      tokenLabel: string;
    }
  | { type: "sMusdDeposit"; amount: bigint }
  | { type: "sMusdWithdraw"; amount: bigint }
  | { type: "gaugeDeposit"; gauge: Address; amount: bigint; gaugeLabel: string }
  | { type: "gaugeWithdraw"; gauge: Address; amount: bigint }
  | { type: "gaugeClaim"; gauge: Address }
  | {
      type: "routerSwap";
      amountIn: bigint;
      amountOutMin: bigint;
      routes: readonly MezoRouterRoute[];
      to: Address;
      deadline: bigint;
    }
  | {
      type: "routerAddLiquidity";
      tokenA: Address;
      tokenB: Address;
      stable: boolean;
      amountADesired: bigint;
      amountBDesired: bigint;
      amountAMin: bigint;
      amountBMin: bigint;
      to: Address;
      deadline: bigint;
    }
  | {
      type: "redeemCollateral";
      musdAmount: bigint;
      firstRedemptionHint: Address;
      upperPartialRedemptionHint: Address;
      lowerPartialRedemptionHint: Address;
      partialRedemptionHintNICR: bigint;
      maxIterations: bigint;
      maxFeePercentage: bigint;
    }
  | { type: "veMezoCreateLock"; amount: bigint; lockDuration: bigint }
  | { type: "veMezoIncreaseAmount"; tokenId: bigint; amount: bigint }
  | { type: "veMezoIncreaseUnlockTime"; tokenId: bigint; lockDuration: bigint };

/**
 * planned → ready → signing → confirming → confirmed.
 * Failure → `failed`; rejection → `rejected`; both retry to `ready`.
 */
export type LegStatus =
  | "planned"
  | "ready"
  | "signing"
  | "confirming"
  | "confirmed"
  | "failed"
  | "rejected";

export interface LegRun {
  id: string;
  spec: MezoLegSpec;
  status: LegStatus;
  txHash?: `0x${string}`;
  error?: string;
  decodedSummary: string;
}
