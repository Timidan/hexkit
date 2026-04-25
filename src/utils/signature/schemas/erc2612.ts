import type { RenderContext, RiskSignal, SchemaRender, TypedDataPayload } from '../types';
import {
  UINT256_MAX,
  addressRow,
  amountRow,
  longDeadlineSignal,
  nowSeconds,
  timestampRow,
  toBigInt,
} from './shared';

const INFINITE_THRESHOLD = UINT256_MAX - 1n;

export function renderErc2612(
  payload: TypedDataPayload,
  ctx: RenderContext,
): SchemaRender {
  const m = payload.message;
  const owner = String(m.owner ?? '');
  const spender = String(m.spender ?? '');
  const valueBi = toBigInt(m.value);
  const nonce = m.nonce;
  const deadlineBi = toBigInt(m.deadline);

  const verifyingContract =
    payload.domain?.verifyingContract?.toLowerCase() ?? '';
  const tokenInfo = ctx.tokenInfo?.get(verifyingContract);
  const symbol = tokenInfo?.symbol ?? 'tokens';

  const amountText =
    valueBi !== null && valueBi >= INFINITE_THRESHOLD
      ? 'UNLIMITED'
      : valueBi !== null
        ? valueBi.toString()
        : String(m.value);

  const signals: RiskSignal[] = [];
  if (valueBi !== null && valueBi >= INFINITE_THRESHOLD) {
    signals.push({
      level: 'warn',
      code: 'UNLIMITED_ALLOWANCE',
      message: `Infinite token allowance (value ≥ 2^256 − 2).`,
      field: 'value',
    });
  }
  const dl = longDeadlineSignal(deadlineBi, ctx.nowSec ?? nowSeconds());
  if (dl) signals.push(dl);

  const deadlineDisplay =
    deadlineBi !== null
      ? new Date(Number(deadlineBi) * 1000).toISOString()
      : String(m.deadline);

  return {
    title: 'ERC-2612 Permit',
    summary: `You authorize ${spender} to spend ${amountText} ${symbol} from ${owner}, valid until ${deadlineDisplay}.`,
    rows: [
      addressRow('owner', owner),
      addressRow('spender', spender, 'spender'),
      amountRow('value', m.value, amountText === 'UNLIMITED' ? 'unlimited' : undefined),
      amountRow('nonce', nonce),
      timestampRow('deadline', m.deadline),
    ],
    signals,
  };
}
