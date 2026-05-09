import { getChainById, getExplorerUrl } from "../../../../chains/registry";
import type { EvmChainDescriptor } from "../../../../chains/types";
import type { Hex } from "../../../../chains/types/evm";

/** Resolve an explorer URL for a confirmed tx. Returns null when the chain
 *  has no explorer configured. */
export function evmExplorerTxUrl(
  chain: EvmChainDescriptor,
  txId: Hex,
): string | null {
  const chainId = chain.chainId as number;
  const legacy = getChainById(chainId);
  if (!legacy?.explorerUrl) return null;
  return getExplorerUrl(chainId, "tx", txId);
}
