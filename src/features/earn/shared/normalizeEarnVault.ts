// Single swap-point for mapping an EarnVault to a family-scoped ChainKey.
// When LI.FI adds SVM pools, map them here to `svm:${cluster}` — nowhere
// else in the codebase.
import type { EarnVault } from "../../../components/integrations/lifi-earn/types";
import { toEvmChainKey } from "../../../chains/types/evm";

export function normalizeEarnVault(raw: EarnVault): EarnVault {
  if (raw.chainKey) return raw;
  return { ...raw, chainKey: toEvmChainKey(raw.chainId) };
}

export function normalizeEarnVaults(raw: readonly EarnVault[]): EarnVault[] {
  return raw.map(normalizeEarnVault);
}
