import type { RenderContext, RenderRow, RiskSignal, SchemaRender, TypedDataPayload } from '../types';
import { PERMIT2 } from '../canonicalAddresses';
import {
  UINT160_MAX,
  addressRow,
  amountRow,
  longDeadlineSignal,
  nowSeconds,
  timestampRow,
  toBigInt,
  verifyingContractMismatchSignal,
} from './shared';

const INFINITE_ERC20 = UINT160_MAX - 1n;

type DetailLike = {
  token?: unknown;
  amount?: unknown;
  expiration?: unknown;
  nonce?: unknown;
};

function isInfinite(amount: unknown): boolean {
  const bi = toBigInt(amount);
  return bi !== null && bi >= INFINITE_ERC20;
}

function detailRows(prefix: string, d: DetailLike): RenderRow[] {
  const rows: RenderRow[] = [
    addressRow(`${prefix}.token`, d.token, 'token'),
    amountRow(
      `${prefix}.amount`,
      d.amount,
      isInfinite(d.amount) ? 'unlimited' : undefined,
    ),
    timestampRow(`${prefix}.expiration`, d.expiration),
    amountRow(`${prefix}.nonce`, d.nonce),
  ];
  return rows;
}

function detailSignals(d: DetailLike, ctx: RenderContext, prefix: string): RiskSignal[] {
  const out: RiskSignal[] = [];
  if (isInfinite(d.amount)) {
    out.push({
      level: 'warn',
      code: 'UNLIMITED_ALLOWANCE',
      message: `${prefix}: infinite ERC-20 allowance (uint160 max).`,
      field: `${prefix}.amount`,
    });
  }
  const expirationBi = toBigInt(d.expiration);
  const longExp = longDeadlineSignal(
    expirationBi,
    ctx.nowSec ?? nowSeconds(),
    'PERMIT2_LONG_EXPIRATION',
    `${prefix}.expiration`,
  );
  if (longExp) out.push(longExp);
  return out;
}

export function renderPermit2Single(
  payload: TypedDataPayload,
  ctx: RenderContext,
): SchemaRender {
  const m = payload.message as { details?: DetailLike; spender?: unknown; sigDeadline?: unknown };
  const details = m.details ?? {};
  const signals: RiskSignal[] = [];
  const mismatch = verifyingContractMismatchSignal(
    PERMIT2,
    payload.domain?.verifyingContract,
  );
  if (mismatch) signals.push(mismatch);

  signals.push(...detailSignals(details, ctx, 'details'));
  const sigDeadlineBi = toBigInt(m.sigDeadline);
  const sigLong = longDeadlineSignal(
    sigDeadlineBi,
    ctx.nowSec ?? nowSeconds(),
    'PERMIT2_LONG_SIG_DEADLINE',
    'sigDeadline',
  );
  if (sigLong) signals.push(sigLong);

  return {
    title: 'Permit2 PermitSingle',
    summary: `Grants ${String(m.spender ?? '')} a Permit2 allowance on ${String(details.token ?? '')}.`,
    rows: [
      ...detailRows('details', details),
      addressRow('spender', m.spender, 'spender'),
      timestampRow('sigDeadline', m.sigDeadline),
    ],
    signals,
  };
}

export function renderPermit2Batch(
  payload: TypedDataPayload,
  ctx: RenderContext,
): SchemaRender {
  const m = payload.message as { details?: DetailLike[]; spender?: unknown; sigDeadline?: unknown };
  const details = Array.isArray(m.details) ? m.details : [];
  const rows: RenderRow[] = [];
  const signals: RiskSignal[] = [];
  const mismatch = verifyingContractMismatchSignal(
    PERMIT2,
    payload.domain?.verifyingContract,
  );
  if (mismatch) signals.push(mismatch);

  details.forEach((d, i) => {
    rows.push(...detailRows(`details[${i}]`, d));
    signals.push(...detailSignals(d, ctx, `details[${i}]`));
  });
  rows.push(addressRow('spender', m.spender, 'spender'));
  rows.push(timestampRow('sigDeadline', m.sigDeadline));
  const sigDeadlineBi = toBigInt(m.sigDeadline);
  const sigLong = longDeadlineSignal(
    sigDeadlineBi,
    ctx.nowSec ?? nowSeconds(),
    'PERMIT2_LONG_SIG_DEADLINE',
    'sigDeadline',
  );
  if (sigLong) signals.push(sigLong);

  return {
    title: `Permit2 PermitBatch (${details.length} token${details.length === 1 ? '' : 's'})`,
    summary: `Grants ${String(m.spender ?? '')} Permit2 allowances on ${details.length} token${details.length === 1 ? '' : 's'}.`,
    rows,
    signals,
  };
}

export function renderPermit2TransferFrom(
  payload: TypedDataPayload,
  ctx: RenderContext,
): SchemaRender {
  const m = payload.message as {
    permitted?: { token?: unknown; amount?: unknown };
    spender?: unknown;
    nonce?: unknown;
    deadline?: unknown;
  };
  const permitted = m.permitted ?? {};
  const signals: RiskSignal[] = [];
  const mismatch = verifyingContractMismatchSignal(
    PERMIT2,
    payload.domain?.verifyingContract,
  );
  if (mismatch) signals.push(mismatch);
  signals.push({
    level: 'ok',
    code: 'PERMIT2_TRANSFER_FROM_SINGLE_USE',
    message: 'PermitTransferFrom is single-use and cannot be replayed.',
  });
  const deadlineBi = toBigInt(m.deadline);
  const longDl = longDeadlineSignal(
    deadlineBi,
    ctx.nowSec ?? nowSeconds(),
    'PERMIT2_LONG_DEADLINE',
  );
  if (longDl) signals.push(longDl);

  return {
    title: 'Permit2 PermitTransferFrom',
    summary: `Authorizes a one-time transfer of ${String(permitted.amount ?? '')} of ${String(permitted.token ?? '')} to ${String(m.spender ?? '')}.`,
    rows: [
      addressRow('permitted.token', permitted.token, 'token'),
      amountRow('permitted.amount', permitted.amount),
      addressRow('spender', m.spender, 'spender'),
      amountRow('nonce', m.nonce),
      timestampRow('deadline', m.deadline),
    ],
    signals,
  };
}
