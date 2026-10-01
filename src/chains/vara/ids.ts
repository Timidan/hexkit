import { blake2b } from "@noble/hashes/blake2b";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { Hex } from "./model";

function messageBytes(id: Hex): Uint8Array {
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) throw new Error("Message id must be 32-byte hex");
  return hexToBytes(id.slice(2));
}

export function replyId(id: Hex): Hex {
  return `0x${bytesToHex(blake2b(concatBytes(utf8ToBytes("reply"), messageBytes(id)), { dkLen: 32 }))}`;
}

export function outgoingId(id: Hex, nonce: number): Hex {
  if (!Number.isInteger(nonce) || nonce < 0 || nonce > 0xffffffff) throw new Error("Nonce must be a u32");
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, nonce, true);
  return `0x${bytesToHex(blake2b(concatBytes(utf8ToBytes("outgoing"), messageBytes(id), bytes), { dkLen: 32 }))}`;
}
