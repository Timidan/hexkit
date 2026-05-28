import type { Address, Hex } from "viem";
import type { SimLog } from "./types";

/**
 * Raw JSON-RPC client for `eth_simulateV1` against Mezo testnet (Mezod
 * 11.0.0-rc0). The method is not yet finalized in execution-apis; schema
 * may drift across Mezod versions — the contract test at
 * `__tests__/ethSimulateV1.contract.test.ts` pins the current shape.
 */

export interface SimCall {
  from: Address;
  to: Address;
  input?: Hex;
  value?: Hex;
  gas?: Hex;
  nonce?: Hex;
}

export interface StateOverrideEntry {
  balance?: Hex;
  code?: Hex;
  state?: Record<Hex, Hex>;
  stateDiff?: Record<Hex, Hex>;
  nonce?: Hex;
}

export type StateOverrides = Record<string, StateOverrideEntry>;

export interface BlockStateCall {
  stateOverrides?: StateOverrides;
  calls: SimCall[];
}

export interface SimulateV1Options {
  /** Whether the node should synthesize Transfer logs for native moves. */
  traceTransfers?: boolean;
  /** Skip nonce/baseFee/intrinsic-gas validation — appropriate for preview UX. */
  validation?: boolean;
}

export interface SimulatedCall {
  status: "0x1" | "0x0";
  returnData: Hex;
  gasUsed: Hex;
  logs: SimLog[];
  error?: { message: string };
}

export interface SimulatedBlock {
  calls: SimulatedCall[];
}

/**
 * Generous balance override (10,000 BTC in wei) — high enough for any Mezo
 * Lens bundle yet small enough to avoid Mezod's internal integer-overflow
 * path that triggers on 2^256-1. We deliberately don't use MAX_UINT256
 * here because Mezo's node rejects it with "rpc error: integer overflow".
 */
const GENEROUS_BALANCE_HEX = ("0x" +
  (10000n * 10n ** 18n).toString(16)) as Hex;

export function maxBalanceOverride(addr: Address): StateOverrides {
  return { [addr.toLowerCase()]: { balance: GENEROUS_BALANCE_HEX } };
}

/**
 * Mezo's eth_simulateV1 enforces intrinsic gas even with validation=false
 * (passing 0 fails with "intrinsic gas too low") AND enforces a per-bundle
 * block gas limit of ~10M. Legs that need more (e.g. openTrove walking
 * SortedTroves with 200+ entries needs ~4M) set their own `gas` field via
 * the encoder. The remaining budget is split across calls that didn't set
 * one explicitly.
 */
const BUNDLE_GAS_BUDGET = 9_500_000n;
const MIN_CALL_GAS = 100_000n;

export async function simulateBundle(
  rpcUrl: string,
  blockStateCall: BlockStateCall,
  options: SimulateV1Options = {},
): Promise<SimulatedBlock> {
  let reservedGas = 0n;
  let callsNeedingDefault = 0n;
  for (const call of blockStateCall.calls) {
    if (call.gas) {
      reservedGas += BigInt(call.gas);
    } else {
      callsNeedingDefault += 1n;
    }
  }
  const remainingBudget =
    BUNDLE_GAS_BUDGET > reservedGas ? BUNDLE_GAS_BUDGET - reservedGas : 0n;
  const share =
    callsNeedingDefault > 0n ? remainingBudget / callsNeedingDefault : 0n;
  const perCallDefault = share < MIN_CALL_GAS ? MIN_CALL_GAS : share;
  const defaultGas = `0x${perCallDefault.toString(16)}` as Hex;
  const callsWithGas: SimCall[] = blockStateCall.calls.map((call) =>
    call.gas ? call : { ...call, gas: defaultGas },
  );

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_simulateV1",
    params: [
      {
        blockStateCalls: [{ ...blockStateCall, calls: callsWithGas }],
        traceTransfers: options.traceTransfers ?? true,
        validation: options.validation ?? false,
      },
      "latest",
    ],
  };

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`eth_simulateV1 HTTP ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    error?: { code: number; message: string };
    result?: SimulatedBlock[];
  };

  if (json.error) {
    throw new Error(
      `eth_simulateV1 RPC ${json.error.code}: ${json.error.message}`,
    );
  }

  const block = json.result?.[0];
  if (!block) {
    throw new Error("eth_simulateV1: empty result");
  }

  return block;
}
