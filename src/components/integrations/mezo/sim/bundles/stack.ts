import type { Address } from "viem";
import { MEZO_CONTRACTS } from "../../../../../../data/mezoContracts";
import type { MezoLegSpec } from "../../pipeline/mezoLegs";
import type { ViewCallSpec } from "../types";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as Address;

export interface StackParams {
  account: Address;
  collateralBtcWei: bigint;
  debtMusd: bigint;
  sMusdDepositAmount: bigint;
  mezoLockAmount: bigint;
  lockDurationSeconds: bigint;
  /**
   * SortedTroves hint for the openTrove insertion. With 100s of existing
   * troves on testnet, zero-address hints make the contract revert with no
   * data. Pass any existing trove (head/tail) and the contract walks the
   * list correctly.
   */
  troveInsertHint?: Address;
  /**
   * Skip the openTrove leg when the user already has an active trove.
   * The remaining legs (sMUSD deposit, veMEZO lock) execute against
   * existing balances instead of freshly minted MUSD/MEZO.
   */
  skipOpenTrove?: boolean;
}

/**
 * Starter Stack: openTrove → approve MUSD → sMUSD.deposit → approve MEZO →
 * veMezo.createLock. Views read post-state balances, trove, and ICR.
 */
export function buildStackBundle(params: StackParams): {
  legs: MezoLegSpec[];
  views: ViewCallSpec[];
  priceFeedViewIdx: number;
} {
  const hint = params.troveInsertHint ?? ZERO_ADDR;
  const legs: MezoLegSpec[] = [];
  if (!params.skipOpenTrove) {
    legs.push({
      type: "openTrove",
      debtAmount: params.debtMusd,
      collateralWei: params.collateralBtcWei,
      upperHint: hint,
      lowerHint: hint,
    });
  }
  legs.push(
    {
      type: "approveErc20",
      token: MEZO_CONTRACTS.MUSD,
      spender: MEZO_CONTRACTS.sMUSD,
      amount: params.sMusdDepositAmount,
      tokenLabel: "MUSD",
    },
    {
      type: "sMusdDeposit",
      amount: params.sMusdDepositAmount,
    },
    {
      type: "approveErc20",
      token: MEZO_CONTRACTS.MEZO,
      spender: MEZO_CONTRACTS.veMEZO,
      amount: params.mezoLockAmount,
      tokenLabel: "MEZO",
    },
    {
      type: "veMezoCreateLock",
      amount: params.mezoLockAmount,
      lockDuration: params.lockDurationSeconds,
    },
  );

  const views: ViewCallSpec[] = [
    { kind: "priceFeedFetch" },
    { kind: "musdBalanceOf", account: params.account },
    { kind: "sMusdBalanceOf", account: params.account },
    { kind: "mezoBalanceOf", account: params.account },
    { kind: "troveDebtCollateral", account: params.account },
  ];

  return {
    legs,
    views,
    priceFeedViewIdx: 0,
  };
}
