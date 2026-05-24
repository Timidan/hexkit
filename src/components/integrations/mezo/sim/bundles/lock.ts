import type { Address } from "viem";
import { MEZO_CONTRACTS } from "../../../../../../data/mezoContracts";
import type { MezoLegSpec } from "../../pipeline/mezoLegs";
import type { ViewCallSpec } from "../types";

export interface LockParams {
  account: Address;
  mezoLockAmount: bigint;
  lockDurationSeconds: bigint;
}

/**
 * Lock bundle: approve MEZO → veMezo.createLock. View reads MEZO balance
 * after to confirm the spend.
 */
export function buildLockBundle(params: LockParams): {
  legs: MezoLegSpec[];
  views: ViewCallSpec[];
} {
  const legs: MezoLegSpec[] = [
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
  ];

  const views: ViewCallSpec[] = [
    { kind: "mezoBalanceOf", account: params.account },
  ];

  return { legs, views };
}
