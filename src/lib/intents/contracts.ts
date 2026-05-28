import { decodeEventLog, type Address, type Hex } from "viem";

// The deployed input settler is the LI.FI variant `InputSettlerEscrowLIFI`
// (verified via Sourcify, May 2026). Functions take the StandardOrder tuple
// directly, not pre-encoded bytes.
export const INPUT_SETTLER_ESCROW =
  "0x000025c3226C00B2Cdc200005a1600509f4e00C0" as Address;

export const INPUT_SETTLER_COMPACT =
  "0x0000000000cd5f7fDEc90a03a31F79E5Fbc6A9Cf" as Address;

export const OUTPUT_SETTLER_SIMPLE =
  "0x0000000000eC36B683C2E6AC89e9A75989C22a2e" as Address;

export const POLYMER_ORACLE =
  "0x0000003E06000007A224AeE90052fA6bb46d43C9" as Address;

// Canonical deterministic Permit2 deployment.
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

const MANDATE_OUTPUT_COMPONENTS = [
  { name: "oracle", type: "bytes32" },
  { name: "settler", type: "bytes32" },
  { name: "chainId", type: "uint256" },
  { name: "token", type: "bytes32" },
  { name: "amount", type: "uint256" },
  { name: "recipient", type: "bytes32" },
  { name: "callbackData", type: "bytes" },
  { name: "context", type: "bytes" },
] as const;

const STANDARD_ORDER_COMPONENTS = [
  { name: "user", type: "address" },
  { name: "nonce", type: "uint256" },
  { name: "originChainId", type: "uint256" },
  { name: "expires", type: "uint32" },
  { name: "fillDeadline", type: "uint32" },
  { name: "inputOracle", type: "address" },
  { name: "inputs", type: "uint256[2][]" },
  {
    name: "outputs",
    type: "tuple[]",
    components: MANDATE_OUTPUT_COMPONENTS,
  },
] as const;

const STANDARD_ORDER_ARG = {
  name: "order",
  type: "tuple",
  components: STANDARD_ORDER_COMPONENTS,
} as const;

// Selectors and Open topic confirmed present in the deployed Base bytecode
// (May 2026): open=0x7515fd56, openFor=0x49927074, refund=0x48f49eaf,
// Open(bytes32,StandardOrder)=0x9ff74bd56d00785b881ef9fa3f03d7b598686a39a9bcff89a6008db588b18a7b.
export const inputSettlerEscrowAbi = [
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [STANDARD_ORDER_ARG],
    outputs: [],
  },
  {
    type: "function",
    name: "openFor",
    stateMutability: "nonpayable",
    inputs: [
      STANDARD_ORDER_ARG,
      { name: "sponsor", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [STANDARD_ORDER_ARG],
    outputs: [],
  },
  {
    type: "event",
    name: "Open",
    anonymous: false,
    inputs: [
      { indexed: true, name: "orderId", type: "bytes32" },
      { indexed: false, name: "order", type: "tuple", components: STANDARD_ORDER_COMPONENTS },
    ],
  },
  {
    type: "event",
    name: "Open",
    anonymous: false,
    inputs: [{ indexed: true, name: "orderId", type: "bytes32" }],
  },
  {
    type: "event",
    name: "Refunded",
    anonymous: false,
    inputs: [{ indexed: true, name: "orderId", type: "bytes32" }],
  },
] as const;

// Iterate logs by signature rather than index — the first log is usually the
// ERC-20 Transfer from approve()/transferFrom, not the escrow's Open event.
export function extractOpenOrderId(
  logs: { address: string; topics: readonly Hex[]; data: Hex }[] | undefined,
): Hex | null {
  if (!logs) return null;
  for (const log of logs) {
    if (log.address.toLowerCase() !== INPUT_SETTLER_ESCROW.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: inputSettlerEscrowAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === "Open") {
        const args = decoded.args as unknown as { orderId?: Hex };
        if (args.orderId) return args.orderId;
      }
    } catch {
      // Topic didn't match any event in our ABI — keep scanning.
    }
  }
  return null;
}
