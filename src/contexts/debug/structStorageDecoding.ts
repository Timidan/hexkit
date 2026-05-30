/**
 * Struct Storage Decoding
 *
 * Derives struct variable values from EVM trace data by correlating storage
 * reads/writes with Solidity struct layouts. Fills unread fields by reading
 * storage slots directly via the EDB bridge.
 *
 * Also contains snapshot-finding helpers that require source location matching.
 */

import type {
  DebugSnapshot,
  SnapshotListItem,
  SourceFile,
  HookSnapshotDetail,
  DebugVariable,
  SolValue,
} from '../../types/debug';
import type { DecodedTraceRow } from '../../utils/traceDecoder';
import { debugBridgeService } from '../../services/DebugBridgeService';
import { ethers } from 'ethers';
import {
  buildSlotDescriptors,
  canonicalizeSlot,
  decodeSlotValue,
  type SlotDescriptor,
} from '../../utils/storageLayoutDecode';
import { reconstructStorageLayout } from '../../utils/solidity-layout';
import { placeField, elementsPerSlot, type SlotCursor } from '../../utils/solidity-layout/allocatorTypeHelpers';
import type { StorageLayoutResponse } from '../../types/debug';
import {
  debugLog,
  resolveSourceContent,
  matchesTraceId,
  filePathMatches,
  functionNameMatches,
  normalizeFunctionName,
} from './debugHelpers';
import {
  findVariableTypeInFunction,
  findStructFields,
  decodeFieldFromSlot,
  parseStorageRead,
  parseStorageWrite,
  type StructFieldDef,
  type StructFieldLayout,
} from './solidityStructLayout';

// ── Source line helpers ─────────────────────────────────────────────────

export function getSourceLineText(
  sourceFiles: Map<string, SourceFile>,
  filePath: string,
  line: number | null
): string | null {
  if (!line || line < 1) return null;
  const content = resolveSourceContent(filePath, sourceFiles);
  if (!content) return null;
  const lines = content.split('\n');
  return lines[line - 1] ?? null;
}

// ── AST → StructFieldLayout adapter ─────────────────────────────────────

/**
 * Derive the scalar `base` used by decodeScalarValue from a type label.
 * Contract references decode as addresses; everything else uses the label
 * verbatim (uintN, intN, bool, bytesN, enum X are all handled downstream).
 */
function baseFromTypeLabel(label: string): string {
  if (label === 'address' || label.startsWith('contract ')) return 'address';
  return label;
}

/**
 * Map a single AST storage member (relative to its struct) to a
 * StructFieldLayout, resolving array/dynamic/mapping shape from the layout
 * type definitions. `slotBase` is the struct-relative slot of the parent.
 */
function memberToFieldLayout(
  member: { label: string; offset: number; slot: string; type: string },
  layout: StorageLayoutResponse,
  slotBase: number,
): StructFieldLayout {
  const typeDef = layout.types[member.type];
  const slotOffset = slotBase + Number(member.slot);
  const typeLabel = typeDef?.label ?? member.type;
  const encoding = typeDef?.encoding ?? 'inplace';
  const sizeBytes = typeDef
    ? Math.min(parseInt(typeDef.numberOfBytes, 10) || 32, 32)
    : 32;

  // Mapping member
  if (encoding === 'mapping') {
    return {
      name: member.label,
      type: typeLabel,
      base: baseFromTypeLabel(typeLabel),
      slotOffset,
      byteOffset: 0,
      sizeBytes: 32,
      isDynamic: false,
      isMapping: true,
    };
  }

  // Dynamic bytes/string or dynamic array
  if (encoding === 'bytes' || encoding === 'dynamic_array') {
    const elemBaseId = typeDef?.value;
    const elemDef = elemBaseId ? layout.types[elemBaseId] : undefined;
    return {
      name: member.label,
      type: typeLabel,
      base: baseFromTypeLabel(typeLabel),
      slotOffset,
      byteOffset: 0,
      sizeBytes: 32,
      isDynamic: true,
      isMapping: false,
      arrayElementBase: elemDef ? baseFromTypeLabel(elemDef.label) : undefined,
      arrayElementSize: elemDef
        ? Math.min(parseInt(elemDef.numberOfBytes, 10) || 32, 32)
        : undefined,
    };
  }

  // Fixed array: type id "t_array(<baseId>)<len>_storage"
  const arrayMatch = member.type.match(/^t_array\((.+)\)(\d+)_storage$/);
  if (arrayMatch) {
    const elemId = arrayMatch[1];
    const arrayLength = Number(arrayMatch[2]);
    const elemDef = layout.types[elemId];
    const elemSize = elemDef
      ? Math.min(parseInt(elemDef.numberOfBytes, 10) || 32, 32)
      : 1;
    return {
      name: member.label,
      type: typeLabel,
      base: elemDef ? baseFromTypeLabel(elemDef.label) : 'uint256',
      slotOffset,
      byteOffset: member.offset,
      sizeBytes,
      isDynamic: false,
      isMapping: false,
      arrayLength,
      arrayElementBase: elemDef ? baseFromTypeLabel(elemDef.label) : undefined,
      arrayElementSize: elemSize,
    };
  }

  // Scalar (elementary / enum / contract) — packed inplace
  return {
    name: member.label,
    type: typeLabel,
    base: baseFromTypeLabel(typeLabel),
    slotOffset,
    byteOffset: member.offset,
    sizeBytes,
    isDynamic: false,
    isMapping: false,
  };
}

/**
 * Adapt the AST allocator's struct member entries (layout.types[structTypeId]
 * .members) into the flat StructFieldLayout[] the debug decoder consumes.
 *
 * Nested structs are flattened: each nested member is emitted with its
 * absolute (struct-relative) slot offset and a dotted name, fixing the
 * old regex walker's bug of treating a nested struct as a single 1-slot
 * dynamic field.
 */
export function astStructMembersToFieldLayouts(
  structTypeId: string,
  layout: StorageLayoutResponse,
): StructFieldLayout[] {
  const result: StructFieldLayout[] = [];

  const walk = (typeId: string, slotBase: number, namePrefix: string) => {
    const typeDef = layout.types[typeId];
    if (!typeDef?.members) return;
    for (const member of typeDef.members) {
      const nestedDef = layout.types[member.type];
      // Nested struct: encoding inplace with its own members → flatten
      if (nestedDef?.encoding === 'inplace' && nestedDef.members) {
        walk(
          member.type,
          slotBase + Number(member.slot),
          `${namePrefix}${member.label}.`,
        );
        continue;
      }
      const field = memberToFieldLayout(member, layout, slotBase);
      field.name = `${namePrefix}${field.name}`;
      result.push(field);
    }
  };

  walk(structTypeId, 0, '');
  return result;
}

/**
 * Fallback adapter: lay out source-scanned struct fields using the
 * single-sourced packing primitive (placeField / elementsPerSlot) when the
 * struct is not reachable via the contract AST. Does NOT use the deleted
 * regex layout walker.
 */
export function structFieldsToFieldLayouts(fields: StructFieldDef[]): StructFieldLayout[] {
  const layouts: StructFieldLayout[] = [];
  let slot = 0;
  let offset = 0;
  const cur: SlotCursor = { slot: 0, offset: 0 }; // reused across fields (no per-field alloc)

  for (const field of fields) {
    const cleaned = field.type.replace(/\s+/g, ' ').trim();
    const isMapping = cleaned.startsWith('mapping');

    const arrayDims: Array<number | null> = [];
    const arrayRegex = /\[[0-9]*\]/g;
    let m: RegExpExecArray | null;
    while ((m = arrayRegex.exec(cleaned)) !== null) {
      const v = m[0].slice(1, -1);
      arrayDims.push(v ? Number(v) : null);
    }
    const base = cleaned.replace(arrayRegex, '').trim();
    const baseSize = baseTypeSize(base);
    const isDynamicArray = arrayDims.some((dim) => dim === null);
    const isDynamic =
      base === 'string' || base === 'bytes' || isDynamicArray || isMapping || baseSize === null;

    if (isDynamic) {
      if (offset > 0) { slot += 1; offset = 0; }
      layouts.push({
        name: field.name,
        type: field.type,
        base,
        slotOffset: slot,
        byteOffset: 0,
        sizeBytes: 32,
        isDynamic: true,
        isMapping,
        arrayElementBase: isDynamicArray ? base : undefined,
        arrayElementSize: isDynamicArray && baseSize ? baseSize : undefined,
      });
      slot += 1;
      continue;
    }

    let arrayLength: number | undefined;
    let arrayElementBase: string | undefined;
    let arrayElementSize: number | undefined;

    if (arrayDims.length > 0 && baseSize !== null) {
      arrayLength = arrayDims.reduce((acc: number, dim) => acc * (dim ?? 0), 1);
      arrayElementBase = base;
      arrayElementSize = baseSize;
      // Fixed array starts on a fresh slot; spans ceil(length / per-slot) slots
      if (offset > 0) { slot += 1; offset = 0; }
      layouts.push({
        name: field.name,
        type: field.type,
        base,
        slotOffset: slot,
        byteOffset: 0,
        sizeBytes: Math.min(baseSize, 32),
        isDynamic: false,
        isMapping,
        arrayLength,
        arrayElementBase,
        arrayElementSize,
      });
      const perSlot = elementsPerSlot(baseSize) || 1;
      slot += Math.max(1, Math.ceil((arrayLength ?? 0) / perSlot));
      continue;
    }

    // Scalar — pack via the single-sourced primitive (cursor mutated in place)
    cur.slot = slot; cur.offset = offset;
    const fieldOffset = placeField(cur, baseSize);
    const placementSlot = fieldOffset + baseSize >= 32 ? cur.slot - 1 : cur.slot;
    layouts.push({
      name: field.name,
      type: field.type,
      base,
      slotOffset: placementSlot,
      byteOffset: fieldOffset,
      sizeBytes: baseSize,
      isDynamic: false,
      isMapping,
    });
    slot = cur.slot;
    offset = cur.offset;
  }

  return layouts;
}

/** Byte size of an elementary base type, or null if non-elementary. */
function baseTypeSize(base: string): number | null {
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

// ── Trace-based struct derivation ──────────────────────────────────────

export function deriveStructValueFromTrace(params: {
  variableName: string;
  snapshotId: number;
  traceRows: DecodedTraceRow[];
  sourceFiles: Map<string, SourceFile>;
  preferSourceFile: string | null;
  preferFunctionName: string | null;
}): SolValue | null {
  const {
    variableName,
    snapshotId,
    traceRows,
    sourceFiles,
    preferSourceFile,
    preferFunctionName,
  } = params;

  debugLog('[deriveStructValueFromTrace] Starting:', { variableName, snapshotId, preferSourceFile, preferFunctionName });

  const functionName =
    preferFunctionName ||
    traceRows.find((row) => row.id === snapshotId)?.fn ||
    null;
  if (!functionName) {
    debugLog('[deriveStructValueFromTrace] FAIL: No function name found');
    return null;
  }
  debugLog('[deriveStructValueFromTrace] Function name:', functionName);

  const fileForType =
    preferSourceFile ||
    traceRows.find((row) => row.id === snapshotId)?.sourceFile ||
    null;
  debugLog('[deriveStructValueFromTrace] File for type:', fileForType);
  const sourceContent = fileForType
    ? resolveSourceContent(fileForType, sourceFiles)
    : null;
  if (!sourceContent) {
    debugLog('[deriveStructValueFromTrace] FAIL: No source content for file:', fileForType);
    return null;
  }
  debugLog('[deriveStructValueFromTrace] Source content length:', sourceContent.length);

  const normalizedFn = normalizeFunctionName(functionName);
  debugLog('[deriveStructValueFromTrace] Normalized function name:', normalizedFn);
  const variableType = findVariableTypeInFunction(
    sourceContent,
    normalizedFn,
    variableName
  );
  if (!variableType) {
    debugLog('[deriveStructValueFromTrace] FAIL: No variable type found for', variableName, 'in', normalizedFn);
    return null;
  }
  debugLog('[deriveStructValueFromTrace] Variable type:', variableType);

  const structName = variableType.split(/\s+/)[0];
  debugLog('[deriveStructValueFromTrace] Struct name:', structName);

  // Primary path: reconstruct the contract's storage layout via the AST
  // allocator and adapt the struct's member entries. The struct must be
  // reachable from the current row's contract for t_struct(name)_storage to
  // appear in layout.types.
  let layout: StructFieldLayout[] | null = null;
  const currentRow = traceRows.find((row) => row.id === snapshotId) ?? null;
  const contractName =
    currentRow?.contract ||
    currentRow?.entryMeta?.codeContractName ||
    currentRow?.entryMeta?.targetContractName ||
    null;
  if (contractName) {
    const files: Record<string, string> = {};
    for (const [path, file] of sourceFiles.entries()) {
      files[path] = file.content;
    }
    const reconstruction = reconstructStorageLayout({ files, contractName });
    const structTypeId = `t_struct(${structName})_storage`;
    if (reconstruction.layout.types[structTypeId]) {
      const astLayout = astStructMembersToFieldLayouts(structTypeId, reconstruction.layout);
      if (astLayout.length > 0) {
        layout = astLayout;
        debugLog('[deriveStructValueFromTrace] AST layout built with', astLayout.length, 'fields');
      }
    }
  }

  // Fallback: source-scan the struct (all files) and lay it out through the
  // single-sourced packing primitive when the AST path can't reach it.
  if (!layout) {
    const fields = findStructFields(structName, sourceFiles);
    if (!fields) {
      debugLog('[deriveStructValueFromTrace] FAIL: No struct fields found for', structName);
      return null;
    }
    debugLog('[deriveStructValueFromTrace] Found fields (fallback):', fields.length);
    const fallbackLayout = structFieldsToFieldLayouts(fields);
    if (fallbackLayout.length === 0) {
      debugLog('[deriveStructValueFromTrace] FAIL: Empty layout');
      return null;
    }
    layout = fallbackLayout;
  }
  debugLog('[deriveStructValueFromTrace] Layout built with', layout.length, 'fields');
  debugLog('[deriveStructValueFromTrace] Field layout:', JSON.stringify(layout.map(f => ({
    name: f.name,
    slot: f.slotOffset,
    byteOffset: f.byteOffset,
    isDynamic: f.isDynamic,
    type: f.type
  })), null, 2));

  const layoutBySlot = new Map<number, StructFieldLayout[]>();
  for (const field of layout) {
    const list = layoutBySlot.get(field.slotOffset) || [];
    list.push(field);
    layoutBySlot.set(field.slotOffset, list);
  }

  const relevantRows = traceRows
    .filter((row) => row.id <= snapshotId)
    .filter((row) => row.storage_read || row.storage_write)
    .filter((row) =>
      preferFunctionName ? functionNameMatches(row.fn || '', preferFunctionName) : true
    )
    .filter((row) =>
      preferSourceFile && row.sourceFile
        ? filePathMatches(row.sourceFile, preferSourceFile)
        : true
    )
    .sort((a, b) => a.id - b.id);

  let baseSlot: bigint | null = null;
  for (const row of relevantRows) {
    if (!row.sourceFile || !row.line) continue;
    const lineText = getSourceLineText(sourceFiles, row.sourceFile, row.line);
    if (!lineText) continue;
    const match = lineText.match(
      new RegExp(`\\b${variableName}((?:\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*)+)`)
    );
    if (!match) continue;
    // Full dotted member path so nested-struct leaves (e.g. "inner.a", emitted by
    // the AST adapter) resolve; fall back to the first segment for flat layouts.
    const fieldPath = match[1].replace(/\s+/g, '').replace(/^\./, '');
    const fieldLayout =
      layout.find((entry) => entry.name === fieldPath) ||
      layout.find((entry) => entry.name === fieldPath.split('.')[0]);
    if (!fieldLayout) continue;
    let storageAccess = parseStorageRead(row.storage_read);
    if (!storageAccess) {
      storageAccess = parseStorageWrite(row.storage_write);
    }
    if (!storageAccess) continue;
    baseSlot = storageAccess.slot - BigInt(fieldLayout.slotOffset);
    break;
  }

  if (baseSlot === null) {
    debugLog('[deriveStructValueFromTrace] FAIL: No base slot found. Checked', relevantRows.length, 'rows');
    return null;
  }
  debugLog('[deriveStructValueFromTrace] Base slot found:', baseSlot.toString(16));

  const traceSlotsFound = new Set<string>();
  for (const row of relevantRows) {
    const storageAccess = parseStorageRead(row.storage_read) || parseStorageWrite(row.storage_write);
    if (storageAccess) {
      const relativeSlot = storageAccess.slot - baseSlot;
      traceSlotsFound.add(`slot ${relativeSlot} (abs: 0x${storageAccess.slot.toString(16)})`);
    }
  }
  debugLog('[deriveStructValueFromTrace] Storage slots in trace (relative to base):', Array.from(traceSlotsFound));

  const decodedFields = new Map<string, DebugVariable>();
  for (const row of relevantRows) {
    let storageAccess = parseStorageRead(row.storage_read);
    if (!storageAccess) {
      storageAccess = parseStorageWrite(row.storage_write);
    }
    if (!storageAccess) continue;
    const fieldOffset = storageAccess.slot - baseSlot;
    if (fieldOffset < 0n) continue;
    const offsetNumber = Number(fieldOffset);
    if (!Number.isFinite(offsetNumber)) continue;
    const slotFields = layoutBySlot.get(offsetNumber);
    if (!slotFields) continue;
    for (const field of slotFields) {
      if (!decodedFields.has(field.name)) {
        const decoded = decodeFieldFromSlot(field, storageAccess.value);
        decodedFields.set(field.name, decoded);
      }
    }
  }

  if (decodedFields.size === 0) {
    debugLog('[deriveStructValueFromTrace] FAIL: No fields decoded');
    return null;
  }
  debugLog('[deriveStructValueFromTrace] SUCCESS: Decoded', decodedFields.size, '/', layout.length, 'fields');
  debugLog('[deriveStructValueFromTrace] Decoded fields:', Array.from(decodedFields.keys()));
  const undecodedFields = layout.filter(f => !decodedFields.has(f.name)).map(f => ({
    name: f.name,
    expectedSlot: f.slotOffset,
    type: f.type,
    isDynamic: f.isDynamic
  }));
  debugLog('[deriveStructValueFromTrace] Undecoded fields:', JSON.stringify(undecodedFields, null, 2));

  const children = layout.map((field) =>
    decodedFields.get(field.name) || {
      name: field.name,
      type: field.type,
      value: 'unread',
      _slotOffset: field.slotOffset,
      _byteOffset: field.byteOffset,
      _sizeBytes: field.sizeBytes,
      _base: field.base,
      _isDynamic: field.isDynamic,
    }
  );

  return {
    type: structName,
    value: `{${decodedFields.size}/${layout.length}}`,
    children,
    _meta: {
      baseSlot,
      layout,
      structName,
      unreadCount: layout.length - decodedFields.size,
    },
  };
}

export function deriveScalarStateValueFromTrace(params: {
  variableName: string;
  snapshotId: number;
  traceRows: DecodedTraceRow[];
  sourceFiles: Map<string, SourceFile>;
}): SolValue | null {
  const {
    variableName,
    snapshotId,
    traceRows,
    sourceFiles,
  } = params;

  const currentRow = traceRows.find((row) => row.id === snapshotId) ?? null;
  if (!currentRow) {
    return null;
  }

  const contractName =
    currentRow.contract ||
    currentRow.entryMeta?.codeContractName ||
    currentRow.entryMeta?.targetContractName ||
    null;
  if (!contractName) {
    return null;
  }

  const files: Record<string, string> = {};
  for (const [path, file] of sourceFiles.entries()) {
    files[path] = file.content;
  }

  const reconstruction = reconstructStorageLayout({
    files,
    contractName,
  });
  if (reconstruction.layout.storage.length === 0) {
    debugLog('[deriveScalarStateValueFromTrace] No storage layout entries for', contractName);
    return null;
  }

  const descriptorsBySlot = buildSlotDescriptors(reconstruction.layout);
  let matchedDescriptor:
    | {
        slotHex: string;
        descriptor: SlotDescriptor;
      }
    | null = null;

  for (const [slotHex, descriptors] of descriptorsBySlot.entries()) {
    const descriptor = descriptors.find((entry) => entry.label === variableName);
    if (descriptor) {
      matchedDescriptor = { slotHex, descriptor };
      break;
    }
  }

  if (!matchedDescriptor) {
    debugLog('[deriveScalarStateValueFromTrace] No storage descriptor for', variableName, 'in', contractName);
    return null;
  }

  const currentStorageContext = currentRow.entryMeta?.target?.toLowerCase() ?? null;
  const relevantRows = traceRows
    .filter((row) => row.id <= snapshotId)
    .filter((row) => {
      const storageContext = row.entryMeta?.target?.toLowerCase() ?? null;
      if (currentStorageContext && storageContext && storageContext !== currentStorageContext) {
        return false;
      }
      const rowContractName =
        row.contract ||
        row.entryMeta?.codeContractName ||
        row.entryMeta?.targetContractName ||
        null;
      return rowContractName === contractName;
    })
    .sort((a, b) => b.id - a.id);

  for (const row of relevantRows) {
    const storageWrite = parseStorageWrite(row.storage_write);
    const storageRead = parseStorageRead(row.storage_read);
    const storageAccess = storageWrite || storageRead;
    if (!storageAccess) {
      continue;
    }

    const slotHex = canonicalizeSlot(`0x${storageAccess.slot.toString(16)}`);
    if (slotHex !== matchedDescriptor.slotHex) {
      continue;
    }

    const rawValue = `0x${storageAccess.value.toString(16).padStart(64, '0')}`;
    const decodedValue = decodeSlotValue(rawValue, matchedDescriptor.descriptor);
    debugLog(
      '[deriveScalarStateValueFromTrace] Decoded',
      variableName,
      'from slot',
      slotHex,
      'at row',
      row.id,
      '=>',
      decodedValue,
    );
    return {
      type: matchedDescriptor.descriptor.typeLabel,
      value: decodedValue,
      rawValue,
    };
  }

  debugLog(
    '[deriveScalarStateValueFromTrace] No matching storage access for',
    variableName,
    'at step',
    snapshotId,
  );
  return null;
}

// ── Dynamic array slot computation ─────────────────────────────────────

export function computeDynamicArrayDataSlot(arraySlot: bigint): bigint {
  try {
    const encoded = ethers.utils.defaultAbiCoder.encode(['uint256'], [arraySlot.toString()]);
    const hash = ethers.utils.keccak256(encoded);
    return BigInt(hash);
  } catch (err) {
    console.warn('[computeDynamicArrayDataSlot] Failed to compute keccak256:', err);
    return 0n;
  }
}

// ── Fill unread struct fields from storage ──────────────────────────────

export async function fillUnreadFieldsFromStorage(
  structResult: SolValue,
  sessionId: string,
  snapshotId: number,
  rpcFallback?: {
    rpcUrl: string;
    contractAddress: string;
    blockTag: string | number;
  },
): Promise<SolValue> {
  const meta = (structResult as { _meta?: { baseSlot: bigint; layout: StructFieldLayout[]; unreadCount: number } })._meta;
  if (!meta || meta.unreadCount === 0 || !structResult.children) {
    return structResult;
  }

  debugLog('[fillUnreadFieldsFromStorage] Starting with', meta.unreadCount, 'unread fields');

  const { baseSlot, layout } = meta;
  const children = [...structResult.children];
  let filledCount = 0;

  const slotCache = new Map<string, bigint>();

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const unreadChild = child as {
      value: string;
      _slotOffset?: number;
      _byteOffset?: number;
      _sizeBytes?: number;
      _base?: string;
      _isDynamic?: boolean;
    };
    if (unreadChild.value !== 'unread' || unreadChild._slotOffset === undefined) {
      continue;
    }

    const fieldLayout = layout.find(f => f.name === child.name);
    const isDynamic = fieldLayout?.isDynamic || unreadChild._isDynamic || child.type.endsWith('[]');

    const absoluteSlot = baseSlot + BigInt(unreadChild._slotOffset);
    const slotKey = absoluteSlot.toString(16);
    debugLog(`[fillUnreadFieldsFromStorage] Processing field "${child.name}" at slot 0x${slotKey}, byteOffset ${fieldLayout?.byteOffset ?? unreadChild._byteOffset}, isDynamic: ${isDynamic}`);

    try {
      let slotValue: bigint;
      if (slotCache.has(slotKey)) {
        slotValue = slotCache.get(slotKey)!;
        debugLog(`[fillUnreadFieldsFromStorage] Using cached slot value for 0x${slotKey}`);
      } else {
        const slotValueHex = await debugBridgeService.getStorage(sessionId, snapshotId, absoluteSlot);
        if (!slotValueHex) {
          debugLog(`[fillUnreadFieldsFromStorage] No value returned for slot 0x${slotKey}`);
          continue;
        }

        slotValue = BigInt(slotValueHex);

        slotCache.set(slotKey, slotValue);

        const finalHexStr = slotValue.toString(16);
        const finalByteLen = Math.ceil(finalHexStr.length / 2);
        debugLog(`[fillUnreadFieldsFromStorage] Read slot 0x${slotKey}: value=0x${finalHexStr.padStart(64, '0')} (${finalByteLen} significant bytes)`);
      }

      const byteOffset = fieldLayout?.byteOffset ?? unreadChild._byteOffset ?? 0;
      debugLog(`[fillUnreadFieldsFromStorage] Decoding field "${child.name}" from slot value, byteOffset=${byteOffset}`);

      // Handle dynamic arrays specially
      if (isDynamic && child.type.endsWith('[]')) {
        const arrayLength = Number(slotValue);
        debugLog(`[fillUnreadFieldsFromStorage] Dynamic array "${child.name}" has length ${arrayLength}`);

        const maxElements = Math.min(arrayLength, 100);
        if (arrayLength > maxElements) {
          debugLog(`[fillUnreadFieldsFromStorage] Limiting array read to ${maxElements} elements (total: ${arrayLength})`);
        }

        const dataSlot = computeDynamicArrayDataSlot(absoluteSlot);
        if (dataSlot === 0n) {
          children[i] = {
            name: child.name,
            type: child.type,
            value: `[${arrayLength} elements]`,
          };
          filledCount++;
          continue;
        }

        const elementType = child.type.replace('[]', '');
        const elementSize = 1;
        const arrayChildren: DebugVariable[] = [];
        const readBatchSize = 8;
        for (let start = 0; start < maxElements; start += readBatchSize) {
          const end = Math.min(maxElements, start + readBatchSize);
          const indexes = Array.from({ length: end - start }, (_, idx) => start + idx);
          const chunkValues = await Promise.all(
            indexes.map(async (j) => {
              const elementSlot = dataSlot + BigInt(j * elementSize);
              const elementValueHex = await debugBridgeService.getStorage(
                sessionId,
                snapshotId,
                elementSlot
              );
              return { j, elementValueHex };
            })
          );

          for (const { j, elementValueHex } of chunkValues) {
            if (!elementValueHex) continue;
            const elementValue = BigInt(elementValueHex);
            let formattedValue: string;
            if (elementType === 'address') {
              formattedValue = '0x' + elementValue.toString(16).padStart(40, '0');
            } else {
              formattedValue = elementValue.toString();
            }
            arrayChildren.push({
              name: `[${j}]`,
              type: elementType,
              value: formattedValue,
            });
          }
        }

        children[i] = {
          name: child.name,
          type: child.type,
          value: `[${arrayLength}]`,
          children: arrayChildren,
        };
        filledCount++;
        continue;
      }

      // Handle non-dynamic fields
      if (!fieldLayout) {
        const decoded = decodeFieldFromSlot({
          name: child.name,
          type: child.type,
          slotOffset: unreadChild._slotOffset,
          byteOffset: unreadChild._byteOffset ?? 0,
          sizeBytes: unreadChild._sizeBytes ?? 32,
          base: unreadChild._base ?? 'uint256',
          isDynamic: false,
          isMapping: false,
        }, slotValue);
        children[i] = decoded;
        filledCount++;
      } else {
        const decoded = decodeFieldFromSlot(fieldLayout, slotValue);
        children[i] = decoded;
        filledCount++;
      }
    } catch (err) {
      console.error(`[fillUnreadFieldsFromStorage] Error reading slot for "${child.name}":`, err);
    }
  }

  debugLog('[fillUnreadFieldsFromStorage] Filled', filledCount, 'fields from storage');

  const totalFields = children.length;
  const decodedCount = totalFields - meta.unreadCount + filledCount;

  return {
    ...structResult,
    value: `{${decodedCount}/${totalFields}}`,
    children,
    _meta: undefined,
  } as SolValue;
}

// ── Snapshot source-location matching ──────────────────────────────────

export function matchesSourceLocation(
  detail: HookSnapshotDetail,
  targetFile: string,
  targetLine: number | null,
  lineTolerance: number
): boolean {
  if (!detail.filePath || !filePathMatches(detail.filePath, targetFile)) {
    return false;
  }
  if (targetLine === null) return true;
  if (!detail.line) return false;
  return Math.abs(detail.line - targetLine) <= lineTolerance;
}

export function findNearestHookSnapshotIdBySource(
  snapshotList: SnapshotListItem[],
  snapshotCache: Map<number, DebugSnapshot>,
  targetId: number,
  traceId: number | null,
  targetFile: string,
  targetLine: number | null,
  lineTolerance: number
): number | null {
  const bestRef: { value: { id: number; lineDiff: number; snapshotDiff: number } | null } = { value: null };
  const seen = new Set<number>();

  const consider = (id: number, filePath?: string, line?: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (!filePath || !filePathMatches(filePath, targetFile)) return;

    let lineDiff = 0;
    if (targetLine !== null) {
      if (line === undefined) return;
      lineDiff = Math.abs(line - targetLine);
      if (lineDiff > lineTolerance) return;
    }

    const snapshotDiff = Math.abs(id - targetId);
    if (
      !bestRef.value ||
      lineDiff < bestRef.value.lineDiff ||
      (lineDiff === bestRef.value.lineDiff && snapshotDiff < bestRef.value.snapshotDiff)
    ) {
      bestRef.value = { id, lineDiff, snapshotDiff };
    }
  };

  for (const [id, snapshot] of snapshotCache.entries()) {
    if (snapshot.type !== 'hook') continue;
    if (!matchesTraceId(snapshot.frameId, traceId)) continue;
    const detail = snapshot.detail as HookSnapshotDetail;
    consider(id, detail.filePath, detail.line);
  }

  for (const snap of snapshotList) {
    if (snap.type !== 'hook') continue;
    if (!matchesTraceId(snap.frameId, traceId)) continue;
    consider(snap.id, snap.filePath, snap.line ?? undefined);
  }

  return bestRef.value?.id ?? null;
}

export function findNearestHookSnapshotIdByFunction(
  snapshotList: SnapshotListItem[],
  snapshotCache: Map<number, DebugSnapshot>,
  targetId: number,
  traceId: number | null,
  targetFile: string,
  targetFunction: string
): number | null {
  const bestRef: { value: { id: number; snapshotDiff: number } | null } = { value: null };
  const seen = new Set<number>();

  const consider = (id: number, filePath?: string, functionName?: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (!filePath || !filePathMatches(filePath, targetFile)) return;
    if (!functionNameMatches(functionName, targetFunction)) return;

    const snapshotDiff = Math.abs(id - targetId);
    if (!bestRef.value || snapshotDiff < bestRef.value.snapshotDiff) {
      bestRef.value = { id, snapshotDiff };
    }
  };

  for (const [id, snapshot] of snapshotCache.entries()) {
    if (snapshot.type !== 'hook') continue;
    if (!matchesTraceId(snapshot.frameId, traceId)) continue;
    const detail = snapshot.detail as HookSnapshotDetail;
    consider(id, detail.filePath, detail.functionName);
  }

  for (const snap of snapshotList) {
    if (snap.type !== 'hook') continue;
    if (!matchesTraceId(snap.frameId, traceId)) continue;
    consider(snap.id, snap.filePath, snap.functionName);
  }

  return bestRef.value?.id ?? null;
}
