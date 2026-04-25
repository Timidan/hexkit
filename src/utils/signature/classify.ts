import type { ClassifiedPayload, TypedDataPayload } from './types';
import {
  COW_GPV2_SETTLEMENT,
  PERMIT2,
  SEAPORT_16,
  UNISWAPX_V2_DUTCH_REACTOR,
  isCanonical,
} from './canonicalAddresses';

function fieldSet(payload: TypedDataPayload, typeName: string): Set<string> {
  const fields = payload.types?.[typeName] ?? [];
  return new Set(fields.map((f) => f.name));
}

export function classify(payload: TypedDataPayload): ClassifiedPayload {
  const pt = payload.primaryType;
  const domain = payload.domain ?? {};

  try {
    if (pt === 'Permit') {
      const fs = fieldSet(payload, 'Permit');
      if (fs.has('allowed')) {
        return { kind: 'dai-permit', payload };
      }
      if (fs.has('value')) {
        return { kind: 'erc2612', payload };
      }
    }

    if (pt === 'PermitSingle') {
      return {
        kind: 'permit2-single',
        payload,
        canonicalVerifyingContract: PERMIT2,
      };
    }
    if (pt === 'PermitBatch') {
      return {
        kind: 'permit2-batch',
        payload,
        canonicalVerifyingContract: PERMIT2,
      };
    }
    if (pt === 'PermitTransferFrom') {
      return {
        kind: 'permit2-transfer-from',
        payload,
        canonicalVerifyingContract: PERMIT2,
      };
    }

    if (pt === 'SafeTx') {
      const fs = fieldSet(payload, 'SafeTx');
      if (fs.has('to') && fs.has('operation') && fs.has('safeTxGas')) {
        return { kind: 'safe-tx', payload };
      }
    }

    if (pt === 'OrderComponents') {
      return {
        kind: 'seaport',
        payload,
        canonicalVerifyingContract: SEAPORT_16,
      };
    }

    if (pt === 'V2DutchOrder') {
      return {
        kind: 'uniswapx',
        payload,
        canonicalVerifyingContract: UNISWAPX_V2_DUTCH_REACTOR,
      };
    }
    if (pt === 'ExclusiveDutchOrder') {
      // Different reactor address; leave canonical unset so the scorer doesn't
      // false-positive, and let the renderer do schema-level checks.
      return { kind: 'uniswapx', payload };
    }

    // CoW orders: classify by shape (sellToken/buyToken/receiver/kind/partiallyFillable)
    // so we still surface canonical-mismatch + receiver-redirect signals when a
    // fake settlement address is used.
    if (pt === 'Order') {
      const fs = fieldSet(payload, 'Order');
      const cowLooks =
        fs.has('sellToken') &&
        fs.has('buyToken') &&
        fs.has('receiver') &&
        fs.has('kind') &&
        fs.has('partiallyFillable');
      if (cowLooks || isCanonical(domain.verifyingContract ?? '', 'cow')) {
        return {
          kind: 'cow-order',
          payload,
          canonicalVerifyingContract: COW_GPV2_SETTLEMENT,
        };
      }
    }

    if (pt === 'GaslessCrossChainOrder') {
      return { kind: 'erc7683', payload };
    }
  } catch {
    // fall through
  }

  return { kind: 'unknown', payload };
}
