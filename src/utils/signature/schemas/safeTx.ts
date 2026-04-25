import type { RenderContext, RenderRow, RiskSignal, SchemaRender, TypedDataPayload } from '../types';
import { MULTISEND_CALL_ONLY_141 } from '../canonicalAddresses';
import {
  addressRow,
  amountRow,
  bytesRow,
  isZeroAddress,
  textRow,
  toBigInt,
} from './shared';

const OPERATION_LABEL: Record<number, string> = {
  0: 'CALL',
  1: 'DELEGATECALL',
};

const MULTISEND_SELECTOR = '0x8d80ff0a';

export function renderSafeTx(
  payload: TypedDataPayload,
  _ctx: RenderContext,
): SchemaRender {
  const m = payload.message as Record<string, unknown>;
  const operationBi = toBigInt(m.operation);
  const operation = operationBi !== null ? Number(operationBi) : -1;
  const data = String(m.data ?? '0x');
  const to = String(m.to ?? '');
  const gasToken = String(m.gasToken ?? '');
  const refundReceiver = String(m.refundReceiver ?? '');

  const rows: RenderRow[] = [
    addressRow('to', to),
    amountRow('value', m.value),
    bytesRow('data', data),
    textRow('operation', OPERATION_LABEL[operation] ?? `unknown(${m.operation})`),
    amountRow('safeTxGas', m.safeTxGas),
    amountRow('baseGas', m.baseGas),
    amountRow('gasPrice', m.gasPrice),
    addressRow('gasToken', gasToken),
    addressRow('refundReceiver', refundReceiver),
    amountRow('nonce', m.nonce),
  ];

  const signals: RiskSignal[] = [];

  if (operation === 1) {
    signals.push({
      level: 'danger',
      code: 'SAFE_DELEGATECALL',
      message:
        'DELEGATECALL replaces the Safe bytecode context at the target. Verify the target carefully.',
      field: 'operation',
    });
  }

  if (!isZeroAddress(gasToken) || !isZeroAddress(refundReceiver)) {
    signals.push({
      level: 'warn',
      code: 'SAFE_REFUND_REDIRECT',
      message:
        'gasToken or refundReceiver is non-zero — gas refunds will be redirected.',
      field: 'refundReceiver',
    });
  }

  const isMultisendBatch =
    to.toLowerCase() === MULTISEND_CALL_ONLY_141.toLowerCase() &&
    data.startsWith(MULTISEND_SELECTOR);
  if (isMultisendBatch) {
    signals.push({
      level: 'ok',
      code: 'SAFE_MULTISEND_DETECTED',
      message:
        'Target is MultiSendCallOnly with multiSend() selector — decode inner calls separately for full verification.',
      field: 'data',
    });
  }

  return {
    title: 'Gnosis Safe SafeTx',
    summary: `Safe transaction to ${to} (${OPERATION_LABEL[operation] ?? 'unknown op'}) with nonce ${String(m.nonce ?? '')}.`,
    rows,
    signals,
  };
}
