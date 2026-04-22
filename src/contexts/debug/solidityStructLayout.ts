/**
 * Solidity Struct Layout
 *
 * Source-level analysis for Solidity struct definitions, type parsing,
 * field layout computation, and scalar value decoding.
 * Used by struct-based storage decoding in structStorageDecoding.ts.
 *
 * Parsing is backed by `@solidity-parser/parser`; layout computation and
 * decoding follow Solidity's packing rules.
 */

import { parse, visit } from '@solidity-parser/parser';
import type {
  SourceUnit,
  ContractDefinition,
  FunctionDefinition,
  StructDefinition,
  VariableDeclaration,
  VariableDeclarationStatement,
  StateVariableDeclaration,
  FileLevelConstant,
  TypeName,
  ArrayTypeName,
  Mapping as MappingTypeNode,
  UserDefinedTypeName,
  ElementaryTypeName,
  Expression,
} from '@solidity-parser/parser/dist/src/ast-types';
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

// ── AST parse cache ────────────────────────────────────────────────────

const astCache = new WeakMap<Map<string, SourceFile>, Map<string, SourceUnit | null>>();

function parseFile(content: string): SourceUnit | null {
  try {
    return parse(content, { tolerant: true, loc: false, range: false }) as SourceUnit;
  } catch {
    return null;
  }
}

function getParsedFiles(sourceFiles: Map<string, SourceFile>): Map<string, SourceUnit | null> {
  const cached = astCache.get(sourceFiles);
  if (cached) return cached;
  const parsed = new Map<string, SourceUnit | null>();
  for (const [path, file] of sourceFiles.entries()) {
    parsed.set(path, parseFile(file.content));
  }
  astCache.set(sourceFiles, parsed);
  return parsed;
}

function parseSingleSource(source: string): SourceUnit | null {
  return parseFile(source);
}

// ── TypeName rendering (AST → source-text form) ────────────────────────

type ConstantMap = ReadonlyMap<string, string>;

function renderTypeName(node: TypeName, constants?: ConstantMap): string {
  switch (node.type) {
    case 'ElementaryTypeName':
      return (node as ElementaryTypeName).name;
    case 'UserDefinedTypeName':
      return (node as UserDefinedTypeName).namePath;
    case 'Mapping': {
      const mapping = node as MappingTypeNode;
      return `mapping(${renderTypeName(mapping.keyType, constants)} => ${renderTypeName(mapping.valueType, constants)})`;
    }
    case 'ArrayTypeName': {
      const array = node as ArrayTypeName;
      const lengthStr = renderArrayLength(array.length, constants);
      return `${renderTypeName(array.baseTypeName, constants)}[${lengthStr}]`;
    }
    case 'FunctionTypeName':
      return 'function';
    default:
      return 'unknown';
  }
}

function renderArrayLength(expr: Expression | null, constants?: ConstantMap): string {
  if (!expr) return '';
  if (expr.type === 'NumberLiteral') return expr.number;
  if (expr.type === 'HexLiteral') return expr.value;
  if (expr.type === 'Identifier' && constants) {
    const resolved = constants.get(expr.name);
    if (resolved) return resolved;
  }
  return '';
}

// ── Constant resolution (file-level + contract-level numeric literals) ──

function literalToNumericString(expr: Expression | null | undefined): string | null {
  if (!expr) return null;
  if (expr.type === 'NumberLiteral') {
    // Normalize to decimal so parseTypeSpec's /\[[0-9]*\]/g regex accepts it;
    // NumberLiteral.number can be "0xA", "1_000", "1e2", etc.
    const raw = expr.number.replace(/_/g, '');
    try {
      const big = BigInt(raw);
      return big.toString(10);
    } catch {
      const n = Number(raw);
      return Number.isFinite(n) ? String(n) : null;
    }
  }
  if (expr.type === 'HexLiteral') {
    try {
      return BigInt(expr.value).toString(10);
    } catch {
      return null;
    }
  }
  return null;
}

function buildConstantsMap(
  ast: SourceUnit,
  contract: ContractDefinition | null,
): ConstantMap {
  const out = new Map<string, string>();

  for (const node of ast.children) {
    if (node.type !== 'FileLevelConstant') continue;
    const fc = node as FileLevelConstant;
    const value = literalToNumericString(fc.initialValue);
    if (value !== null) out.set(fc.name, value);
  }

  if (contract) {
    for (const sub of contract.subNodes) {
      if (sub.type !== 'StateVariableDeclaration') continue;
      const svd = sub as StateVariableDeclaration;
      const shared = literalToNumericString(svd.initialValue);
      for (const v of svd.variables) {
        if (!v.isDeclaredConst || !v.name) continue;
        const value = literalToNumericString(v.expression) ?? shared;
        if (value !== null) out.set(v.name, value);
      }
    }
  }

  return out;
}

// ── Variable type extraction from source ───────────────────────────────

export function findVariableTypeInFunction(
  source: string,
  functionName: string,
  variableName: string,
): string | null {
  const ast = parseSingleSource(source);
  if (!ast) return null;

  for (const node of ast.children) {
    if (node.type !== 'ContractDefinition') continue;
    const contract = node as ContractDefinition;
    const constants = buildConstantsMap(ast, contract);
    for (const sub of contract.subNodes) {
      if (sub.type !== 'FunctionDefinition') continue;
      const fn = sub as FunctionDefinition;
      if (fn.name !== functionName) continue;

      for (const param of fn.parameters) {
        if (param.name === variableName && param.typeName) {
          return renderTypeName(param.typeName, constants);
        }
      }

      if (!fn.body) continue;
      let found: string | null = null;
      visit(fn.body, {
        VariableDeclarationStatement: (stmt: VariableDeclarationStatement) => {
          if (found) return;
          for (const decl of stmt.variables) {
            if (!decl || decl.type !== 'VariableDeclaration') continue;
            const v = decl as VariableDeclaration;
            if (v.name === variableName && v.typeName) {
              found = renderTypeName(v.typeName, constants);
              return;
            }
          }
        },
      });
      if (found) return found;
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
  sourceFiles: Map<string, SourceFile>,
): StructFieldDef[] | null {
  const parsed = getParsedFiles(sourceFiles);
  for (const ast of parsed.values()) {
    if (!ast) continue;
    const found = findStructInUnit(ast, structName);
    if (found) return found;
  }
  return null;
}

function findStructInUnit(ast: SourceUnit, structName: string): StructFieldDef[] | null {
  const extract = (
    node: StructDefinition,
    constants: ConstantMap,
  ): StructFieldDef[] | null => {
    const fields: StructFieldDef[] = [];
    for (const member of node.members) {
      if (!member.typeName || !member.name) continue;
      fields.push({ name: member.name, type: renderTypeName(member.typeName, constants) });
    }
    return fields.length > 0 ? fields : null;
  };

  for (const node of ast.children) {
    if (node.type === 'StructDefinition' && (node as StructDefinition).name === structName) {
      const fields = extract(node as StructDefinition, buildConstantsMap(ast, null));
      if (fields) return fields;
    }
    if (node.type === 'ContractDefinition') {
      const contract = node as ContractDefinition;
      for (const sub of contract.subNodes) {
        if (sub.type === 'StructDefinition' && (sub as StructDefinition).name === structName) {
          const fields = extract(sub as StructDefinition, buildConstantsMap(ast, contract));
          if (fields) return fields;
        }
      }
    }
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
