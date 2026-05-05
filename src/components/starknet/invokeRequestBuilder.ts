import type {
  InvokeV3,
  SimulateRequest,
  SimulationFlag,
} from "@/chains/starknet/simulatorTypes";
import { transformRequestForBridge } from "@/chains/starknet/simulatorClient";
import { hash as starknetHash, num as starknetNum } from "starknet";

const FELT_HEX = /^0x[0-9a-fA-F]{1,64}$/;
const HEX_OR_DEC = /^(0x[0-9a-fA-F]+|\d+)$/;

/** Neutral-default sender — Starknet's 0x1 is the canonical "system"
 *  caller used by simulator/blockifier when no real account is needed. */
export const NEUTRAL_SENDER =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

export interface InvokeFormState {
  blockId: "latest" | "number";
  blockNumber: string;
  senderAddress: string;
  nonce: string;
  /** newline / comma / whitespace-separated felt list */
  calldata: string;
  signature: string;
  l1MaxAmount: string;
  l1MaxPrice: string;
  l1DataMaxAmount: string;
  l1DataMaxPrice: string;
  l2MaxAmount: string;
  l2MaxPrice: string;
  tip: string;
  skipValidate: boolean;
  skipFeeCharge: boolean;
  debugEnabled: boolean;
}

export const DEFAULT_INVOKE_FORM: InvokeFormState = {
  blockId: "latest",
  blockNumber: "",
  // Pre-fill the neutral sender so Simulate isn't silently disabled when
  // the user hasn't filled the FROM (IMPERSONATE) field. The sidebar copy
  // already says "Defaults to a neutral system address when blank" — this
  // honors that contract.
  senderAddress: NEUTRAL_SENDER,
  nonce: "0x0",
  calldata: "",
  signature: "",
  // L1/L1Data bounds are skipped via flags by default (see below) — keeping
  // them at 0 is fine when SKIP_FEE_CHARGE is on. If the user toggles real
  // fee-charging back on, they should run "Estimate fee" to populate these.
  l1MaxAmount: "0x0",
  l1MaxPrice: "0x0",
  l1DataMaxAmount: "0x0",
  l1DataMaxPrice: "0x0",
  l2MaxAmount: "0xffffffff",
  l2MaxPrice: "0xffffffffffff",
  tip: "0x0",
  // Default both skip-flags to true so a vanilla Simulate click against any
  // function works without first running estimate-fee. Users testing real
  // validate / fee paths can toggle them off in the sidebar.
  skipValidate: true,
  skipFeeCharge: true,
  debugEnabled: false,
};

export interface InvokeRequestResult {
  ok: boolean;
  request?: SimulateRequest;
  error?: string;
}

export interface InvokeCallContext {
  /** Deployed contract the user is invoking against. Required. */
  contractAddress: string;
  /** Either the function name (we hash → selector) or a 0x-prefixed
   *  felt that's already a selector. Required for normal-mode submits;
   *  Raw mode passes whatever the user typed. */
  entrypoint: string;
}

export function buildInvokeRequest(
  form: InvokeFormState,
  ctx: InvokeCallContext,
): InvokeRequestResult {
  const senderRaw = form.senderAddress.trim();
  const sender = senderRaw === "" ? NEUTRAL_SENDER : senderRaw;
  if (!FELT_HEX.test(sender)) {
    return { ok: false, error: "senderAddress must be 0x-prefixed hex (≤ 64 nibbles)." };
  }
  if (!HEX_OR_DEC.test(form.nonce.trim())) {
    return { ok: false, error: "nonce must be hex (0x…) or decimal." };
  }
  const innerCalldata = form.calldata
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const badCalldata = innerCalldata.filter((c) => !FELT_HEX.test(c));
  if (badCalldata.length > 0) {
    return {
      ok: false,
      error: `calldata felts must be 0x-prefixed hex. Bad: ${badCalldata.slice(0, 3).join(", ")}`,
    };
  }

  // Validate + resolve the call context. The contract address is the
  // user's ContractColumn input; the selector is either a name we hash
  // or a pre-hashed 0x felt the user typed in Raw mode.
  const contractAddress = ctx.contractAddress.trim();
  if (!FELT_HEX.test(contractAddress)) {
    return { ok: false, error: "Contract address must be a 0x-prefixed felt." };
  }
  const epRaw = ctx.entrypoint.trim();
  if (!epRaw) {
    return { ok: false, error: "Entry point name or selector is required." };
  }
  let selector: string;
  if (FELT_HEX.test(epRaw)) {
    selector = epRaw;
  } else {
    try {
      selector = starknetHash.getSelectorFromName(epRaw);
    } catch {
      return { ok: false, error: `Invalid entry-point name "${epRaw}".` };
    }
  }

  // Account-contract `__execute__` calldata = encoded `Array<Call>`. For a
  // single Call (Cairo 1 form): `[1, contract_address, selector,
  // calldata_len, …calldata]`. Without this prefix the bridge sees an
  // empty `__execute__` and the contract + selector are dropped on the
  // floor — which is what the playwriter test surfaced.
  const txCalldata: string[] = [
    "0x1",
    contractAddress,
    selector,
    starknetNum.toHex(innerCalldata.length),
    ...innerCalldata,
  ];

  const signature = form.signature
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (form.blockId === "number" && !/^\d+$/.test(form.blockNumber.trim())) {
    return { ok: false, error: "blockNumber must be a positive integer." };
  }

  const tx: InvokeV3 = {
    type: "INVOKE",
    version: "0x3",
    senderAddress: sender,
    calldata: txCalldata,
    signature,
    nonce: form.nonce.trim(),
    resourceBounds: {
      l1Gas: { maxAmount: form.l1MaxAmount, maxPricePerUnit: form.l1MaxPrice },
      l1DataGas: {
        maxAmount: form.l1DataMaxAmount,
        maxPricePerUnit: form.l1DataMaxPrice,
      },
      l2Gas: { maxAmount: form.l2MaxAmount, maxPricePerUnit: form.l2MaxPrice },
    },
    tip: form.tip,
    paymasterData: [],
    nonceDataAvailabilityMode: "L1",
    feeDataAvailabilityMode: "L1",
  };

  const flags: SimulationFlag[] = [];
  if (form.skipValidate) flags.push("SKIP_VALIDATE");
  if (form.skipFeeCharge) flags.push("SKIP_FEE_CHARGE");

  return {
    ok: true,
    request: {
      blockId:
        form.blockId === "latest"
          ? { tag: "latest" }
          : { blockNumber: parseInt(form.blockNumber, 10) },
      transactions: [tx],
      simulationFlags: flags,
    },
  };
}

/** Validates the form and returns the same snake_case body the client
 *  posts to the bridge — used by the Copy-as-cURL button so the
 *  reproduced request matches what the UI actually sends. */
export function buildInvokeWireRequest(
  form: InvokeFormState,
  ctx: InvokeCallContext,
): { ok: boolean; body?: unknown; error?: string } {
  const built = buildInvokeRequest(form, ctx);
  if (!built.ok || !built.request) return { ok: false, error: built.error };
  return { ok: true, body: transformRequestForBridge(built.request) };
}

/** Folds an /estimate-fee result into the existing form, replacing only
 *  the resource_bounds fields. Sender / nonce / calldata / signature /
 *  block-pin / flags all stay put, so the user can flip to Speculative
 *  with the same tx body and re-run with valid bounds. */
export interface RecommendedBoundsInputs {
  l1GasConsumed: string;
  l1DataGasConsumed: string;
  l2GasConsumed: string;
  l1GasPrice?: string | null;
  l1DataGasPrice?: string | null;
  l2GasPrice?: string | null;
}

export function applyEstimatedBounds(
  form: InvokeFormState,
  est: RecommendedBoundsInputs,
): InvokeFormState {
  return {
    ...form,
    l1MaxAmount: bumpHex(est.l1GasConsumed),
    l1MaxPrice: est.l1GasPrice ? bumpHex(est.l1GasPrice) : form.l1MaxPrice,
    l1DataMaxAmount: bumpHex(est.l1DataGasConsumed),
    l1DataMaxPrice: est.l1DataGasPrice
      ? bumpHex(est.l1DataGasPrice)
      : form.l1DataMaxPrice,
    l2MaxAmount: bumpHex(est.l2GasConsumed),
    l2MaxPrice: est.l2GasPrice ? bumpHex(est.l2GasPrice) : form.l2MaxPrice,
  };
}

/** 50% safety margin on top of the consumed/observed value, rounded up
 *  to a few hex digits so the form fields don't look like noise. Matches
 *  what wallets like ArgentX recommend for their `INVOKE` v3 bounds. */
function bumpHex(hex: string): string {
  try {
    const n = BigInt(hex);
    if (n === 0n) return "0x0";
    const bumped = (n * 3n) / 2n + 1n;
    return `0x${bumped.toString(16)}`;
  } catch {
    return hex;
  }
}
