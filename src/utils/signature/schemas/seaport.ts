import type { RenderContext, RenderRow, RiskSignal, SchemaRender, TypedDataPayload } from '../types';
import { SEAPORT_16 } from '../canonicalAddresses';
import {
  addressRow,
  amountRow,
  bytesRow,
  isZeroAddress,
  textRow,
  timestampRow,
  toBigInt,
  verifyingContractMismatchSignal,
} from './shared';

const ITEM_TYPE_LABEL: Record<number, string> = {
  0: 'NATIVE',
  1: 'ERC20',
  2: 'ERC721',
  3: 'ERC1155',
  4: 'ERC721_WITH_CRITERIA',
  5: 'ERC1155_WITH_CRITERIA',
};

const ORDER_TYPE_LABEL: Record<number, string> = {
  0: 'FULL_OPEN',
  1: 'PARTIAL_OPEN',
  2: 'FULL_RESTRICTED',
  3: 'PARTIAL_RESTRICTED',
  4: 'CONTRACT',
};

type SeaportItem = {
  itemType?: unknown;
  token?: unknown;
  identifierOrCriteria?: unknown;
  startAmount?: unknown;
  endAmount?: unknown;
  recipient?: unknown;
};

function labelForItem(prefix: string, item: SeaportItem): RenderRow {
  const typeNum = Number(toBigInt(item.itemType) ?? -1);
  const label = ITEM_TYPE_LABEL[typeNum] ?? `unknown(${String(item.itemType)})`;
  return textRow(
    prefix,
    `${label} token=${String(item.token ?? '')} id=${String(item.identifierOrCriteria ?? '')} start=${String(item.startAmount ?? '')} end=${String(item.endAmount ?? '')}${item.recipient !== undefined ? ` → ${String(item.recipient)}` : ''}`,
  );
}

export function renderSeaport(
  payload: TypedDataPayload,
  _ctx: RenderContext,
): SchemaRender {
  const m = payload.message as {
    offerer?: unknown;
    zone?: unknown;
    orderType?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    offer?: SeaportItem[];
    consideration?: SeaportItem[];
    zoneHash?: unknown;
    salt?: unknown;
    conduitKey?: unknown;
    counter?: unknown;
  };

  const orderTypeNum = Number(toBigInt(m.orderType) ?? -1);
  const offer = Array.isArray(m.offer) ? m.offer : [];
  const consideration = Array.isArray(m.consideration) ? m.consideration : [];

  const rows: RenderRow[] = [
    addressRow('offerer', m.offerer),
    addressRow('zone', m.zone),
    textRow(
      'orderType',
      ORDER_TYPE_LABEL[orderTypeNum] ?? `unknown(${String(m.orderType)})`,
    ),
    timestampRow('startTime', m.startTime),
    timestampRow('endTime', m.endTime),
  ];
  offer.forEach((item, i) => rows.push(labelForItem(`offer[${i}]`, item)));
  consideration.forEach((item, i) =>
    rows.push(labelForItem(`consideration[${i}]`, item)),
  );
  rows.push(bytesRow('zoneHash', m.zoneHash));
  rows.push(amountRow('salt', m.salt));
  rows.push(bytesRow('conduitKey', m.conduitKey));
  rows.push(amountRow('counter', m.counter));

  const signals: RiskSignal[] = [];
  const mismatch = verifyingContractMismatchSignal(
    SEAPORT_16,
    payload.domain?.verifyingContract,
  );
  if (mismatch) signals.push(mismatch);

  for (const [i, item] of consideration.entries()) {
    if (isZeroAddress(item.recipient)) {
      signals.push({
        level: 'danger',
        code: 'SEAPORT_ZERO_ADDRESS_RECIPIENT',
        message: `consideration[${i}].recipient is the zero address — funds would be burned.`,
        field: `consideration[${i}].recipient`,
      });
    }
  }

  // Offer vs. consideration heuristic: NFT offer + lower-value consideration.
  const offerHasNft = offer.some((item) => {
    const t = Number(toBigInt(item.itemType) ?? -1);
    return t === 2 || t === 3 || t === 4 || t === 5;
  });
  if (offerHasNft) {
    let considerationTotal = 0n;
    for (const c of consideration) {
      const s = toBigInt(c.startAmount);
      if (s !== null) considerationTotal += s;
    }
    if (considerationTotal === 0n) {
      signals.push({
        level: 'warn',
        code: 'SEAPORT_UNDERPRICED',
        message:
          'NFT offer with zero-value consideration — static heuristic, double-check before signing.',
      });
    }
  }

  return {
    title: 'Seaport OrderComponents',
    summary: `Seaport order from ${String(m.offerer ?? '')} — ${offer.length} offer item${offer.length === 1 ? '' : 's'}, ${consideration.length} consideration item${consideration.length === 1 ? '' : 's'}.`,
    rows,
    signals,
  };
}
