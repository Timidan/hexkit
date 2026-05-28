import type { Address } from "viem";
import { MEZO_CONTRACTS } from "../../../../../../data/mezoContracts";
import type { MezoLegSpec } from "../../pipeline/mezoLegs";
import type { ViewCallSpec } from "../types";

export interface SaveParams {
  account: Address;
  musdDepositAmount: bigint;
}

/**
 * Direct yield deposit: approve MUSD → sMUSD.deposit. Views read MUSD +
 * sMUSD balances to show the conversion.
 */
export function buildSaveBundle(params: SaveParams): {
  legs: MezoLegSpec[];
  views: ViewCallSpec[];
} {
  const legs: MezoLegSpec[] = [
    {
      type: "approveErc20",
      token: MEZO_CONTRACTS.MUSD,
      spender: MEZO_CONTRACTS.sMUSD,
      amount: params.musdDepositAmount,
      tokenLabel: "MUSD",
    },
    {
      type: "sMusdDeposit",
      amount: params.musdDepositAmount,
    },
  ];

  const views: ViewCallSpec[] = [
    { kind: "musdBalanceOf", account: params.account },
    { kind: "sMusdBalanceOf", account: params.account },
  ];

  return { legs, views };
}
