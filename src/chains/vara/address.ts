import { base58 } from "@scure/base";
import { blake2b } from "@noble/hashes/blake2b";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils";

export const VARA_SS58_PREFIX = 137;

function checksum(body: Uint8Array): Uint8Array {
  return blake2b(concatBytes(utf8ToBytes("SS58PRE"), body), { dkLen: 64 }).slice(0, 2);
}

export function decodeSs58(input: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = base58.decode(input);
  } catch {
    throw new Error("Invalid SS58 address");
  }
  const prefixLength = bytes[0] & 0x40 ? 2 : 1;
  const body = bytes.slice(0, -2);
  const publicKey = body.slice(prefixLength);
  if (publicKey.length !== 32) throw new Error("Expected a 32-byte address");
  if (bytes[0] & 0x80 || bytes[0] === 46 || bytes[0] === 47) throw new Error("Invalid SS58 prefix");
  const expected = checksum(body);
  if (expected[0] !== bytes[bytes.length - 2] || expected[1] !== bytes[bytes.length - 1]) {
    throw new Error("Invalid SS58 checksum");
  }
  return publicKey;
}

export function encodeSs58(publicKey: Uint8Array, prefix: number): string {
  if (publicKey.length !== 32) throw new Error("Expected a 32-byte public key");
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 16383 || prefix === 46 || prefix === 47) {
    throw new Error("Invalid SS58 prefix");
  }
  const prefixBytes = prefix < 64
    ? [prefix]
    : [((prefix & 0xfc) >> 2) | 0x40, (prefix >> 8) | ((prefix & 3) << 6)];
  const body = concatBytes(new Uint8Array(prefixBytes), publicKey);
  return base58.encode(concatBytes(body, checksum(body)));
}
