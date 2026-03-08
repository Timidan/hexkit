/**
 * Stack decoding utilities for trace decoding.
 * Includes argument decoding from EVM stack and call frame extraction.
 */

import { ethers } from "ethers";
import { formatAbiVal, formatDisplayVal, memReadWord, memReadBytes } from "./formatting";
import {
  getERC20FunctionsInterface,
  getERC721FunctionsInterface,
  getERC20EventsInterface,
  getERC721EventsInterface,
  getOtherEventsInterface,
  getCommonEventInterfaces,
} from "./commonAbis";

const MAX_ARRAY_DECODE_BYTES = 32 * 1024;
const MAX_ARRAY_PREVIEW_ELEMENTS = 16;
const MAX_INLINE_ARG_CHARS = 220;
const TYPE_QUALIFIER_REGEX = /\b(memory|calldata|storage|payable)\b/gi;

export const truncateMiddle = (value: string, maxChars = MAX_INLINE_ARG_CHARS): string => {
  if (!value || value.length <= maxChars) return value;
  const keep = Math.max(8, Math.floor((maxChars - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
};

const normalizeSolidityType = (type: string): string =>
  String(type || "")
    .replace(TYPE_QUALIFIER_REGEX, " ")
    .replace(/\s*\[\s*/g, "[")
    .replace(/\s*\]\s*/g, "]")
    .replace(/\s+/g, " ")
    .trim();

const isArrayType = (type: string): boolean =>
  /\[[0-9]*\]$/.test(normalizeSolidityType(type));

const parseSingleDimensionArray = (
  type: string
): { baseType: string; length: number | null } | null => {
  const normalizedType = normalizeSolidityType(type);
  const match = normalizedType.match(/^(.+)\[(\d*)\]$/);
  if (!match) return null;
  const baseType = match[1].trim();
  if (!baseType || baseType.includes("[") || baseType.includes("(")) return null;
  const length = match[2] === "" ? null : Number.parseInt(match[2], 10);
  if (length !== null && !Number.isFinite(length)) return null;
  return { baseType, length };
};

const formatArrayElementWord = (baseType: string, wordHex: string): string => {
  const lower = baseType.toLowerCase();
  if (lower === "bool") {
    try {
      return BigInt(wordHex) === 0n ? "false" : "true";
    } catch {
      return "false";
    }
  }
  if (lower.startsWith("address")) {
    const clean = wordHex.replace(/^0x/, "").padStart(64, "0");
    return `0x${clean.slice(-40)}`;
  }
  if (lower.startsWith("uint") || lower.startsWith("int")) {
    try {
      return BigInt(wordHex).toString();
    } catch {
      return "0";
    }
  }
  if (lower.startsWith("bytes") && lower !== "bytes") {
    const bytesLen = Number.parseInt(lower.slice(5), 10);
    if (Number.isFinite(bytesLen) && bytesLen > 0 && bytesLen <= 32) {
      const clean = wordHex.replace(/^0x/, "");
      return `0x${clean.slice(0, bytesLen * 2)}`;
    }
  }
  return wordHex;
};

const decodeArrayFromMemory = (
  coder: ethers.utils.AbiCoder,
  arrayType: string,
  ptr: number,
  memory: any
): string | null => {
  const parsed = parseSingleDimensionArray(arrayType);
  if (!parsed) return null;
  const { baseType, length } = parsed;

  const elementCount = (() => {
    if (length !== null) return length;
    const lenWordHex = memReadWord(memory, ptr);
    if (!lenWordHex) return null;
    try {
      const len = Number(BigInt(lenWordHex));
      return Number.isFinite(len) && len >= 0 ? len : null;
    } catch {
      return null;
    }
  })();
  if (elementCount === null) return null;

  const totalBytes = (length === null ? 32 : 0) + elementCount * 32;
  const readOffset = ptr;

  if (totalBytes > MAX_ARRAY_DECODE_BYTES) {
    const dataOffset = length === null ? ptr + 32 : ptr;
    const previewCount = Math.min(elementCount, MAX_ARRAY_PREVIEW_ELEMENTS);
    const preview: string[] = [];
    for (let i = 0; i < previewCount; i++) {
      const word = memReadWord(memory, dataOffset + i * 32);
      if (!word) break;
      preview.push(formatArrayElementWord(baseType, word));
    }
    const suffix = elementCount > previewCount ? ", …" : "";
    return truncateMiddle(`[${preview.join(", ")}${suffix}]`);
  }

  const { hex, truncated } = memReadBytes(memory, readOffset, totalBytes);
  if (!hex) return null;
  try {
    const decoded = coder.decode([arrayType], hex)[0];
    const value = Array.isArray(decoded)
      ? `[${decoded.map((entry: any) => formatDisplayVal(entry)).join(", ")}]`
      : String(decoded);
    return truncateMiddle(value + (truncated ? " [truncated]" : ""));
  } catch {
    const dataOffset = length === null ? ptr + 32 : ptr;
    const previewCount = Math.min(elementCount, MAX_ARRAY_PREVIEW_ELEMENTS);
    const preview: string[] = [];
    for (let i = 0; i < previewCount; i++) {
      const word = memReadWord(memory, dataOffset + i * 32);
      if (!word) break;
      preview.push(formatArrayElementWord(baseType, word));
    }
    const suffix = elementCount > previewCount ? ", …" : "";
    return truncateMiddle(`[${preview.join(", ")}${suffix}]`);
  }
};

/**
 * Extract call frames from the raw trace.
 * EDB trace can have call frames in either:
 * - raw.inner.inner (double-nested, older format)
 * - raw.inner directly (single-nested, newer/lightweight format)
 */
export function getCallFrames(raw: any): any[] {
  // First check for double-nested structure: raw.inner.inner
  if (raw?.inner?.inner && Array.isArray(raw.inner.inner)) {
    return raw.inner.inner;
  }
  // Otherwise check if raw.inner is directly an array or array-like object
  if (raw?.inner) {
    const inner = raw.inner;
    // Handle object with numeric keys (like {0: ..., 1: ..., 2: ...})
    if (typeof inner === 'object' && !Array.isArray(inner)) {
      const keys = Object.keys(inner);
      // Check if keys are numeric (call frame indices)
      if (keys.length > 0 && keys.every(k => !isNaN(parseInt(k, 10)))) {
        return Object.values(inner);
      }
    }
    if (Array.isArray(inner)) {
      return inner;
    }
  }
  return [];
}

/**
 * Decode function arguments from the EVM stack.
 * Uses ABI, source signatures, and per-file signature maps to resolve parameter names and types.
 */
export function decodeArgsFromStack(
  iface: ethers.utils.Interface | null,
  fnName: string | null,
  fnSignatures: Record<string, any>,
  fnSignaturesPerFile: Map<string, Record<string, any>> | null,
  stackVals: any,
  excludeCount: number,
  memory: any,
  sourceFile?: string | null
): {
  args: { name: string; value: string }[];
  origin: string;
  truncated: boolean;
} | null {
  const st = Array.isArray(stackVals) ? stackVals : [];
  if (st.length <= excludeCount) return null;
  let inputs: any[] | null = null;
  let origin = "fallback";

  // Calculate expected argument count from stack
  const expectedArgCount = st.length - excludeCount;

  // Helper to find signature in per-file map with flexible matching
  const findInPerFile = (file: string): any[] | null => {
    if (!fnSignaturesPerFile || !fnName) return null;

    // Try exact match first
    let fileSignatures = fnSignaturesPerFile.get(file);
    if (fileSignatures?.[fnName]?.inputs) {
      return fileSignatures[fnName].inputs;
    }

    // Try just the filename (strip path)
    const fileName = file.split('/').pop() || file;
    fileSignatures = fnSignaturesPerFile.get(fileName);
    if (fileSignatures?.[fnName]?.inputs) {
      return fileSignatures[fnName].inputs;
    }

    // Try to find a key that ends with the filename
    for (const [key, sigs] of fnSignaturesPerFile.entries()) {
      if ((key === fileName || key.endsWith('/' + fileName)) && sigs[fnName]?.inputs) {
        return sigs[fnName].inputs;
      }
    }

    return null;
  };

  // PRIORITY 1: Source file from source map is AUTHORITATIVE
  if (fnName && sourceFile && fnSignaturesPerFile) {
    const found = findInPerFile(sourceFile);
    if (found) {
      inputs = found;
      origin = `source:${sourceFile}`;
    }
  }

  // PRIORITY 2: Try ABI (for public/external functions)
  if (!inputs && fnName && iface) {
    try {
      const fn = iface.getFunction(fnName);
      if (fn?.inputs) {
        inputs = fn.inputs;
        origin = "abi";
      }
    } catch {}
  }

  // PRIORITY 3: Search all files - but this is a fallback, not authoritative
  if (!inputs && fnName && fnSignaturesPerFile) {
    for (const [file, sigs] of fnSignaturesPerFile.entries()) {
      if (sigs[fnName]?.inputs && sigs[fnName].inputs.length === expectedArgCount) {
        inputs = sigs[fnName].inputs;
        origin = `source:${file} (matched by arg count)`;
        break;
      }
    }
  }

  // PRIORITY 4: Fall back to global signatures (last overwrite wins - unreliable)
  if (!inputs && fnName && fnSignatures[fnName]?.inputs) {
    inputs = fnSignatures[fnName].inputs;
    origin = "source (global - unreliable)";
  }

  if (!inputs) {
    inputs = Array.from(
      { length: Math.min(Math.max(st.length - excludeCount, 0), 4) },
      (_v, i) => ({ name: `arg${i}`, type: "uint256" })
    );
    origin = "fallback";
  }
  if (!inputs.length) return null;
  // Arguments are on stack in forward order: [..., arg0, arg1, argN, continuation, dest_pc]
  const argsSlice = st.slice(
    Math.max(0, st.length - excludeCount - inputs.length),
    st.length - excludeCount
  );
  if (!argsSlice.length) return null;
  const coder = ethers.utils.defaultAbiCoder;
  let truncatedAny = false;
  const args = inputs.map((inp: any, idx: number) => {
    const v = argsSlice[idx];
    const name = inp.name || `arg${idx}`;
    const normalizedType = normalizeSolidityType(inp.type);
    const lower = normalizedType.toLowerCase();
    const isReferenceLike =
      (lower.startsWith("bytes") && lower !== "bytes32") ||
      lower === "string" ||
      isArrayType(lower);
    if (!isReferenceLike) {
      return {
        name,
        value: formatAbiVal(normalizedType || inp.type, v, { withHex: false }),
      };
    }
    let ptr: number | null = null;
    try {
      ptr = Number(BigInt(v));
    } catch {
      ptr = null;
    }
    if (ptr === null || ptr < 0) {
      return { name, value: String(v) };
    }

    if (isArrayType(lower)) {
      const arrayValue = decodeArrayFromMemory(
        coder,
        normalizedType || inp.type,
        ptr,
        memory
      );
      if (arrayValue) {
        return { name, value: arrayValue };
      }
      truncatedAny = true;
      return { name, value: "[truncated]" };
    }

    const lenWordHex = memReadWord(memory, ptr);
    if (!lenWordHex) {
      truncatedAny = true;
      return { name, value: "[truncated]" };
    }
    let len: number | null = null;
    try {
      len = Number(BigInt(lenWordHex));
    } catch {
      len = null;
    }
    if (len === null || len < 0) {
      truncatedAny = true;
      return { name, value: "[truncated]" };
    }
    const { hex, truncated } = memReadBytes(memory, ptr + 32, len);
    if (!hex) {
      truncatedAny = true;
      return { name, value: "[truncated]" };
    }
    if (truncated) truncatedAny = true;

    // For strings, memory contains raw UTF-8 bytes (not ABI-encoded)
    if (lower === "string") {
      try {
        const hexStr = hex.slice(2);
        let result = "";
        for (let i = 0; i < hexStr.length; i += 2) {
          const byte = parseInt(hexStr.slice(i, i + 2), 16);
          if (byte === 0) break;
          result += String.fromCharCode(byte);
        }
        return { name, value: `"${result}"` };
      } catch {
        truncatedAny = truncatedAny || truncated;
        return { name, value: truncateMiddle(truncated ? "[truncated]" : hex) };
      }
    }

    // For bytes and arrays, try ABI decoding
    try {
      const decoded = coder.decode([normalizedType || inp.type], hex)[0];
      const val =
        (decoded && (decoded as any)._isBigNumber) ||
        typeof decoded === "bigint"
          ? (decoded as any).toString()
          : Array.isArray(decoded)
            ? truncateMiddle(JSON.stringify(decoded))
            : String(decoded);
      return { name, value: val };
    } catch {
      truncatedAny = truncatedAny || truncated;
      return { name, value: truncateMiddle(truncated ? "[truncated]" : hex) };
    }
  });
  return { args, origin, truncated: truncatedAny };
}

export {
  getERC20FunctionsInterface,
  getERC721FunctionsInterface,
  getERC20EventsInterface,
  getERC721EventsInterface,
  getOtherEventsInterface,
  getCommonEventInterfaces,
};

/**
 * Build event arguments from a parsed event log
 */
export function buildEventArgs(parsed: any): Array<{ name: string | number; value: string }> {
  if (!parsed) return [];
  const args: Array<{ name: string | number; value: string }> = [];
  const inputs = parsed.eventFragment?.inputs || [];
  for (let i = 0; i < (parsed.args?.length || 0); i++) {
    const raw = parsed.args[i];
    const inp = inputs[i];
    const name = inp?.name || i;
    let value: string;
    if (typeof raw === 'string') {
      value = raw;
    } else if (raw && typeof raw === 'object' && raw._isBigNumber) {
      value = raw.toString();
    } else if (typeof raw === 'bigint') {
      value = raw.toString();
    } else {
      value = String(raw);
    }
    args.push({ name, value });
  }
  return args;
}
