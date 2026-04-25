import type { RenderRow, RiskSignal } from '../types';

export const UINT256_MAX = (1n << 256n) - 1n;
export const UINT160_MAX = (1n << 160n) - 1n;
export const UINT48_MAX = (1n << 48n) - 1n;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const THIRTY_DAYS_SEC = 60 * 60 * 24 * 30;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function toBigInt(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

export function formatBigIntOrRaw(v: unknown): string {
  const bi = toBigInt(v);
  return bi === null ? String(v) : bi.toString();
}

export function isZeroAddress(v: unknown): boolean {
  return typeof v === 'string' && v.toLowerCase() === ZERO_ADDRESS;
}

export function addressRow(label: string, value: unknown, annotation?: string): RenderRow {
  return {
    label,
    value: typeof value === 'string' ? value : String(value),
    raw: value,
    kind: 'address',
    annotation,
  };
}

export function amountRow(
  label: string,
  value: unknown,
  annotation?: string,
): RenderRow {
  return {
    label,
    value: formatBigIntOrRaw(value),
    raw: value,
    kind: 'amount',
    annotation,
  };
}

// JS Date is limited to ±8.64e15 ms from epoch → ~285k years. Anything larger in
// seconds overflows and the toISOString() throws RangeError. Cap the render.
const MAX_SAFE_TS_SECONDS = 8_640_000_000_000n; // 2^53-ish; safely formattable
function safeTimestamp(bi: bigint): string {
  if (bi < 0n) return `${bi.toString()} (negative)`;
  if (bi > MAX_SAFE_TS_SECONDS) return `${bi.toString()} (never / effectively infinite)`;
  try {
    return new Date(Number(bi) * 1000).toISOString();
  } catch {
    return `${bi.toString()} (unrenderable)`;
  }
}

export function timestampRow(label: string, value: unknown): RenderRow {
  const bi = toBigInt(value);
  const str = bi === null ? String(value) : safeTimestamp(bi);
  return { label, value: str, raw: value, kind: 'timestamp' };
}

export function boolRow(label: string, value: unknown): RenderRow {
  return { label, value: value ? 'true' : 'false', raw: value, kind: 'bool' };
}

export function textRow(label: string, value: unknown, annotation?: string): RenderRow {
  return {
    label,
    value: typeof value === 'string' ? value : JSON.stringify(value),
    raw: value,
    kind: 'text',
    annotation,
  };
}

export function bytesRow(label: string, value: unknown): RenderRow {
  const str = typeof value === 'string' ? value : '';
  const byteLen = str.startsWith('0x') ? (str.length - 2) / 2 : str.length / 2;
  return {
    label,
    value: `${str.slice(0, 34)}${str.length > 34 ? '…' : ''} (${byteLen} bytes)`,
    raw: value,
    kind: 'bytes',
  };
}

export function verifyingContractMismatchSignal(
  expected: string,
  actual: string | undefined,
): RiskSignal | null {
  if (!actual) return null;
  if (actual.toLowerCase() === expected.toLowerCase()) return null;
  return {
    level: 'danger',
    code: 'VERIFYING_CONTRACT_MISMATCH',
    message: `Expected ${expected} but domain.verifyingContract is ${actual}.`,
    field: 'domain.verifyingContract',
  };
}

export function longDeadlineSignal(
  deadline: bigint | null,
  nowSec = nowSeconds(),
  code = 'LONG_DEADLINE',
  field = 'deadline',
): RiskSignal | null {
  if (deadline === null) return null;
  if (deadline === UINT256_MAX) {
    return {
      level: 'warn',
      code: 'DEADLINE_NEVER',
      message: 'Deadline is max uint256 (never expires).',
      field,
    };
  }
  if (deadline > BigInt(nowSec) + BigInt(THIRTY_DAYS_SEC)) {
    return {
      level: 'warn',
      code,
      message: `Deadline is more than 30 days out (${safeTimestamp(deadline)}).`,
      field,
    };
  }
  return null;
}
