import type { RenderContext, RiskSignal, SchemaRender, TypedDataPayload } from '../types';
import {
  addressRow,
  amountRow,
  bytesRow,
  longDeadlineSignal,
  nowSeconds,
  timestampRow,
  toBigInt,
} from './shared';

export function renderErc7683(
  payload: TypedDataPayload,
  ctx: RenderContext,
): SchemaRender {
  const m = payload.message as Record<string, unknown>;
  const originChainIdBi = toBigInt(m.originChainId);
  const domainChainIdBi = toBigInt(payload.domain?.chainId);

  const rows = [
    addressRow('originSettler', m.originSettler),
    addressRow('user', m.user),
    amountRow('nonce', m.nonce),
    amountRow('originChainId', m.originChainId),
    timestampRow('openDeadline', m.openDeadline),
    timestampRow('fillDeadline', m.fillDeadline),
    bytesRow('orderDataType', m.orderDataType),
    bytesRow('orderData', m.orderData),
  ];

  const signals: RiskSignal[] = [];

  if (
    originChainIdBi !== null &&
    domainChainIdBi !== null &&
    originChainIdBi !== domainChainIdBi
  ) {
    signals.push({
      level: 'danger',
      code: 'ERC7683_ORIGIN_CHAIN_MISMATCH',
      message: `message.originChainId (${originChainIdBi}) does not match domain.chainId (${domainChainIdBi}).`,
      field: 'originChainId',
    });
  }

  const fillLong = longDeadlineSignal(
    toBigInt(m.fillDeadline),
    ctx.nowSec ?? nowSeconds(),
    'ERC7683_LONG_FILL_DEADLINE',
    'fillDeadline',
  );
  if (fillLong) signals.push(fillLong);

  return {
    title: 'ERC-7683 GaslessCrossChainOrder',
    summary: `Cross-chain order from ${String(m.user ?? '')} on origin chain ${String(m.originChainId ?? '')}.`,
    rows,
    signals,
  };
}
