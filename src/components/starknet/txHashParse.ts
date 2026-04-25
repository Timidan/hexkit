// Accepts a raw `0x…` hash or any block-explorer URL that contains one
// (Voyager, Starkscan, Viewblock, etc) and returns the canonical
// 0x-prefixed hex. The trace input, the ?txHash= URL param, and the
// auto-trace path all run through the same parser so a pasted Voyager
// link behaves the same as a typed hash.

const FELT_HEX = /^0x[0-9a-fA-F]{1,64}$/;
const ANY_HASH = /(0x[0-9a-fA-F]{1,64})/;

export function extractTxHash(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (FELT_HEX.test(trimmed)) return trimmed;
  // Anything else: pull the first 0x… run out of it. Covers
  // /tx/<hash>, /transaction/<hash>, ?hash=<…>, query strings with
  // #fragments, trailing slashes — we don't care about the host.
  const match = trimmed.match(ANY_HASH);
  if (!match) return null;
  return FELT_HEX.test(match[1]) ? match[1] : null;
}

export function isValidTxHash(raw: string | null | undefined): boolean {
  return extractTxHash(raw) !== null;
}
