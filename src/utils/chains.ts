/**
 * Compatibility re-export from the canonical chain registry.
 *
 * All chain data now lives in src/chains/registry.ts.
 * This file preserves the import path that 27+ consumer files rely on.
 */

export {
  CHAIN_REGISTRY,
  SUPPORTED_CHAINS,
  getChainById,
  isTestnet,
  getMainnetChains,
  getTestnetChains,
  getExplorerChains,
  getExplorerBaseUrlFromApiUrl,
  getExplorerUrl,
  PUBLIC_RPC_MAP,
} from "../chains/registry";
