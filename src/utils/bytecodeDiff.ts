import { ethers } from 'ethers';

export type NormalizeMode = 'raw' | 'strip-solc-metadata';

export interface PreparedBytecode {
  /** Hex without 0x prefix, lowercase */
  effectiveHex: string;
  /** Number of bytes in effectiveHex */
  byteLength: number;
  /** Bytes stripped from metadata trailer (0 when raw) */
  strippedMetadataBytes: number;
  /** keccak256 of the effective bytecode */
  hash: string;
}

/** Character-level diff result for a single hex char */
export interface DiffChar {
  char: string;
  /** true when this position differs between the two sides */
  diff: boolean;
  /** true when this char only exists on this side (length mismatch) */
  extra: boolean;
}

const cleanHex = (code: string): string =>
  (code.startsWith('0x') ? code.slice(2) : code).toLowerCase();

/**
 * Detect and strip the Solc CBOR metadata trailer.
 * The last 2 bytes encode the metadata length; the block starts with a CBOR map tag (0xa0..0xbf).
 */
export function stripSolcMetadata(hexNoPrefix: string): { hex: string; stripped: number } {
  if (hexNoPrefix.length < 6 || hexNoPrefix.length % 2 !== 0) {
    return { hex: hexNoPrefix, stripped: 0 };
  }

  const metadataLen = Number.parseInt(hexNoPrefix.slice(-4), 16);
  if (!Number.isFinite(metadataLen) || metadataLen === 0) {
    return { hex: hexNoPrefix, stripped: 0 };
  }

  const trailerBytes = metadataLen + 2; // metadata body + 2-byte length field
  const trailerChars = trailerBytes * 2;
  if (trailerChars >= hexNoPrefix.length) {
    return { hex: hexNoPrefix, stripped: 0 };
  }

  const start = hexNoPrefix.length - trailerChars;
  const firstByte = Number.parseInt(hexNoPrefix.slice(start, start + 2), 16);
  // CBOR map initial byte range: 0xa0 .. 0xbf
  const looksLikeCborMap = firstByte >= 0xa0 && firstByte <= 0xbf;
  if (!looksLikeCborMap) {
    return { hex: hexNoPrefix, stripped: 0 };
  }

  return { hex: hexNoPrefix.slice(0, start), stripped: trailerBytes };
}

/**
 * Compare two hex strings character-by-character.
 * Returns a DiffChar[] for each side.
 */
export function diffHexChars(
  hexA: string,
  hexB: string,
): { left: DiffChar[]; right: DiffChar[]; diffCount: number } {
  const maxLen = Math.max(hexA.length, hexB.length);
  const left: DiffChar[] = [];
  const right: DiffChar[] = [];
  let diffCount = 0;

  for (let i = 0; i < maxLen; i++) {
    const a = hexA[i];
    const b = hexB[i];

    if (a !== undefined && b !== undefined) {
      const isDiff = a !== b;
      if (isDiff) diffCount++;
      left.push({ char: a, diff: isDiff, extra: false });
      right.push({ char: b, diff: isDiff, extra: false });
    } else if (a !== undefined) {
      left.push({ char: a, diff: false, extra: true });
    } else if (b !== undefined) {
      right.push({ char: b, diff: false, extra: true });
    }
  }

  return { left, right, diffCount };
}

/**
 * Full pipeline: clean → optionally strip metadata → hash.
 */
export function prepareBytecode(
  rawCode: string,
  mode: NormalizeMode = 'raw',
): PreparedBytecode {
  let hex = cleanHex(rawCode);
  let strippedMetadataBytes = 0;

  if (mode === 'strip-solc-metadata') {
    const result = stripSolcMetadata(hex);
    hex = result.hex;
    strippedMetadataBytes = result.stripped;
  }

  const byteLength = hex.length / 2;
  const hash = ethers.utils.keccak256('0x' + hex);

  return {
    effectiveHex: hex,
    byteLength,
    strippedMetadataBytes,
    hash,
  };
}
