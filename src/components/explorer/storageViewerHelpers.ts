import type { ResolvedSlot, SlotEvidence, SlotHistoryRecord } from './storageViewerTypes';
import { ZERO_VALUE } from './storageViewerTypes';

/** Shorten hex for display */
export function shortHex(hex: string, head = 8, tail = 6): string {
  if (hex.length <= head + tail + 2) return hex;
  return `${hex.slice(0, head)}...${hex.slice(-tail)}`;
}

/** Clean variable labels for display -- keep mapping signatures, strip simple type suffixes */
export function cleanLabel(label: string): string {
  // Strip "[base slot]" suffix
  let cleaned = label.replace(/\s*\[base slot\]$/, '');
  // For mappings: "s.foo (mapping(address -> bool))" -> "s.foo(address -> bool)"
  const mappingMatch = cleaned.match(/^(.+?)\s*\(mapping\((.+)\)\)$/);
  if (mappingMatch) return `${mappingMatch[1]}(${mappingMatch[2]})`;
  // For simple types: "s.foo (uint256)" -> "s.foo"  /  "_name (bytes)" -> "_name"
  return cleaned.replace(/\s*\((?:uint\d*|int\d*|bool|address|bytes\d*|string|struct\s+\w+|enum\s+\w+|t_\w+)(?:\[\])?\)$/, '').trim();
}

/** Simplify type labels for the TYPE column -- full signatures already appear in VARIABLE */
export function simplifyType(typeLabel: string): string {
  if (!typeLabel) return 'unknown';
  // Count mapping nesting depth
  const mappingCount = (typeLabel.match(/mapping/gi) || []).length;
  if (mappingCount >= 3) return '3D mapping';
  if (mappingCount === 2) return '2D mapping';
  if (mappingCount === 1) return 'mapping';
  // Dynamic arrays: strip element type
  if (typeLabel.includes('[]')) return 'array';
  // Everything else (address, uint256, bool, bytes, struct Foo, etc.) -- keep as-is
  return typeLabel;
}

/** Middle-truncate a string: show head + "..." + tail. */
export function middleTruncate(str: string, maxChars: number): string {
  if (str.length <= maxChars) return str;
  if (str.startsWith('0x') && str.length > 10) {
    // Hex-aware: preserve "0x" prefix, split remaining budget between head and tail
    // Minimum: 0x + 4 head + ... + 4 tail = 13 chars
    const budget = Math.max(maxChars, 13);
    const available = budget - 5; // subtract "0x" (2) + "..." (3)
    const headHex = Math.max(4, Math.ceil(available / 2));
    const tailHex = Math.max(4, Math.floor(available / 2));
    return `${str.slice(0, 2 + headHex)}...${str.slice(-tailHex)}`;
  }
  const headLen = Math.ceil((maxChars - 1) / 2);
  const tailLen = Math.floor((maxChars - 1) / 2);
  return `${str.slice(0, headLen)}\u2026${str.slice(-tailLen)}`;
}

/** Get the best decoded summary for the table row */
export function getDecodedSummary(slot: ResolvedSlot): string | null {
  if (!slot.decodedFields || slot.decodedFields.length === 0) return null;

  if (slot.isPacked && slot.decodedFields.length > 1) {
    const first = slot.decodedFields[0];
    return `${first.decoded} (+${slot.decodedFields.length - 1})`;
  }

  const field = slot.decodedFields[0];
  if (field.typeLabel === 'zero') return '0';

  // When slot has an explicit typeLabel and multiple candidates,
  // prefer the candidate whose typeLabel matches the slot's typeLabel.
  if (slot.typeLabel && slot.decodedFields.length > 1) {
    const match = slot.decodedFields.find((f) => f.typeLabel === slot.typeLabel);
    if (match) return match.decoded;
  }

  // Heuristic preference for unknown slots with multiple candidates
  if (slot.decodeKind === 'unknown' && slot.decodedFields.length > 1) {
    const addr = slot.decodedFields.find((f) => f.typeLabel === 'address');
    if (addr) return addr.decoded;
    const ether = slot.decodedFields.find((f) => f.typeLabel === 'ether');
    if (ether) return ether.decoded;
    const bool = slot.decodedFields.find((f) => f.typeLabel === 'bool');
    if (bool) return bool.decoded;
    return field.decoded;
  }

  return field.decoded;
}

export function readMetaNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = value.startsWith('0x') ? parseInt(value, 16) : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function buildSlotHistoryRecords(slot: string, evidence: SlotEvidence[]): SlotHistoryRecord[] {
  const slotLower = slot.toLowerCase();
  const matching = evidence.filter((item) => item.slot.toLowerCase() === slotLower);
  const rows: SlotHistoryRecord[] = [];

  for (const item of matching) {
    if (!item.before && !item.after && !item.value) continue;

    const txHash = typeof item.meta?.txHash === 'string' ? item.meta.txHash : '--';
    const blockNumber = readMetaNumber(item.meta?.blockNumber);
    const txPosition = readMetaNumber(item.meta?.txPosition ?? item.meta?.transactionIndex);
    const value = item.after || item.value || item.before || ZERO_VALUE;

    rows.push({
      txHash,
      blockNumber,
      txPosition,
      value,
    });
  }

  if (rows.length === 0) {
    const current = matching.find((item) => item.value);
    if (current?.value) {
      rows.push({
        txHash: '--',
        blockNumber: 0,
        txPosition: 0,
        value: current.value,
      });
    }
  }

  return rows.sort((a, b) => (b.blockNumber - a.blockNumber) || (b.txPosition - a.txPosition));
}

export function decodeSlotWord(value: string | null, typeLabel?: string): string | null {
  if (!value) return null;
  try {
    if (typeLabel === 'address' || typeLabel?.startsWith('contract ')) {
      const hex = value.startsWith('0x') ? value.slice(2) : value;
      return '0x' + hex.slice(-40).padStart(40, '0');
    }
    if (typeLabel === 'bool') {
      return BigInt(value) === 0n ? 'false' : 'true';
    }
    if (typeLabel?.startsWith('bytes') && typeLabel !== 'bytes') {
      return value.startsWith('0x') ? value : '0x' + value;
    }
    return BigInt(value).toString();
  } catch {
    return value;
  }
}
