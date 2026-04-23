/**
 * Response Parsing Utilities
 *
 * Handles normalization and parsing of the bridge simulation response:
 * - buildContractsFromTrace: extracts contract metadata from raw trace
 * - prewarmCacheFromTrace: populates the contract cache from trace artifacts
 * - normalizeBridgeResult: converts raw bridge response to SimulationResult
 */

import type { SimulationResult, SimulationContract } from '../../types/transaction';
import { getChainById } from '../chains';
import { contractCache } from '../resolver/ContractCache';
import type { ResolveResult, ContractMetadata } from '../resolver/types';
import type { BridgeSimulationResponsePayload } from './types';
import { decodeRevertData } from './revertHandling';
import { lookupErrorSignatures } from '../signatureDatabase';

// Selector → resolved error name (or null when lookup returned nothing).
// Persists for the tab lifetime so repeat sims don't hit OpenChain again.
const errorSelectorNameCache = new Map<string, string | null>();

// Maximum time to wait for an OpenChain selector lookup before failing open.
const SELECTOR_LOOKUP_TIMEOUT_MS = 3000;

// Sentinel used to distinguish a timeout result from a genuine null result.
const TIMEOUT_SENTINEL = Symbol('timeout');

async function resolveErrorSelectorName(selector: string): Promise<string | null> {
  const normalized = selector.toLowerCase();
  if (errorSelectorNameCache.has(normalized)) {
    return errorSelectorNameCache.get(normalized) ?? null;
  }
  try {
    const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) =>
      setTimeout(() => resolve(TIMEOUT_SENTINEL), SELECTOR_LOOKUP_TIMEOUT_MS),
    );
    const lookupPromise = lookupErrorSignatures([normalized]).then((response) => {
      const match = response?.result?.function?.[normalized]?.find(
        (entry) => typeof entry?.name === 'string' && entry.name.trim().length > 0,
      );
      return match?.name?.trim() ?? null;
    });
    const result = await Promise.race([lookupPromise, timeoutPromise]);
    if (result === TIMEOUT_SENTINEL) {
      // Timed out — fail open without caching so the next call can retry.
      return null;
    }
    // Definitive result (name found or API returned nothing): safe to cache.
    errorSelectorNameCache.set(normalized, result);
    return result;
  } catch {
    // Network / API error — fail open without caching so transient failures
    // can be retried on the next simulation.
    return null;
  }
}

export const buildContractsFromTrace = (rawTrace: any): SimulationContract[] => {
  if (!rawTrace) return [];

  const opcodeLines = rawTrace.opcodeLines || {};
  const opcodeLinesAddresses = new Set<string>(
    Object.keys(opcodeLines)
      .filter(k => !k.endsWith('_filtered'))
      .map(k => k.toLowerCase())
  );
  const artifacts = rawTrace.artifacts || {};

  // A contract is verified if it has opcodeLines (source-mapped trace data)
  // OR if it has an artifact with metadata/sourceProvider (verified source from explorer)
  const isVerified = (addr: string): boolean => {
    const addrLower = addr.toLowerCase();
    if (opcodeLinesAddresses.has(addrLower)) return true;
    const artifact = artifacts[addr] || artifacts[addrLower];
    if (!artifact) return false;
    if (artifact.sourceProvider) return true;
    if (artifact.meta) return true;
    if (artifact.sources && typeof artifact.sources === 'object' && Object.keys(artifact.sources).length > 0) return true;
    if (artifact.input?.sources && typeof artifact.input.sources === 'object' && Object.keys(artifact.input.sources).length > 0) return true;
    return false;
  };

  const traceEntries = rawTrace.inner?.inner
    ? rawTrace.inner.inner
    : rawTrace.inner && typeof rawTrace.inner === 'object'
      ? (Array.isArray(rawTrace.inner) ? rawTrace.inner : Object.values(rawTrace.inner))
      : [];

  const contractsMap = new Map<string, SimulationContract>();

  const getContractName = (addr: string): string | undefined => {
    const artifact = artifacts[addr] || artifacts[addr.toLowerCase()];
    if (!artifact?.meta) return undefined;
    return artifact.meta.Name || artifact.meta.ContractName || undefined;
  };

  const getSourceProvider = (addr: string): 'sourcify' | 'etherscan' | 'blockscout' | null => {
    const artifact = artifacts[addr] || artifacts[addr.toLowerCase()];
    // Check direct sourceProvider field first (most reliable — set during artifact fetching)
    if (artifact?.sourceProvider &&
        (artifact.sourceProvider === 'sourcify' || artifact.sourceProvider === 'etherscan' || artifact.sourceProvider === 'blockscout')) {
      return artifact.sourceProvider;
    }
    if (!artifact?.meta) {
      if (opcodeLinesAddresses.has(addr.toLowerCase())) {
        return 'sourcify';
      }
      return null;
    }
    // Infer from meta field naming conventions
    if (artifact.meta.CompilerVersion || artifact.meta.SwarmSource !== undefined) {
      return 'etherscan';
    }
    if (artifact.meta.compiler_version) {
      return 'blockscout';
    }
    return 'sourcify';
  };

  const getFileCount = (addr: string): number => {
    const addrLower = addr.toLowerCase();
    const artifact = artifacts[addr] || artifacts[addrLower];

    const inputSources = artifact?.input?.sources;
    if (inputSources && typeof inputSources === 'object') {
      const fileCount = Object.keys(inputSources).length;
      if (fileCount > 0) return fileCount;
    }

    const directSources = artifact?.sources;
    if (directSources && typeof directSources === 'object') {
      const fileCount = Object.keys(directSources).length;
      if (fileCount > 0) return fileCount;
    }

    const outputContracts = artifact?.output?.contracts;
    if (outputContracts && typeof outputContracts === 'object') {
      const fileCount = Object.keys(outputContracts).length;
      if (fileCount > 0) return fileCount;
    }

    const addrData = opcodeLines[addr] || opcodeLines[addrLower];
    if (!addrData || typeof addrData !== 'object' || Array.isArray(addrData)) return 0;
    return Object.keys(addrData).filter((k) =>
      k.endsWith('.sol') || k.endsWith('.vy') || k.includes('/')
    ).length;
  };

  for (const entry of traceEntries) {
    if (!entry) continue;

    const codeAddress = entry.code_address || entry.codeAddress;
    if (codeAddress && codeAddress.length === 42) {
      const addr = codeAddress.toLowerCase();
      if (!contractsMap.has(addr)) {
        const name = entry.target_label || getContractName(codeAddress);
        const verified = isVerified(codeAddress);
        contractsMap.set(addr, {
          address: codeAddress,
          name: name || undefined,
          verified,
          sourceProvider: verified ? getSourceProvider(codeAddress) : null,
          fileCount: verified ? getFileCount(codeAddress) : 0,
        });
      }
    }

    const target = entry.target;
    if (target && target.length === 42) {
      const addr = target.toLowerCase();
      if (!contractsMap.has(addr)) {
        const name = entry.target_label || getContractName(target);
        const verified = isVerified(target);
        contractsMap.set(addr, {
          address: target,
          name: name || undefined,
          verified,
          sourceProvider: verified ? getSourceProvider(target) : null,
          fileCount: verified ? getFileCount(target) : 0,
        });
      }
    }
  }

  return Array.from(contractsMap.values()).sort((a, b) => {
    if (a.verified && !b.verified) return -1;
    if (!a.verified && b.verified) return 1;
    if (a.name && !b.name) return -1;
    if (!a.name && b.name) return 1;
    return 0;
  });
};

export const prewarmCacheFromTrace = (rawTrace: any, chainId: number | null): void => {
  if (!rawTrace || !chainId) return;

  const artifacts = rawTrace.artifacts || {};
  const opcodeLines = rawTrace.opcodeLines || {};
  const chain = getChainById(chainId);
  if (!chain) return;

  for (const [addr, artifact] of Object.entries<any>(artifacts)) {
    if (!artifact?.meta) continue;

    const address = addr.toLowerCase();
    const hasOpcodeLines = opcodeLines[addr] || opcodeLines[address];
    if (!hasOpcodeLines) continue;

    const sourcesRaw = artifact.sources || artifact.input?.sources || {};
    const sources: Record<string, string> = {};
    for (const [path, val] of Object.entries<any>(sourcesRaw)) {
      if (typeof val === 'string') {
        sources[path] = val;
      } else if (val?.content) {
        sources[path] = val.content;
      }
    }
    if (Object.keys(sources).length === 0) continue;

    const compilationTarget = artifact.input?.settings?.compilationTarget || artifact.meta?.compilationTarget || {};
    const mainSourcePath = Object.keys(compilationTarget)[0] || undefined;

    let abi = null;
    try {
      if (artifact.meta.ABI) {
        abi = typeof artifact.meta.ABI === 'string' ? JSON.parse(artifact.meta.ABI) : artifact.meta.ABI;
      }
    } catch { /* ignore parse errors */ }

    let source: 'sourcify' | 'etherscan' | 'blockscout' = 'sourcify';
    if (artifact.meta.CompilerVersion || artifact.meta.SwarmSource !== undefined) {
      source = 'etherscan';
    } else if (artifact.meta.compiler_version) {
      source = 'blockscout';
    }

    const metadata: ContractMetadata = {
      compilerVersion: artifact.meta.CompilerVersion || artifact.meta.compiler_version || undefined,
      optimization: artifact.meta.OptimizationUsed === '1' || artifact.input?.settings?.optimizer?.enabled,
      optimizationRuns: parseInt(artifact.meta.Runs || artifact.input?.settings?.optimizer?.runs || '200', 10),
      evmVersion: artifact.meta.EVMVersion || artifact.input?.settings?.evmVersion || undefined,
      sources,
      mainSourcePath,
    };

    const resolveResult: ResolveResult = {
      address,
      chainId,
      chain,
      abi,
      name: artifact.meta.Name || artifact.meta.ContractName || null,
      source,
      confidence: 'verified',
      verified: true,
      functions: { read: [], write: [] },
      metadata,
      resolvedAt: Date.now(),
      durationMs: 0,
      attempts: [{ source, status: 'success', durationMs: 0, confidence: 'verified' }],
      fromCache: false,
    };

    contractCache.set(address, chainId, resolveResult);
  }
};

export const normalizeBridgeResult = async (
  payload: BridgeSimulationResponsePayload,
  transactionMetadata?: {
    from?: string;
    to?: string;
    data?: string;
    value?: string;
    blockNumber?: string | number | null;
    nonce?: number | null;
    functionName?: string | null;
    timestamp?: number | null;
    gasPrice?: string | null;
    maxFeePerGas?: string | null;
    maxPriorityFeePerGas?: string | null;
    baseFeePerGas?: string | null;
    effectiveGasPrice?: string | null;
    type?: number | null;
  }
): Promise<SimulationResult> => {
  const rawTrace =
    (payload as any).rawTrace ??
    (payload as any).raw_trace ??
    (payload as any).trace ??
    null;
  const rawTraceEntries = rawTrace?.inner?.inner
    ? rawTrace.inner.inner
    : rawTrace?.inner && typeof rawTrace.inner === 'object'
      ? (Array.isArray(rawTrace.inner) ? rawTrace.inner : Object.values(rawTrace.inner))
      : [];
  const rootCall = rawTraceEntries[0];
  const totalGasFromTrace = rawTrace?.inner?.total_gas_used ?? rawTrace?.total_gas_used;
  const gasUsed =
    payload.gasUsed ??
    (payload as any).gas_used ??
    (totalGasFromTrace !== null && totalGasFromTrace !== undefined ? String(totalGasFromTrace) : null) ??
    rootCall?.gas_used ??
    rootCall?.gasUsed ??
    rootCall?.result?.Success?.gas_used ??
    rootCall?.result?.Success?.gasUsed ??
    null;
  const gasLimitSuggested =
    payload.gasLimitSuggested ??
    (payload as any).gas_limit_suggested ??
    null;
  const rawRevertReason =
    payload.revertReason ??
    (payload as any).revert_reason ??
    null;

  let revertReason = rawRevertReason;
  if (rawRevertReason && typeof rawRevertReason === 'string' && rawRevertReason.startsWith('0x')) {
    const decoded = decodeRevertData(rawRevertReason);
    if (decoded.message) {
      revertReason = decoded.message;
    } else if (/^0x[a-f0-9]{8}/i.test(rawRevertReason)) {
      // Custom error fall-through: decodeRevertData only handles Error(string)
      // and Panic(uint256). Look the 4-byte selector up against the built-in
      // error table and OpenChain so "0x70f65caa" surfaces as "DeadlinePassed()".
      const selector = rawRevertReason.slice(0, 10).toLowerCase();
      const resolved = await resolveErrorSelectorName(selector);
      if (resolved) {
        revertReason = resolved;
      }
    }
  }
  const warnings =
    payload.warnings ??
    (payload as any).warnings ??
    [];
  const modeValue =
    payload.mode ??
    (payload as any).mode ??
    '';
  const successValue =
    typeof payload.success === 'boolean'
      ? payload.success
      : Boolean((payload as any).success);
  const errorValue =
    payload.error ??
    (payload as any).error ??
    null;

  const canonicalMode =
    modeValue === 'local' || modeValue === 'onchain'
      ? modeValue
      : 'rpc';

  const blockNumber =
    (payload as any).blockNumber ??
    (payload as any).block_number ??
    (payload as any).block ??
    transactionMetadata?.blockNumber ??
    null;

  const nonce =
    (payload as any).nonce ??
    transactionMetadata?.nonce ??
    null;

  const contracts = buildContractsFromTrace(rawTrace);
  prewarmCacheFromTrace(rawTrace, payload.chainId ?? null);

  return {
    mode: canonicalMode,
    success: successValue,
    error: errorValue,
    warnings,
    revertReason,
    gasUsed,
    gasLimitSuggested,
    rawTrace,
    from: transactionMetadata?.from ?? null,
    to: transactionMetadata?.to ?? null,
    data: transactionMetadata?.data ?? null,
    value: transactionMetadata?.value ?? null,
    blockNumber,
    nonce,
    functionName: transactionMetadata?.functionName ?? null,
    timestamp: transactionMetadata?.timestamp ?? null,
    gasPrice: transactionMetadata?.gasPrice ?? null,
    maxFeePerGas: transactionMetadata?.maxFeePerGas ?? null,
    maxPriorityFeePerGas: transactionMetadata?.maxPriorityFeePerGas ?? null,
    baseFeePerGas: transactionMetadata?.baseFeePerGas ?? null,
    effectiveGasPrice: transactionMetadata?.effectiveGasPrice ?? null,
    type: transactionMetadata?.type ?? null,
    debugSession: payload.debugSession ?? null,
    chainId: payload.chainId ?? null,
    debugLevel: (payload.debugLevel as any) ?? null,
    contracts,
    // ── V2 Trace Schema Fields (renderer-first path) ──
    traceSchemaVersion: (payload as any).traceSchemaVersion ?? null,
    traceLite: (payload as any).traceLite ?? null,
    traceMeta: (payload as any).traceMeta ?? null,
    traceQuality: (payload as any).traceQuality ?? null,
    traceDetailHandle: (payload as any).traceDetailHandle ?? null,
    // ── V3 Rendered Trace (Rust EDB engine decoded rows) ──
    renderedTrace: (payload as any).renderedTrace ?? null,
  };
};
