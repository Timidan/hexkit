import type { RenderContext, RenderRow, RiskSignal, SchemaRender, TypedDataPayload } from '../types';
import { UNISWAPX_V2_DUTCH_REACTOR } from '../canonicalAddresses';
import {
  addressRow,
  amountRow,
  nowSeconds,
  textRow,
  timestampRow,
  toBigInt,
  verifyingContractMismatchSignal,
} from './shared';

type UniswapXInput = { token?: unknown; startAmount?: unknown; endAmount?: unknown };
type UniswapXOutput = UniswapXInput & { recipient?: unknown };

export function renderUniswapX(
  payload: TypedDataPayload,
  ctx: RenderContext,
): SchemaRender {
  // V1 orders use flat fields; V2 Dutch orders nest most of them under `info`,
  // with inputs/outputs as `baseInput` / `baseOutputs`. Accept either.
  const raw = payload.message as Record<string, unknown>;
  const info = (raw.info ?? raw) as Record<string, unknown>;
  const m = {
    reactor: info.reactor ?? raw.reactor,
    swapper: info.swapper ?? raw.swapper,
    nonce: info.nonce ?? raw.nonce,
    deadline: info.deadline ?? raw.deadline,
    input: (raw.baseInput ?? raw.input ?? {}) as UniswapXInput,
    outputs: (raw.baseOutputs ?? raw.outputs ?? []) as UniswapXOutput[],
    exclusiveFiller: raw.exclusiveFiller ?? info.exclusiveFiller,
    exclusivityEndTime: raw.exclusivityEndTime ?? info.exclusivityEndTime,
    decayStartTime: raw.decayStartTime ?? info.decayStartTime,
    decayEndTime: raw.decayEndTime ?? info.decayEndTime,
  };
  const input = m.input ?? {};
  const outputs = Array.isArray(m.outputs) ? m.outputs : [];

  const rows: RenderRow[] = [
    addressRow('reactor', m.reactor),
    addressRow('swapper', m.swapper),
    amountRow('nonce', m.nonce),
    timestampRow('deadline', m.deadline),
    textRow(
      'input',
      `${String(input.token ?? '')} start=${String(input.startAmount ?? '')} end=${String(input.endAmount ?? '')}`,
    ),
  ];
  outputs.forEach((o, i) =>
    rows.push(
      textRow(
        `outputs[${i}]`,
        `${String(o.token ?? '')} start=${String(o.startAmount ?? '')} end=${String(o.endAmount ?? '')} → ${String(o.recipient ?? '')}`,
      ),
    ),
  );
  rows.push(addressRow('exclusiveFiller', m.exclusiveFiller));
  rows.push(timestampRow('exclusivityEndTime', m.exclusivityEndTime));
  rows.push(timestampRow('decayStartTime', m.decayStartTime));
  rows.push(timestampRow('decayEndTime', m.decayEndTime));

  const signals: RiskSignal[] = [];
  // Only enforce the canonical V2 reactor for V2DutchOrder — other UniswapX
  // reactors (ExclusiveDutchOrder, future variants) live at different
  // addresses and we don't want false positives.
  if (payload.primaryType === 'V2DutchOrder') {
    const mismatch = verifyingContractMismatchSignal(
      UNISWAPX_V2_DUTCH_REACTOR,
      payload.domain?.verifyingContract,
    );
    if (mismatch) signals.push(mismatch);
  }

  const filler = String(m.exclusiveFiller ?? '');
  const endTimeBi = toBigInt(m.exclusivityEndTime);
  const nowSec = ctx.nowSec ?? nowSeconds();
  if (
    filler &&
    filler !== '0x0000000000000000000000000000000000000000' &&
    endTimeBi !== null &&
    Number(endTimeBi) > nowSec
  ) {
    signals.push({
      level: 'ok',
      code: 'UNISWAPX_EXCLUSIVITY',
      message: `Order is currently exclusive to filler ${filler} until epoch-seconds ${endTimeBi.toString()}.`,
    });
  }

  return {
    title: 'UniswapX Order',
    summary: `UniswapX swap from ${String(m.swapper ?? '')} with ${outputs.length} output${outputs.length === 1 ? '' : 's'}.`,
    rows,
    signals,
  };
}
