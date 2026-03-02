/**
 * Value formatting utilities for trace decoding
 */

export function formatAbiVal(
  type: string,
  raw: any,
  options?: { withHex?: boolean }
): string {
  const withHex = options?.withHex ?? false; // Default to clean decoded display
  if (raw === null || raw === undefined) return "";
  const hex =
    raw &&
    (raw as any)._isBigNumber &&
    typeof (raw as any).toHexString === "function"
      ? (raw as any).toHexString()
      : String(raw);
  let bn: bigint | null = null;
  try {
    bn = BigInt(hex);
  } catch {
    bn = null;
  }
  const lower = type.toLowerCase();
  if (lower.startsWith("address")) {
    const clean = hex.replace(/^0x/, "").padStart(40, "0");
    return "0x" + clean.slice(-40);
  }
  if (lower === "bool") {
    return bn ? (bn === 0n ? "false" : "true") : hex;
  }
  if (lower.startsWith("uint") || lower.startsWith("int")) {
    if (bn !== null) {
      // For uint/int types, always show as decimal (with hex for very large numbers)
      // Don't try to guess if it's an address - that causes false positives with token amounts
      const dec = bn.toString();
      return withHex && bn >= 1_000_000_000_000n
        ? `${dec} (0x${bn.toString(16)})`
        : dec;
    }
    return hex;
  }
  if (lower.startsWith("bytes32")) {
    return "0x" + hex.replace(/^0x/, "").padStart(64, "0").slice(-64);
  }
  return hex;
}

// Format display value without type info - for event args, returns, etc.
// Shows only the decoded value (decimal for numbers, no hex suffix)
export function formatDisplayVal(v: any): string {
  if (v === null || v === undefined) return "";

  const formatBigInt = (bn: bigint): string => {
    // Show only decimal - clean decoded display
    return bn.toString();
  };

  // Handle BigNumber from ethers.js
  if (typeof v === "object" && v._isBigNumber) {
    const bn = BigInt(v.toString());
    return formatBigInt(bn);
  }
  // Handle native bigint
  if (typeof v === "bigint") {
    return formatBigInt(v);
  }
  // Handle hex strings
  if (typeof v === "string" && v.startsWith("0x")) {
    // If it's 42 characters, it's an address - keep as hex
    if (v.length === 42) {
      return v;
    }
    // If it's 66 characters, it's a bytes32 - keep as hex
    if (v.length === 66) {
      return v;
    }
    // Otherwise try to convert and format as number
    try {
      const bn = BigInt(v);
      return formatBigInt(bn);
    } catch {
      return v;
    }
  }
  // Handle arrays
  if (Array.isArray(v)) return `[${v.map(formatDisplayVal).join(", ")}]`;
  return String(v);
}

export function memReadWord(memory: any, offset: any): string | null {
  const memArr = Array.isArray(memory) ? memory : [];
  const off = Number(offset || 0);
  if (Number.isNaN(off) || off < 0) return null;
  if (off + 32 > memArr.length) return null;
  const slice = memArr.slice(off, off + 32);
  return (
    "0x" +
    slice
      .map((b: any) => {
        const n = Number(b) & 0xff;
        return n.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

export function memReadBytes(memory: any, offset: any, length: any) {
  const memArr = Array.isArray(memory) ? memory : [];
  const off = Number(offset || 0);
  const len = Number(length || 0);
  if (
    Number.isNaN(off) ||
    Number.isNaN(len) ||
    off < 0 ||
    len < 0 ||
    off > memArr.length
  )
    return { hex: null, truncated: true };
  const end = Math.min(memArr.length, off + len);
  const truncated = end - off < len;
  const slice = memArr.slice(off, end);
  const hex =
    "0x" +
    slice
      .map((b: any) => {
        const n = Number(b) & 0xff;
        return n.toString(16).padStart(2, "0");
      })
      .join("");
  return { hex, truncated };
}
