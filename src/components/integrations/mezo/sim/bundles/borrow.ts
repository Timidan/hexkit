import type { Address } from "viem";
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
