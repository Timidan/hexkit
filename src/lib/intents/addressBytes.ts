import { getAddress, type Address, type Hex } from "viem";

// MandateOutput bytes32 fields are left-padded EVM addresses (not EIP-7930).
export function addressToBytes32(address: Address): Hex {
  return `0x${"00".repeat(12)}${getAddress(address).slice(2).toLowerCase()}` as Hex;
}

// StandardOrder.inputs[i][0] is the ERC-20 token address cast to uint256,
// upper 12 bytes zero.
export function tokenIdentifierForEscrow(address: Address): bigint {
  return BigInt(getAddress(address));
}
