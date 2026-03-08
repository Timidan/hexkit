/**
 * Debug Bridge Protocol - EDB data transformation layer
 *
 * Converts raw EDB snapshot responses and variable maps into the frontend's
 * DebugSnapshot / DebugVariable types. Includes EVM opcode mapping and
 * Solidity value formatting.
 */

import type {
  DebugSnapshot,
  OpcodeSnapshotDetail,
  HookSnapshotDetail,
  DebugVariable,
  SolValue,
} from '../types/debug';
import { opcodeNames } from '../utils/traceDecoder/opcodes';

// ── EDB Solidity value normalization ───────────────────────────────────

type EdbSolValue = { type: string; value: unknown };

const EDB_SOL_TYPES = new Set([
  'Bool',
  'Int',
  'Uint',
  'Address',
  'Function',
  'FixedBytes',
  'Bytes',
  'String',
  'Array',
  'FixedArray',
  'Tuple',
  'CustomStruct',
]);

export function normalizeEdbSolValue(value: unknown): EdbSolValue | null {
  if (!value || typeof value !== 'object') return null;

  if ('type' in value && 'value' in value) {
    const entry = value as { type?: unknown; value?: unknown };
    if (typeof entry.type === 'string') {
      return { type: entry.type, value: entry.value };
    }
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 1 && EDB_SOL_TYPES.has(entries[0][0])) {
    return { type: entries[0][0], value: entries[0][1] };
  }

  return null;
}

export function bytesToHex(value: unknown): string {
  if (typeof value === 'string') {
    return value.startsWith('0x') ? value : `0x${value}`;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return `0x${BigInt(value).toString(16)}`;
  }
  if (Array.isArray(value)) {
    return `0x${value.map((b) => Number(b).toString(16).padStart(2, '0')).join('')}`;
  }
  if (value && typeof value === 'object') {
    if ('bytes' in value) {
      return bytesToHex((value as { bytes?: unknown }).bytes);
    }
    if ('value' in value) {
      return bytesToHex((value as { value?: unknown }).value);
    }
  }
  return String(value ?? '');
}

export function normalizeAddress(value: string): string {
  const trimmed = value.trim();
  const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return trimmed;
  return `0x${hex.padStart(40, '0').slice(-40)}`;
}

export function formatNumericValue(raw: unknown): { value: string; rawValue?: string } {
  if (raw === null || raw === undefined) return { value: 'null' };

  if (typeof raw === 'bigint') {
    const hex = `0x${raw.toString(16)}`;
    return { value: raw.toString(), rawValue: hex };
  }

  if (typeof raw === 'number') {
    const bn = BigInt(raw);
    return { value: bn.toString(), rawValue: `0x${bn.toString(16)}` };
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('0x')) {
      try {
        const bn = BigInt(trimmed);
        return { value: bn.toString(), rawValue: trimmed };
      } catch {
        return { value: trimmed, rawValue: trimmed };
      }
    }

    if (/^-?\d+$/.test(trimmed)) {
      try {
        const bn = BigInt(trimmed);
        return { value: trimmed, rawValue: `0x${bn.toString(16)}` };
      } catch {
        return { value: trimmed };
      }
    }

    return { value: trimmed };
  }

  return { value: String(raw) };
}

export function formatEdbSolValue(value: unknown): {
  type: string;
  value: string;
  rawValue?: string;
  children?: DebugVariable[];
} {
  if (value === null || value === undefined) {
    return { type: 'unknown', value: 'null' };
  }

  const normalized = normalizeEdbSolValue(value);
  if (!normalized) {
    if (typeof value === 'object') {
      try {
        return { type: 'object', value: JSON.stringify(value) };
      } catch {
        return { type: 'object', value: String(value) };
      }
    }
    return { type: typeof value, value: String(value) };
  }

  const kind = normalized.type;
  const payload = normalized.value;

  switch (kind) {
    case 'Bool': {
      const raw = (payload as { value?: unknown })?.value ?? payload;
      if (typeof raw === 'boolean') {
        return { type: 'bool', value: raw ? 'true' : 'false' };
      }
      const numeric = formatNumericValue(raw);
      if (numeric.value !== 'null' && /^-?\d+$/.test(numeric.value)) {
        return {
          type: 'bool',
          value: numeric.value !== '0' ? 'true' : 'false',
          rawValue: numeric.rawValue,
        };
      }
      return { type: 'bool', value: String(raw) };
    }
    case 'Int': {
      const bits = (payload as { bits?: number })?.bits ?? 256;
      const raw = (payload as { value?: unknown })?.value ?? payload;
      const numeric = formatNumericValue(raw);
      return {
        type: `int${bits}`,
        value: numeric.value,
        rawValue: numeric.rawValue,
      };
    }
    case 'Uint': {
      const bits = (payload as { bits?: number })?.bits ?? 256;
      const raw = (payload as { value?: unknown })?.value ?? payload;
      const numeric = formatNumericValue(raw);
      return {
        type: `uint${bits}`,
        value: numeric.value,
        rawValue: numeric.rawValue,
      };
    }
    case 'Address': {
      const raw = (payload as { value?: unknown })?.value ?? payload;
      const hex = bytesToHex(raw);
      return { type: 'address', value: normalizeAddress(hex), rawValue: hex };
    }
    case 'Function': {
      const hex = bytesToHex(payload);
      return { type: 'function', value: hex, rawValue: hex };
    }
    case 'FixedBytes': {
      const size = (payload as { size?: number })?.size;
      const raw = (payload as { value?: unknown })?.value ?? payload;
      const hex = bytesToHex(raw);
      return { type: `bytes${size ?? ''}`.trim(), value: hex, rawValue: hex };
    }
    case 'Bytes': {
      const hex = bytesToHex(payload);
      return { type: 'bytes', value: hex, rawValue: hex };
    }
    case 'String': {
      const raw = (payload as { value?: unknown })?.value ?? payload;
      return { type: 'string', value: String(raw) };
    }
    case 'Array':
    case 'FixedArray':
    case 'Tuple': {
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown[] })?.items)
          ? (payload as { items?: unknown[] }).items!
          : Array.isArray((payload as { values?: unknown[] })?.values)
            ? (payload as { values?: unknown[] }).values!
            : Array.isArray((payload as { tuple?: unknown[] })?.tuple)
              ? (payload as { tuple?: unknown[] }).tuple!
              : [];
      const children = items.map((child, index) => toDebugVariable(`[${index}]`, child));
      const label = kind === 'Tuple' ? `(${items.length})` : `[${items.length}]`;
      return { type: kind === 'Tuple' ? 'tuple' : 'array', value: label, children };
    }
    case 'CustomStruct': {
      const structName = (payload as { name?: string })?.name ?? 'struct';
      const fieldMap = (payload as { fields?: Record<string, unknown> })?.fields;
      if (fieldMap && typeof fieldMap === 'object' && !Array.isArray(fieldMap)) {
        const children = Object.entries(fieldMap).map(([key, val]) =>
          toDebugVariable(key, val)
        );
        return { type: structName, value: `{${children.length}}`, children };
      }
      const propNames =
        (payload as { prop_names?: string[] })?.prop_names ??
        (payload as { propNames?: string[] })?.propNames ??
        (payload as { fieldNames?: string[] })?.fieldNames ??
        (Array.isArray((payload as { fields?: unknown })?.fields)
          ? ((payload as { fields?: string[] }).fields ?? [])
          : []);
      const tuple = Array.isArray((payload as { tuple?: unknown[] })?.tuple)
        ? (payload as { tuple?: unknown[] }).tuple!
        : Array.isArray((payload as { values?: unknown[] })?.values)
          ? (payload as { values?: unknown[] }).values!
          : [];
      const children = tuple.map((child, index) =>
        toDebugVariable(propNames[index] ?? `field_${index}`, child)
      );
      return { type: structName, value: `{${children.length}}`, children };
    }
    default:
      return { type: String(kind), value: JSON.stringify(payload) };
  }
}

export function toDebugVariable(name: string, value: unknown): DebugVariable {
  const formatted = formatEdbSolValue(value);
  return {
    name,
    type: formatted.type,
    value: formatted.value,
    rawValue: formatted.rawValue,
    children: formatted.children,
  };
}

export function mapEdbVariableMap(value: unknown): DebugVariable[] {
  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value)) {
    const variables: DebugVariable[] = [];
    for (const entry of value) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const name = String(entry[0]);
        variables.push(toDebugVariable(name, entry[1]));
        continue;
      }
      if (entry && typeof entry === 'object') {
        const record = entry as { name?: unknown; value?: unknown; val?: unknown };
        if (record.name !== undefined) {
          const name = String(record.name);
          const payload =
            record.value !== undefined ? record.value : record.val !== undefined ? record.val : entry;
          variables.push(toDebugVariable(name, payload));
        }
      }
    }
    return variables;
  }

  if ('name' in value) {
    const record = value as { name?: unknown; value?: unknown; val?: unknown };
    if (record.name !== undefined) {
      const name = String(record.name);
      const payload =
        record.value !== undefined ? record.value : record.val !== undefined ? record.val : value;
      return [toDebugVariable(name, payload)];
    }
  }

  return Object.entries(value as Record<string, unknown>).map(([name, entry]) =>
    toDebugVariable(name, entry)
  );
}

export function toSolValue(value: unknown): SolValue {
  const formatted = formatEdbSolValue(value);
  return {
    type: formatted.type,
    value: formatted.value,
    rawValue: formatted.rawValue,
    children: formatted.children,
  };
}

// ── Artifact inspection helpers ────────────────────────────────────────

export function hasObjectEntries(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

export function artifactHasDebugMetadata(artifact: unknown): boolean {
  if (!hasObjectEntries(artifact)) return false;

  const input = hasObjectEntries(artifact.input) ? artifact.input : null;
  const output = hasObjectEntries(artifact.output) ? artifact.output : null;
  const hasInputSettings = !!input && input.settings !== undefined && input.settings !== null;
  const hasInputSources = !!input && hasObjectEntries(input.sources);
  const hasOutputContracts = !!output && hasObjectEntries(output.contracts);

  return (hasInputSettings && hasInputSources) || hasOutputContracts;
}

export function artifactsNeedTraceDetailHydration(artifacts: Record<string, unknown> | null): boolean {
  if (!artifacts || !hasObjectEntries(artifacts)) return true;
  const entries = Object.values(artifacts);
  if (entries.length === 0) return true;
  return entries.every((artifact) => !artifactHasDebugMetadata(artifact));
}

// ── Raw EDB snapshot → DebugSnapshot transformation ────────────────────

export function transformEdbSnapshot(raw: any): DebugSnapshot {
  const frameId = Array.isArray(raw.frame_id)
    ? raw.frame_id.join('-')
    : String(raw.frame_id || '0-0');

  // Determine type from detail key (Opcode or Hook)
  const detailKey = raw.detail ? Object.keys(raw.detail)[0] : null;
  const normalizedKey = detailKey ? detailKey.toLowerCase() : null;
  const rawDetail = (detailKey ? raw.detail?.[detailKey] : null) || raw.detail || {};
  const looksLikeHook =
    rawDetail &&
    typeof rawDetail === 'object' &&
    ('path' in rawDetail || 'file_path' in rawDetail || 'locals' in rawDetail);
  const type = normalizedKey === 'hook' || (!detailKey && looksLikeHook) ? 'hook' : 'opcode';

  let detail: OpcodeSnapshotDetail | HookSnapshotDetail;

  if (type === 'opcode') {
    const opcodeNum = rawDetail.opcode ?? 0;
    detail = {
      pc: rawDetail.pc ?? 0,
      opcode: opcodeNum,
      opcodeName: opcodeNames[opcodeNum] || `UNKNOWN(0x${opcodeNum.toString(16)})`,
      gasRemaining: String(rawDetail.gas_remaining ?? rawDetail.gasRemaining ?? '0'),
      stack: Array.isArray(rawDetail.stack) ? rawDetail.stack.map(String) : [],
      memory: rawDetail.memory ? (Array.isArray(rawDetail.memory) ? '0x' + rawDetail.memory.map((b: number) => b.toString(16).padStart(2, '0')).join('') : rawDetail.memory) : undefined,
      calldata: rawDetail.calldata,
      transientStorage: rawDetail.transient_storage,
      storageAccess: rawDetail.storage_read ? {
        type: 'read' as const,
        slot: rawDetail.storage_read.slot,
        value: rawDetail.storage_read.value,
      } : rawDetail.storage_write ? {
        type: 'write' as const,
        slot: rawDetail.storage_write.slot,
        value: rawDetail.storage_write.after,
      } : undefined,
    };
  } else {
    detail = {
      fileIndex: rawDetail.file_index ?? 0,
      filePath: rawDetail.path || rawDetail.file_path || '',
      offset: rawDetail.offset ?? 0,
      length: rawDetail.length ?? 0,
      line: rawDetail.line ?? 0,
      column: rawDetail.column ?? 0,
      functionName: rawDetail.function_name || rawDetail.functionName,
      locals: mapEdbVariableMap(rawDetail.locals),
      stateVariables: mapEdbVariableMap(rawDetail.state_variables || rawDetail.stateVariables),
    };
  }

  return {
    id: raw.id ?? 0,
    frameId,
    targetAddress: raw.target_address || raw.targetAddress || '',
    bytecodeAddress: raw.bytecode_address || raw.bytecodeAddress || raw.code_address || '',
    type,
    detail,
  };
}
