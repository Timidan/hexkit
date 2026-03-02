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
  buildStructLayout,
  decodeFieldFromSlot,
  parseStorageRead,
  parseStorageWrite,
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
  const fields = findStructFields(structName, sourceFiles);
  if (!fields) {
    debugLog('[deriveStructValueFromTrace] FAIL: No struct fields found for', structName);
    return null;
  }
  debugLog('[deriveStructValueFromTrace] Found fields:', fields.length);
  const layout = buildStructLayout(fields);
  if (layout.length === 0) {
    debugLog('[deriveStructValueFromTrace] FAIL: Empty layout');
    return null;
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
      new RegExp(`\\b${variableName}\\s*\\.\\s*([A-Za-z_][A-Za-z0-9_]*)`)
    );
    if (!match) continue;
    const fieldName = match[1];
    const fieldLayout = layout.find((entry) => entry.name === fieldName);
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
        let slotValueHex = await debugBridgeService.getStorage(sessionId, snapshotId, absoluteSlot);
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
        const elementSize = elementType === 'address' ? 1 : 1;
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
