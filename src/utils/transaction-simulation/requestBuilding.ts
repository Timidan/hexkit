/**
 * Request Building Utilities
 *
 * Helpers for constructing the bridge simulation request payload:
 * - Transaction field serialization (toQuantityString)
 * - Bridge transaction payload construction (buildBridgeTransactionPayload)
 * - Analysis options merging (mergeAnalysisOptions)
 * - Source priority normalization and inference
 */

import { ethers } from 'ethers';
import type { TransactionRequest } from '../../types/transaction';
import { networkConfigManager } from '../../config/networkConfig';
import type { AbiSourceType } from '../../config/networkConfig';

import type {
  BridgeAnalysisOptions,
  SerializableTransactionField,
  SourcifyArtifact,
} from './types';
import { ensureHexPrefix } from './revertHandling';

export const DEFAULT_ANALYSIS_OPTIONS: BridgeAnalysisOptions = {
  quickMode: true,
  collectCallTree: true,
  collectEvents: true,
  collectStorageDiffs: true,
  // Snapshots provide full VM state per opcode — required for the legacy
  // 3-phase FE decode to produce rich trace data (function args, internal
  // calls, source maps, events).  V2 lite enrichment is disabled until
  // Stage 2 (Rust EDB) produces fully-rich rows.
  collectSnapshots: true,
};

export const toQuantityString = (value: SerializableTransactionField): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (ethers.BigNumber.isBigNumber(value)) {
    return value.toHexString();
  }

  if (typeof value === 'number') {
    return ethers.BigNumber.from(value).toHexString();
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return trimmed;
  }

  if (/^-?\d+$/.test(trimmed)) {
    return trimmed;
  }

  return undefined;
};

export const buildBridgeTransactionPayload = (
  transaction: TransactionRequest,
  fromAddress: string
) => {
  const payload: Record<string, string> = {
    data: ensureHexPrefix(transaction.data),
  };

  if (fromAddress) {
    payload.from = fromAddress;
  }

  if (transaction.to) {
    payload.to = transaction.to;
  }

  const valueCandidate = toQuantityString(
    transaction.value as SerializableTransactionField
  );
  if (valueCandidate) {
    payload.value = valueCandidate;
  }

  const gasCandidate =
    toQuantityString((transaction as any)?.gas) ||
    toQuantityString(transaction.gasLimit as SerializableTransactionField);
  if (gasCandidate) {
    payload.gas = gasCandidate;
  }

  const gasPriceCandidate =
    toQuantityString(transaction.gasPrice as SerializableTransactionField) ||
    toQuantityString(transaction.maxFeePerGas as SerializableTransactionField) ||
    toQuantityString(
      transaction.maxPriorityFeePerGas as SerializableTransactionField
    );
  if (gasPriceCandidate) {
    payload.gasPrice = gasPriceCandidate;
  }

  return payload;
};

export const normalizeSourcePriority = (
  priority: Array<'sourcify' | 'etherscan' | 'blockscout'> | undefined
): AbiSourceType[] => {
  const defaultPriority = networkConfigManager.getSourcePriority();
  const source = Array.isArray(priority) && priority.length > 0 ? priority : defaultPriority;
  const seen = new Set<AbiSourceType>();
  const normalized: AbiSourceType[] = [];
  for (const entry of source) {
    if (entry === 'sourcify' || entry === 'etherscan' || entry === 'blockscout') {
      if (!seen.has(entry)) {
        seen.add(entry);
        normalized.push(entry);
      }
    }
  }
  return normalized.length > 0 ? normalized : defaultPriority;
};

export const inferArtifactSourcePriority = (
  artifacts: SourcifyArtifact[] | null
): AbiSourceType[] | undefined => {
  if (!artifacts || artifacts.length === 0) {
    return undefined;
  }

  const counts: Record<AbiSourceType, number> = {
    sourcify: 0,
    etherscan: 0,
    blockscout: 0,
  };
  for (const artifact of artifacts) {
    if (
      artifact.sourceProvider === 'sourcify' ||
      artifact.sourceProvider === 'etherscan' ||
      artifact.sourceProvider === 'blockscout'
    ) {
      counts[artifact.sourceProvider] += 1;
    }
  }

  const ranked = (Object.entries(counts) as Array<[AbiSourceType, number]>)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0)
    .map(([provider]) => provider);

  if (ranked.length === 0) {
    return undefined;
  }

  const configured = networkConfigManager.getSourcePriority();
  const merged = [...ranked, ...configured.filter((entry) => !ranked.includes(entry))];
  return normalizeSourcePriority(merged);
};

export const mergeAnalysisOptions = (
  overrides?: BridgeAnalysisOptions
): Record<string, unknown> => {
  const etherscanKey = networkConfigManager.getEtherscanApiKey();
  const artifactSourcePriority = normalizeSourcePriority(overrides?.artifactSourcePriority);
  return {
    ...DEFAULT_ANALYSIS_OPTIONS,
    ...(overrides ?? {}),
    ...(etherscanKey ? { etherscanApiKey: etherscanKey } : {}),
    artifactSourcePriority,
  };
};
