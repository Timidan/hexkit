import type { RenderContext, RiskSignal, SchemaRender, TypedDataPayload } from '../types';
import {
  addressRow,
  amountRow,
  boolRow,
  longDeadlineSignal,
  nowSeconds,
  timestampRow,
  toBigInt,
} from './shared';

export function renderDaiPermit(
  payload: TypedDataPayload,
  ctx: RenderContext,
): SchemaRender {
  const m = payload.message;
  const holder = String(m.holder ?? '');
  const spender = String(m.spender ?? '');
  const allowed = Boolean(m.allowed);
  const expiryBi = toBigInt(m.expiry);

  const signals: RiskSignal[] = [];
  if (allowed) {
    signals.push({
      level: 'warn',
      code: 'DAI_PERMIT_UNLIMITED',
      message:
        'DAI Permit with `allowed=true` grants unlimited DAI allowance until revoked.',
      field: 'allowed',
    });
  }
  const dl = longDeadlineSignal(
    expiryBi,
    ctx.nowSec ?? nowSeconds(),
    'DAI_PERMIT_LONG_EXPIRY',
    'expiry',
  );
  if (dl) signals.push(dl);

  const expiryDisplay =
    expiryBi !== null
      ? new Date(Number(expiryBi) * 1000).toISOString()
      : String(m.expiry);
  const verdict = allowed ? 'unlimited DAI allowance' : 'DAI allowance revocation';

  return {
    title: 'DAI Permit',
    summary: `You authorize ${spender} for ${verdict} from ${holder}, valid until ${expiryDisplay}.`,
    rows: [
      addressRow('holder', holder),
      addressRow('spender', spender, 'spender'),
      amountRow('nonce', m.nonce),
      timestampRow('expiry', m.expiry),
      boolRow('allowed', allowed),
    ],
    signals,
  };
}
