import type { RenderContext, RenderRow, RiskSignal, SchemaRender, TypedDataPayload } from '../types';
import { COW_GPV2_SETTLEMENT } from '../canonicalAddresses';
import {
  addressRow,
  amountRow,
  boolRow,
  textRow,
  timestampRow,
  verifyingContractMismatchSignal,
} from './shared';

export function renderCowswap(
  payload: TypedDataPayload,
  _ctx: RenderContext,
): SchemaRender {
  const m = payload.message as Record<string, unknown>;
  const rows: RenderRow[] = [
    addressRow('sellToken', m.sellToken),
    addressRow('buyToken', m.buyToken),
    addressRow('receiver', m.receiver),
    amountRow('sellAmount', m.sellAmount),
    amountRow('buyAmount', m.buyAmount),
    timestampRow('validTo', m.validTo),
    textRow('appData', String(m.appData ?? '')),
    amountRow('feeAmount', m.feeAmount),
    textRow('kind', String(m.kind ?? '')),
    boolRow('partiallyFillable', m.partiallyFillable),
    textRow('sellTokenBalance', String(m.sellTokenBalance ?? '')),
    textRow('buyTokenBalance', String(m.buyTokenBalance ?? '')),
  ];

  const signals: RiskSignal[] = [];
  const mismatch = verifyingContractMismatchSignal(
    COW_GPV2_SETTLEMENT,
    payload.domain?.verifyingContract,
  );
  if (mismatch) signals.push(mismatch);

  const receiver = String(m.receiver ?? '').toLowerCase();
  if (
    receiver &&
    receiver !== '0x0000000000000000000000000000000000000000' &&
    // GPv2 convention: `0x0` receiver means "send to swapper", so a non-zero
    // receiver is an explicit redirect the user should eyeball.
    true
  ) {
    signals.push({
      level: 'warn',
      code: 'COW_RECEIVER_REDIRECT',
      message: `Order proceeds are routed to ${String(m.receiver)} rather than the signer.`,
      field: 'receiver',
    });
  }

  return {
    title: 'CoW Protocol Order',
    summary: `CoW ${String(m.kind ?? '')} order ${String(m.sellAmount ?? '')} ${String(m.sellToken ?? '')} → ${String(m.buyToken ?? '')}.`,
    rows,
    signals,
  };
}
