/**
 * Solidity Struct Layout
 *
 * Source-level analysis for Solidity struct definitions, type parsing,
 * field layout computation, and scalar value decoding.
 * Used by struct-based storage decoding in structStorageDecoding.ts.
 */

import type {
  SourceFile,
  DebugVariable,
} from '../../types/debug';

// ── Types ──────────────────────────────────────────────────────────────

export type StructFieldDef = {
  name: string;
  type: string;
};

export type StructFieldLayout = {
  name: string;
  type: string;
  base: string;
  slotOffset: number;
  byteOffset: number;
  sizeBytes: number;
  isDynamic: boolean;
  isMapping: boolean;
  arrayLength?: number;
  arrayElementBase?: string;
  arrayElementSize?: number;
};

// ── Source text helpers ─────────────────────────────────────────────────

export function stripSolidityComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

export function extractBraceBlock(source: string, startIndex: number): string | null {
  const openIndex = source.indexOf('{', startIndex);
  if (openIndex === -1) return null;
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(openIndex + 1, i);
    }
  }
  return null;
}

export function extractParenBlock(source: string, startIndex: number): { body: string; endIndex: number } | null {
  const openIndex = source.indexOf('(', startIndex);
  if (openIndex === -1) return null;
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0) {
      return { body: source.slice(openIndex + 1, i), endIndex: i };
    }
  }
  return null;
}

export function splitParams(params: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of params) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

// ── Variable type extraction from source ───────────────────────────────

export function findVariableTypeInFunction(
  source: string,
  functionName: string,
  variableName: string
): string | null {
  const cleaned = stripSolidityComments(source);
  const fnRegex = new RegExp(`function\\s+${functionName}\\s*\\(`, 'm');
  const fnMatch = fnRegex.exec(cleaned);
  if (!fnMatch) return null;

  // First, check function parameters
  const paramsBlock = extractParenBlock(cleaned, fnMatch.index);
  if (!paramsBlock) return null;
  const params = splitParams(paramsBlock.body);
  for (const param of params) {
    const tokens = param.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;
    const name = tokens[tokens.length - 1];
    if (name !== variableName) continue;
    const typeTokens = tokens
      .slice(0, -1)
      .filter((token) => !['storage', 'memory', 'calldata'].includes(token));
    const typeName = typeTokens.join(' ');
    return typeName || null;
  }

  // If not found in parameters, search in function body for local variable declarations
  const fnBody = extractBraceBlock(cleaned, paramsBlock.endIndex);
  if (fnBody) {
    const localVarPatterns = [
      new RegExp(`([A-Za-z_][A-Za-z0-9_]*)\\s+(?:storage|memory|calldata)\\s+${variableName}\\b`, 'm'),
      new RegExp(`([A-Za-z_][A-Za-z0-9_]*)\\s+${variableName}\\s*[=;]`, 'm'),
    ];

    for (const pattern of localVarPatterns) {
      const localMatch = pattern.exec(fnBody);
      if (localMatch) {
        return localMatch[1];
      }
    }
  }

  return null;
}

// ── Type specification parsing ─────────────────────────────────────────

export function parseTypeSpec(typeName: string): {
  base: string;
  arrayDims: Array<number | null>;
  isMapping: boolean;
  isDynamic: boolean;
} {
  const cleaned = typeName.replace(/\s+/g, ' ').trim();
  if (cleaned.startsWith('mapping')) {
    return { base: 'mapping', arrayDims: [], isMapping: true, isDynamic: true };
  }

  const arrayDims: Array<number | null> = [];
  const arrayRegex = /\[[0-9]*\]/g;
  let match: RegExpExecArray | null;
  while ((match = arrayRegex.exec(cleaned)) !== null) {
    const value = match[0].slice(1, -1);
    arrayDims.push(value ? Number(value) : null);
  }

  const base = cleaned.replace(arrayRegex, '').trim();
  const isDynamic =
    base === 'string' ||
    base === 'bytes' ||
    arrayDims.some((dim) => dim === null);
  return { base, arrayDims, isMapping: false, isDynamic };
}

export function getBaseTypeSize(base: string): number | null {
  if (base === 'bool') return 1;
  if (base === 'address') return 20;
  if (base === 'byte') return 1;
  const bytesMatch = base.match(/^bytes(\d+)$/);
  if (bytesMatch) return Number(bytesMatch[1]);
  const intMatch = base.match(/^(u?int)(\d+)?$/);
  if (intMatch) {
    const bits = intMatch[2] ? Number(intMatch[2]) : 256;
    return bits / 8;
  }
  return null;
}

// ── Struct field extraction ────────────────────────────────────────────

export function findStructFields(
  structName: string,
  sourceFiles: Map<string, SourceFile>
): StructFieldDef[] | null {
  for (const file of sourceFiles.values()) {
    const cleaned = stripSolidityComments(file.content);
    const structRegex = new RegExp(`struct\\s+${structName}\\s*\\{`, 'm');
    const match = structRegex.exec(cleaned);
    if (!match) continue;
    const body = extractBraceBlock(cleaned, match.index);
    if (!body) continue;
    const entries = body
      .split(';')
      .map((entry) => entry.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const fields: StructFieldDef[] = [];
    for (const entry of entries) {
      const fieldMatch = entry.match(/^(.+)\s+([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!fieldMatch) continue;
      fields.push({ type: fieldMatch[1].trim(), name: fieldMatch[2].trim() });
    }
    return fields.length > 0 ? fields : null;
  }
  return null;
}

// ── Layout computation (Solidity packing rules) ────────────────────────

export function buildStructLayout(fields: StructFieldDef[]): StructFieldLayout[] {
  const layouts: StructFieldLayout[] = [];
  let slot = 0;
  let offset = 0;

  for (const field of fields) {
    const typeSpec = parseTypeSpec(field.type);
    const baseSize = getBaseTypeSize(typeSpec.base);
    const isMapping = typeSpec.isMapping;
    const isDynamicArray = typeSpec.arrayDims.some((dim) => dim === null);
    const isDynamic =
      typeSpec.isDynamic ||
      isMapping ||
      baseSize === null;

    if (isDynamic) {
      if (offset > 0) {
        slot += 1;
        offset = 0;
      }
      layouts.push({
        name: field.name,
        type: field.type,
        base: typeSpec.base,
        slotOffset: slot,
        byteOffset: 0,
        sizeBytes: 32,
        isDynamic: true,
        isMapping,
        arrayElementBase: isDynamicArray ? typeSpec.base : undefined,
        arrayElementSize: isDynamicArray && baseSize ? baseSize : undefined,
      });
      slot += 1;
      continue;
    }

    let sizeBytes = baseSize ?? 32;
    let arrayLength: number | undefined;
    let arrayElementBase: string | undefined;
    let arrayElementSize: number | undefined;

    if (typeSpec.arrayDims.length > 0 && baseSize !== null) {
      arrayLength = typeSpec.arrayDims.reduce((acc: number, dim) => acc * (dim ?? 0), 1);
      arrayElementBase = typeSpec.base;
      arrayElementSize = baseSize;
      sizeBytes = baseSize * (arrayLength ?? 1);
    }

    if (sizeBytes > 32) {
      if (offset > 0) {
        slot += 1;
        offset = 0;
      }
      layouts.push({
        name: field.name,
        type: field.type,
        base: typeSpec.base,
        slotOffset: slot,
        byteOffset: 0,
        sizeBytes,
        isDynamic: false,
        isMapping,
        arrayLength,
        arrayElementBase,
        arrayElementSize,
      });
      slot += Math.ceil(sizeBytes / 32);
      continue;
    }

    if (offset + sizeBytes > 32) {
      slot += 1;
      offset = 0;
    }

    layouts.push({
      name: field.name,
      type: field.type,
      base: typeSpec.base,
      slotOffset: slot,
      byteOffset: offset,
      sizeBytes,
      isDynamic: false,
      isMapping,
      arrayLength,
      arrayElementBase,
      arrayElementSize,
    });

    offset += sizeBytes;
    if (offset === 32) {
      slot += 1;
      offset = 0;
    }
  }

  return layouts;
}

// ── Scalar & field value decoding ──────────────────────────────────────

export function toBigIntValue(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

export function formatHex(value: bigint, bytes: number): string {
  const hex = value.toString(16).padStart(bytes * 2, '0');
  return `0x${hex}`;
}

export function decodeScalarValue(base: string, sizeBytes: number, value: bigint): { value: string; rawValue: string } {
  if (base === 'address') {
    const hex = formatHex(value, 20);
    return { value: hex, rawValue: hex };
  }
  if (base === 'bool') {
    const boolValue = value !== 0n ? 'true' : 'false';
    return { value: boolValue, rawValue: formatHex(value, sizeBytes) };
  }
  if (base === 'byte' || base.startsWith('bytes')) {
    const hex = formatHex(value, sizeBytes);
    return { value: hex, rawValue: hex };
  }
  const isSigned = base.startsWith('int') && !base.startsWith('uint');
  if (isSigned) {
    const bits = BigInt(sizeBytes * 8);
    const signBit = 1n << (bits - 1n);
    const mask = (1n << bits) - 1n;
    const normalized = value & mask;
    const signedValue = normalized >= signBit ? normalized - (1n << bits) : normalized;
    return { value: signedValue.toString(), rawValue: formatHex(normalized, sizeBytes) };
  }
  return { value: value.toString(), rawValue: formatHex(value, sizeBytes) };
}

export function decodeFieldFromSlot(field: StructFieldLayout, slotValue: bigint): DebugVariable {
  if (field.isMapping) {
    return { name: field.name, type: field.type, value: 'unknown' };
  }

  if (field.isDynamic && field.arrayElementBase) {
    const lengthValue = decodeScalarValue('uint256', 32, slotValue);
    return {
      name: field.name,
      type: field.type,
      value: lengthValue.value,
      rawValue: lengthValue.rawValue,
    };
  }

  if (field.arrayLength && field.arrayElementBase && field.arrayElementSize) {
    const children: DebugVariable[] = [];
    for (let i = 0; i < field.arrayLength; i += 1) {
      const shift = BigInt((field.byteOffset + i * field.arrayElementSize) * 8);
      const mask = (1n << BigInt(field.arrayElementSize * 8)) - 1n;
      const entryValue = (slotValue >> shift) & mask;
      const formatted = decodeScalarValue(field.arrayElementBase, field.arrayElementSize, entryValue);
      children.push({
        name: `[${i}]`,
        type: field.arrayElementBase,
        value: formatted.value,
        rawValue: formatted.rawValue,
      });
    }
    return {
      name: field.name,
      type: field.type,
      value: `[${field.arrayLength}]`,
      children,
    };
  }

  const shift = BigInt(field.byteOffset * 8);
  const mask = (1n << BigInt(field.sizeBytes * 8)) - 1n;
  const extracted = (slotValue >> shift) & mask;
  const formatted = decodeScalarValue(field.base, field.sizeBytes, extracted);
  return {
    name: field.name,
    type: field.type,
    value: formatted.value,
    rawValue: formatted.rawValue,
  };
}

// ── Storage access parsing ─────────────────────────────────────────────

export function parseStorageRead(value: unknown): { slot: bigint; value: bigint } | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as { slot?: unknown; value?: unknown };
  const slot = toBigIntValue(entry.slot);
  const slotValue = toBigIntValue(entry.value);
  if (slot === null || slotValue === null) return null;
  return { slot, value: slotValue };
}

export function parseStorageWrite(value: unknown): { slot: bigint; value: bigint } | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as { slot?: unknown; after?: unknown };
  const slot = toBigIntValue(entry.slot);
  const slotValue = toBigIntValue(entry.after);
  if (slot === null || slotValue === null) return null;
  return { slot, value: slotValue };
}
