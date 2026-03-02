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

// ── EVM opcode mapping (numeric code → name) ──────────────────────────

export const OPCODE_NAMES: Record<number, string> = {
  0x00: 'STOP', 0x01: 'ADD', 0x02: 'MUL', 0x03: 'SUB', 0x04: 'DIV',
  0x05: 'SDIV', 0x06: 'MOD', 0x07: 'SMOD', 0x08: 'ADDMOD', 0x09: 'MULMOD',
  0x0a: 'EXP', 0x0b: 'SIGNEXTEND', 0x10: 'LT', 0x11: 'GT', 0x12: 'SLT',
  0x13: 'SGT', 0x14: 'EQ', 0x15: 'ISZERO', 0x16: 'AND', 0x17: 'OR',
  0x18: 'XOR', 0x19: 'NOT', 0x1a: 'BYTE', 0x1b: 'SHL', 0x1c: 'SHR',
  0x1d: 'SAR', 0x20: 'KECCAK256', 0x30: 'ADDRESS', 0x31: 'BALANCE',
  0x32: 'ORIGIN', 0x33: 'CALLER', 0x34: 'CALLVALUE', 0x35: 'CALLDATALOAD',
  0x36: 'CALLDATASIZE', 0x37: 'CALLDATACOPY', 0x38: 'CODESIZE',
  0x39: 'CODECOPY', 0x3a: 'GASPRICE', 0x3b: 'EXTCODESIZE',
  0x3c: 'EXTCODECOPY', 0x3d: 'RETURNDATASIZE', 0x3e: 'RETURNDATACOPY',
  0x3f: 'EXTCODEHASH', 0x40: 'BLOCKHASH', 0x41: 'COINBASE',
  0x42: 'TIMESTAMP', 0x43: 'NUMBER', 0x44: 'PREVRANDAO', 0x45: 'GASLIMIT',
  0x46: 'CHAINID', 0x47: 'SELFBALANCE', 0x48: 'BASEFEE', 0x49: 'BLOBHASH',
  0x4a: 'BLOBBASEFEE', 0x50: 'POP', 0x51: 'MLOAD', 0x52: 'MSTORE',
  0x53: 'MSTORE8', 0x54: 'SLOAD', 0x55: 'SSTORE', 0x56: 'JUMP',
  0x57: 'JUMPI', 0x58: 'PC', 0x59: 'MSIZE', 0x5a: 'GAS', 0x5b: 'JUMPDEST',
  0x5c: 'TLOAD', 0x5d: 'TSTORE', 0x5e: 'MCOPY', 0x5f: 'PUSH0',
  0x60: 'PUSH1', 0x61: 'PUSH2', 0x62: 'PUSH3', 0x63: 'PUSH4',
  0x64: 'PUSH5', 0x65: 'PUSH6', 0x66: 'PUSH7', 0x67: 'PUSH8',
  0x68: 'PUSH9', 0x69: 'PUSH10', 0x6a: 'PUSH11', 0x6b: 'PUSH12',
  0x6c: 'PUSH13', 0x6d: 'PUSH14', 0x6e: 'PUSH15', 0x6f: 'PUSH16',
  0x70: 'PUSH17', 0x71: 'PUSH18', 0x72: 'PUSH19', 0x73: 'PUSH20',
  0x74: 'PUSH21', 0x75: 'PUSH22', 0x76: 'PUSH23', 0x77: 'PUSH24',
  0x78: 'PUSH25', 0x79: 'PUSH26', 0x7a: 'PUSH27', 0x7b: 'PUSH28',
  0x7c: 'PUSH29', 0x7d: 'PUSH30', 0x7e: 'PUSH31', 0x7f: 'PUSH32',
  0x80: 'DUP1', 0x81: 'DUP2', 0x82: 'DUP3', 0x83: 'DUP4',
  0x84: 'DUP5', 0x85: 'DUP6', 0x86: 'DUP7', 0x87: 'DUP8',
  0x88: 'DUP9', 0x89: 'DUP10', 0x8a: 'DUP11', 0x8b: 'DUP12',
  0x8c: 'DUP13', 0x8d: 'DUP14', 0x8e: 'DUP15', 0x8f: 'DUP16',
  0x90: 'SWAP1', 0x91: 'SWAP2', 0x92: 'SWAP3', 0x93: 'SWAP4',
  0x94: 'SWAP5', 0x95: 'SWAP6', 0x96: 'SWAP7', 0x97: 'SWAP8',
  0x98: 'SWAP9', 0x99: 'SWAP10', 0x9a: 'SWAP11', 0x9b: 'SWAP12',
  0x9c: 'SWAP13', 0x9d: 'SWAP14', 0x9e: 'SWAP15', 0x9f: 'SWAP16',
  0xa0: 'LOG0', 0xa1: 'LOG1', 0xa2: 'LOG2', 0xa3: 'LOG3', 0xa4: 'LOG4',
  0xf0: 'CREATE', 0xf1: 'CALL', 0xf2: 'CALLCODE', 0xf3: 'RETURN',
  0xf4: 'DELEGATECALL', 0xf5: 'CREATE2', 0xfa: 'STATICCALL',
  0xfd: 'REVERT', 0xfe: 'INVALID', 0xff: 'SELFDESTRUCT',
};

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
      opcodeName: OPCODE_NAMES[opcodeNum] || `UNKNOWN(0x${opcodeNum.toString(16)})`,
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
