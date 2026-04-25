import { type Address, type Hex } from 'viem';
import type { MultiSendSubCall } from './types';

// MultiSend (and MultiSendCallOnly) take a single bytes argument: a packed
// sequence of `(uint8 operation, address to, uint256 value, uint256 dataLen, bytes data)`.
// The top-level function selector is `0x8d80ff0a`.
const MULTISEND_SELECTOR = '0x8d80ff0a';

// Practical cap: no real Safe MultiSend payload is anywhere near this; we clamp
// so a hostile declared length can't blow up String.prototype.slice or force an
// accidental Infinity.
const MAX_BLOB_BYTES = 1_000_000; // 1 MB of raw calldata

function readBytes(src: string, offset: number, len: number): string {
  return src.slice(offset, offset + len);
}

function hexToBigInt(hex: string): bigint {
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}

/**
 * Extract the packed bytes argument from an `execTransaction` `data` field
 * targeting a MultiSend. Returns the raw concatenated blob without the
 * function selector or ABI header.
 *
 * Throws when the payload advertises a length that doesn't fit — we prefer
 * failing closed over silently truncating malformed input.
 */
export function extractMultiSendBlob(execData: Hex): Hex | null {
  if (!execData.toLowerCase().startsWith(MULTISEND_SELECTOR)) return null;
  // ABI: [offset (32), length (32), data ...]
  const body = execData.slice(10);
  if (body.length < 128) {
    throw new Error('multiSend: calldata shorter than ABI header');
  }
  const offsetHex = body.slice(0, 64);
  const lengthHex = body.slice(64, 128);
  const offset = Number(hexToBigInt(offsetHex));
  const length = Number(hexToBigInt(lengthHex));
  // Canonical ABI offset for a single bytes arg is 0x20 (32 bytes).
  if (offset !== 32) {
    throw new Error(`multiSend: unexpected ABI offset 0x${offsetHex} (want 0x20)`);
  }
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_BLOB_BYTES) {
    throw new Error(`multiSend: refusing to decode declared length ${length}`);
  }
  const availableBytes = (body.length - 128) / 2;
  if (length > availableBytes) {
    throw new Error(
      `multiSend: declared length ${length} exceeds available ${availableBytes} bytes`,
    );
  }
  const dataHex = body.slice(128, 128 + length * 2);
  return (`0x${dataHex}`) as Hex;
}

/**
 * Walk the packed blob. Throws if a sub-call advertises a `dataLen` that
 * exceeds the remaining bytes — prefer fail-closed over silent truncation.
 */
export function decodeMultiSendBlob(blob: Hex): MultiSendSubCall[] {
  const out: MultiSendSubCall[] = [];
  const hex = blob.startsWith('0x') ? blob.slice(2) : blob;
  let i = 0;
  while (i < hex.length) {
    const headerBytes = 1 + 20 + 32 + 32; // op + to + value + dataLen
    if (hex.length - i < headerBytes * 2) {
      throw new Error(
        `multiSend: dangling ${(hex.length - i) / 2} trailing bytes inside blob`,
      );
    }
    const op = parseInt(readBytes(hex, i, 2), 16) as 0 | 1;
    if (op !== 0 && op !== 1) {
      throw new Error(`multiSend: invalid operation byte 0x${readBytes(hex, i, 2)}`);
    }
    i += 2;
    const to = (`0x${readBytes(hex, i, 40)}`) as Address;
    i += 40;
    const value = hexToBigInt(readBytes(hex, i, 64));
    i += 64;
    const dataLenBig = hexToBigInt(readBytes(hex, i, 64));
    if (dataLenBig > BigInt(MAX_BLOB_BYTES)) {
      throw new Error(`multiSend: sub-call dataLen ${dataLenBig} exceeds cap`);
    }
    const dataLen = Number(dataLenBig);
    i += 64;
    const remainingBytes = (hex.length - i) / 2;
    if (dataLen > remainingBytes) {
      throw new Error(
        `multiSend: sub-call declares ${dataLen} bytes but only ${remainingBytes} remain`,
      );
    }
    const data = (`0x${readBytes(hex, i, dataLen * 2)}`) as Hex;
    i += dataLen * 2;
    out.push({ operation: op, to, value, data });
  }
  return out;
}

export function decodeMultiSendFromExecData(
  execData: Hex,
): MultiSendSubCall[] | null {
  const blob = extractMultiSendBlob(execData);
  if (!blob) return null;
  return decodeMultiSendBlob(blob);
}
