import type { Address } from "viem";
import {
  MEZO_CONTRACTS,
  MUSD_GAS_COMPENSATION,
} from "../../../../../../data/mezoContracts";
import type { MezoLegSpec } from "../../pipeline/mezoLegs";
import type { ViewCallSpec } from "../types";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as Address;

export interface BorrowOpenParams {
  account: Address;
  collateralBtcWei: bigint;
  debtMusd: bigint;
  troveInsertHint?: Address;
}

/**
 * Standalone openTrove bundle. Views read MUSD balance, trove state, and
 * price feed for the resulting-trove panel.
 */
export function buildBorrowOpenBundle(params: BorrowOpenParams): {
  legs: MezoLegSpec[];
  views: ViewCallSpec[];
} {
  const hint = params.troveInsertHint ?? ZERO_ADDR;
  const legs: MezoLegSpec[] = [
    {
      type: "openTrove",
      debtAmount: params.debtMusd,
      collateralWei: params.collateralBtcWei,
      upperHint: hint,
      lowerHint: hint,
    },
  ];

  const views: ViewCallSpec[] = [
    { kind: "priceFeedFetch" },
    { kind: "musdBalanceOf", account: params.account },
    { kind: "troveDebtCollateral", account: params.account },
  ];

  return { legs, views };
}

export interface BorrowAdjustParams {
  account: Address;
  /** BTC to deposit as additional collateral (0 = no add). */
  collDeposit: bigint;
  /** BTC to withdraw from collateral (0 = no withdraw). */
  collWithdrawal: bigint;
  /** Magnitude of debt change. Use isDebtIncrease to indicate direction. */
  debtChange: bigint;
  /** true = borrow more MUSD, false = repay MUSD. */
  isDebtIncrease: boolean;
  troveInsertHint?: Address;
}

/**
 * adjustTrove bundle covering both directions in one call. When repaying
 * (isDebtIncrease=false && debtChange>0) we prepend a MUSD approve so the
 * contract can pull the repayment.
 */
export function buildBorrowAdjustBundle(params: BorrowAdjustParams): {
  legs: MezoLegSpec[];
  views: ViewCallSpec[];
} {
  const hint = params.troveInsertHint ?? ZERO_ADDR;
  const legs: MezoLegSpec[] = [];

  const repaying = !params.isDebtIncrease && params.debtChange > 0n;
  if (repaying) {
    legs.push({
      type: "approveErc20",
      token: MEZO_CONTRACTS.MUSD,
      spender: MEZO_CONTRACTS.BorrowerOperations,
      amount: params.debtChange,
      tokenLabel: "MUSD",
    });
  }

  legs.push({
    type: "troveAdjust",
    collDeposit: params.collDeposit,
    collWithdrawal: params.collWithdrawal,
    debtChange: params.debtChange,
    isDebtIncrease: params.isDebtIncrease,
    upperHint: hint,
    lowerHint: hint,
  });

  const views: ViewCallSpec[] = [
    { kind: "priceFeedFetch" },
    { kind: "musdBalanceOf", account: params.account },
    { kind: "troveDebtCollateral", account: params.account },
  ];

  return { legs, views };
}

export interface BorrowCloseParams {
  account: Address;
  /** Current trove debt; required to size the MUSD approve. */
  debtMusd: bigint;
}

/**
 * closeTrove bundle. BorrowerOperations only pulls `debt - GAS_COMP` from
 * the user (the 200 MUSD gas comp lives in the protocol's Gas Pool and is
 * burned automatically on clean close — never the user's cost). So we
 * approve exactly the pull amount, then call closeTrove.
 */
export function buildBorrowCloseBundle(params: BorrowCloseParams): {
  legs: MezoLegSpec[];
  views: ViewCallSpec[];
} {
  const repayAmount =
    params.debtMusd > MUSD_GAS_COMPENSATION
      ? params.debtMusd - MUSD_GAS_COMPENSATION
      : 0n;
  const legs: MezoLegSpec[] = [
    {
      type: "approveErc20",
      token: MEZO_CONTRACTS.MUSD,
      spender: MEZO_CONTRACTS.BorrowerOperations,
      amount: repayAmount,
      tokenLabel: "MUSD",
    },
    { type: "closeTrove" },
  ];

  const views: ViewCallSpec[] = [
    { kind: "priceFeedFetch" },
    { kind: "musdBalanceOf", account: params.account },
    { kind: "troveDebtCollateral", account: params.account },
  ];

  return { legs, views };
}
