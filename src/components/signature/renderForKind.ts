import type {
  ClassifiedPayload,
  RenderContext,
  SchemaRender,
} from '../../utils/signature/types';
import { renderErc2612 } from '../../utils/signature/schemas/erc2612';
import { renderDaiPermit } from '../../utils/signature/schemas/daiPermit';
import {
  renderPermit2Batch,
  renderPermit2Single,
  renderPermit2TransferFrom,
} from '../../utils/signature/schemas/permit2';
import { renderSafeTx } from '../../utils/signature/schemas/safeTx';
import { renderSeaport } from '../../utils/signature/schemas/seaport';
import { renderUniswapX } from '../../utils/signature/schemas/uniswapx';
import { renderCowswap } from '../../utils/signature/schemas/cowswap';
import { renderErc7683 } from '../../utils/signature/schemas/erc7683';
import { renderUnknown } from '../../utils/signature/schemas/unknown';

export function renderForKind(
  c: ClassifiedPayload,
  ctx: RenderContext,
): SchemaRender {
  switch (c.kind) {
    case 'erc2612':
      return renderErc2612(c.payload, ctx);
    case 'dai-permit':
      return renderDaiPermit(c.payload, ctx);
    case 'permit2-single':
      return renderPermit2Single(c.payload, ctx);
    case 'permit2-batch':
      return renderPermit2Batch(c.payload, ctx);
    case 'permit2-transfer-from':
      return renderPermit2TransferFrom(c.payload, ctx);
    case 'safe-tx':
      return renderSafeTx(c.payload, ctx);
    case 'seaport':
      return renderSeaport(c.payload, ctx);
    case 'uniswapx':
      return renderUniswapX(c.payload, ctx);
    case 'cow-order':
      return renderCowswap(c.payload, ctx);
    case 'erc7683':
      return renderErc7683(c.payload, ctx);
    default:
      return renderUnknown(c.payload, ctx);
  }
}
