import { getAddress, type Address, type Hex } from "viem";

// EIP-7930 chain-tagged address for EIP-155 chains:
// `version(2) | chainType(2) | chainRefLen(1) | chainRef(N) | addrLen(1) | addr(20)`.
// Example for Base: 0x0001|0000|02|2105|14|<addr>. https://eips.ethereum.org/EIPS/eip-7930
const VERSION = "0001";
const CHAIN_TYPE_EIP155 = "0000";
const ADDR_LEN_EVM = "14";

function toMinimalBigEndianHex(n: number): string {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`invalid chainId for EIP-7930: ${n}`);
  }
  let h = n.toString(16);
  if (h.length % 2) h = `0${h}`;
  return h;
}

export function encodeEip7930EvmAddress(
  chainId: number,
  address: Address,
): Hex {
  const chainRef = toMinimalBigEndianHex(chainId);
  const chainRefLen = (chainRef.length / 2).toString(16).padStart(2, "0");
  const addr = getAddress(address).slice(2).toLowerCase();
  return `0x${VERSION}${CHAIN_TYPE_EIP155}${chainRefLen}${chainRef}${ADDR_LEN_EVM}${addr}` as Hex;
}
