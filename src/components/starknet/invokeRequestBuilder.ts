// Shared INVOKE v3 request builder. Used by SyntheticSimView (full
// /simulate flow with rich result rendering) and EstimateFeeView (just
// /estimate-fee, returns the small fee envelope). Validates felt
// formats and parses calldata / signature into typed felt arrays.

import type {
  InvokeV3,
  SimulateRequest,
  SimulationFlag,
} from "@/chains/starknet/simulatorTypes";
import { transformRequestForBridge } from "@/chains/starknet/simulatorClient";

const FELT_HEX = /^0x[0-9a-fA-F]{1,64}$/;
const HEX_OR_DEC = /^(0x[0-9a-fA-F]+|\d+)$/;

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
}

export const DEFAULT_INVOKE_FORM: InvokeFormState = {
  blockId: "latest",
  blockNumber: "",
  senderAddress: "",
  nonce: "0x0",
  calldata: "",
  signature: "",
  l1MaxAmount: "0x0",
  l1MaxPrice: "0x0",
  l1DataMaxAmount: "0x0",
  l1DataMaxPrice: "0x0",
  l2MaxAmount: "0xffffffff",
  l2MaxPrice: "0xffffffffffff",
  tip: "0x0",
  skipValidate: false,
  skipFeeCharge: false,
};

export interface InvokeRequestResult {
  ok: boolean;
  request?: SimulateRequest;
  error?: string;
}

export function buildInvokeRequest(form: InvokeFormState): InvokeRequestResult {
  if (!FELT_HEX.test(form.senderAddress.trim())) {
    return { ok: false, error: "senderAddress must be 0x-prefixed hex (≤ 64 nibbles)." };
  }
  if (!HEX_OR_DEC.test(form.nonce.trim())) {
    return { ok: false, error: "nonce must be hex (0x…) or decimal." };
  }
  const calldata = form.calldata
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const badCalldata = calldata.filter((c) => !FELT_HEX.test(c));
  if (badCalldata.length > 0) {
    return {
      ok: false,
      error: `calldata felts must be 0x-prefixed hex. Bad: ${badCalldata.slice(0, 3).join(", ")}`,
    };
  }
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
    senderAddress: form.senderAddress.trim(),
    calldata,
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
): { ok: boolean; body?: unknown; error?: string } {
  const built = buildInvokeRequest(form);
  if (!built.ok || !built.request) return { ok: false, error: built.error };
  return { ok: true, body: transformRequestForBridge(built.request) };
}
