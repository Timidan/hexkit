import type { Address, Hex } from "viem";
import { addressToBytes32, tokenIdentifierForEscrow } from "./addressBytes";
import { OUTPUT_SETTLER_SIMPLE, POLYMER_ORACLE } from "./contracts";

export interface MandateOutput {
  oracle: Hex;
  settler: Hex;
  chainId: bigint;
  token: Hex;
  amount: bigint;
  recipient: Hex;
  callbackData: Hex;
  context: Hex;
}

export interface StandardOrder {
  user: Address;
  nonce: bigint;
  originChainId: bigint;
  expires: number;
  fillDeadline: number;
  inputOracle: Address;
  inputs: readonly (readonly [bigint, bigint])[];
  outputs: MandateOutput[];
}

interface BuildOrderInput {
  user: Address;
  nonce: bigint;
  originChainId: number;
  inputToken: Address;
  inputAmount: bigint;
  targetChainId: number;
  outputToken: Address;
  outputAmount: bigint;
  recipient: Address;
  expires: number;
  fillDeadline: number;
  context?: Hex;
  callbackData?: Hex;
}

// Shape required by viem's encodeFunctionData for the escrow's open/openFor
// /refund arguments — keeps the inputs as readonly tuples and re-spreads the
// outputs so the ABI encoder sees plain bigints/hex.
export function orderForAbi(order: StandardOrder) {
  return {
    user: order.user,
    nonce: order.nonce,
    originChainId: order.originChainId,
    expires: order.expires,
    fillDeadline: order.fillDeadline,
    inputOracle: order.inputOracle,
    inputs: order.inputs.map(([a, b]) => [a, b] as readonly [bigint, bigint]),
    outputs: order.outputs.map((o) => ({
      oracle: o.oracle,
      settler: o.settler,
      chainId: o.chainId,
      token: o.token,
      amount: o.amount,
      recipient: o.recipient,
      callbackData: o.callbackData,
      context: o.context,
    })),
  };
}

// Same-chain orders can let the OutputSettler act as its own oracle; cross-chain
// orders need an attestation bridge (Polymer here, per docs.li.fi/lifi-intents).
export function buildStandardOrder(args: BuildOrderInput): StandardOrder {
  const crossChain = args.originChainId !== args.targetChainId;
  const oracleAddr = crossChain ? POLYMER_ORACLE : OUTPUT_SETTLER_SIMPLE;

  return {
    user: args.user,
    nonce: args.nonce,
    originChainId: BigInt(args.originChainId),
    expires: args.expires,
    fillDeadline: args.fillDeadline,
    inputOracle: oracleAddr,
    inputs: [[tokenIdentifierForEscrow(args.inputToken), args.inputAmount]],
    outputs: [
      {
        oracle: addressToBytes32(oracleAddr),
        settler: addressToBytes32(OUTPUT_SETTLER_SIMPLE),
        chainId: BigInt(args.targetChainId),
        token: addressToBytes32(args.outputToken),
        amount: args.outputAmount,
        recipient: addressToBytes32(args.recipient),
        callbackData: args.callbackData ?? "0x",
        context: args.context ?? "0x",
      },
    ],
  };
}
