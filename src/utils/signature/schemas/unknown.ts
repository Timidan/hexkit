import type {
  RenderContext,
  RenderRow,
  RenderRowKind,
  SchemaRender,
  TypedDataField,
  TypedDataPayload,
} from '../types';

function kindForSolidityType(t: string): RenderRowKind {
  if (t === 'address') return 'address';
  if (t === 'bool') return 'bool';
  if (t.startsWith('uint') || t.startsWith('int')) return 'amount';
  if (t === 'bytes' || /^bytes\d+$/.test(t)) return 'bytes';
  return 'text';
}

function stripArray(t: string): { base: string; isArray: boolean } {
  if (t.endsWith('[]')) return { base: t.slice(0, -2), isArray: true };
  // fixed-length arrays: `T[3]`
  const m = t.match(/^(.*)\[\d+\]$/);
  if (m) return { base: m[1], isArray: true };
  return { base: t, isArray: false };
}

function renderValue(value: unknown, kind: RenderRowKind): string {
  if (value === null || value === undefined) return '';
  if (kind === 'bool') return value ? 'true' : 'false';
  if (kind === 'bytes' && typeof value === 'string') {
    const byteLen = value.startsWith('0x') ? (value.length - 2) / 2 : value.length / 2;
    return `${value.slice(0, 34)}${value.length > 34 ? '…' : ''} (${byteLen} bytes)`;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function walk(
  label: string,
  value: unknown,
  type: string,
  types: TypedDataPayload['types'],
  rows: RenderRow[],
): void {
  const { base, isArray } = stripArray(type);

  if (isArray && Array.isArray(value)) {
    value.forEach((item, i) => walk(`${label}[${i}]`, item, base, types, rows));
    return;
  }

  if (types[base]) {
    // Nested struct
    const struct = (value ?? {}) as Record<string, unknown>;
    for (const field of types[base]) {
      walk(
        `${label}.${field.name}`,
        struct[field.name],
        field.type,
        types,
        rows,
      );
    }
    return;
  }

  const kind = kindForSolidityType(base);
  rows.push({
    label,
    value: renderValue(value, kind),
    raw: value,
    kind,
  });
}

export function renderUnknown(
  payload: TypedDataPayload,
  _ctx: RenderContext,
): SchemaRender {
  const rootType = payload.primaryType;
  const rootFields: TypedDataField[] = payload.types?.[rootType] ?? [];
  const rows: RenderRow[] = [];
  for (const f of rootFields) {
    walk(
      f.name,
      (payload.message as Record<string, unknown>)[f.name],
      f.type,
      payload.types,
      rows,
    );
  }
  return {
    title: `Unknown schema (${rootType || 'no primaryType'})`,
    summary: `HexKit does not recognize this signature shape. Fields shown as raw types — verify every line before signing.`,
    rows,
    signals: [
      {
        level: 'warn',
        code: 'UNKNOWN_PRIMARY_TYPE',
        message:
          'HexKit does not recognize this signature shape; fields shown raw.',
      },
    ],
  };
}
