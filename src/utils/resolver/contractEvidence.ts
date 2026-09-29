import type { Chain } from '../../types';
import type {
  SourcifyArtifact,
  SourcifyMetadataResult,
} from '../transaction-simulation/types';
import {
  buildArtifactsFromSourcify,
  clearArtifactCaches,
  fetchBlockscoutMetadata,
} from '../transaction-simulation/artifactFetching';
import { contractResolver } from './ContractResolver';
import {
  clearAllContextCache,
  clearContextCache,
} from './contractContext';
import { clearAllProxyCache, clearProxyCache } from './proxyResolver';
import type { CacheStats, ResolveOptions, ResolveResult } from './types';

interface ContractEvidenceScope {
  chain: Chain;
  root: string;
  related?: readonly string[];
  completeness?: 'fast' | 'complete';
  signal?: AbortSignal;
}

export type ContractInspectionRequest = ContractEvidenceScope;

export type SimulationEvidenceRequest = ContractEvidenceScope;

export interface ContractInspectionBundle {
  root: ResolveResult;
  related: ResolveResult[];
}

export interface SimulationEvidenceBundle {
  simulationArtifacts: SourcifyArtifact[];
  metadata: Record<string, unknown> | null;
  partialAddresses: string[];
}

interface ContractEvidenceDependencies {
  resolveContract(
    address: string,
    chain: Chain,
    options: ResolveOptions
  ): Promise<ResolveResult>;
  resolveSimulationArtifacts(
    address: string,
    chainId: number
  ): Promise<SourcifyMetadataResult>;
  clearResolverCache(address?: string, chainId?: number): Promise<void>;
  clearArtifactCache(): void;
  getResolverCacheStats(): Promise<CacheStats>;
}

export interface ContractEvidenceModule {
  inspect(request: ContractInspectionRequest): Promise<ContractInspectionBundle>;
  simulate(request: SimulationEvidenceRequest): Promise<SimulationEvidenceBundle>;
  clear(
    scope?:
      | { kind: 'all' }
      | { kind: 'resolution'; address?: string; chainId?: number }
      | { kind: 'artifacts' }
  ): Promise<void>;
  cacheStats(): Promise<CacheStats>;
}

function normalizedTargets(root: string, related: readonly string[]): string[] {
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const address of [root, ...related]) {
    const normalized = address.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
      throw new Error(`Invalid contract address: ${address}`);
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      targets.push(normalized);
    }
  }
  return targets;
}

function artifactFromResolvedEvidence(
  result: ResolveResult
): SourcifyArtifact | null {
  const sources = result.metadata?.sources;
  if (!sources || Object.keys(sources).length === 0) return null;

  const settings = result.metadata?.compilerSettings;
  return {
    contractName: result.name || 'Contract',
    compilerVersion: result.metadata?.compilerVersion || null,
    sources: Object.entries(sources).map(([path, content]) => ({
      path,
      content,
    })),
    abi: result.abi ? JSON.stringify(result.abi) : null,
    sourceProvider: result.source || undefined,
    address: result.address.toLowerCase(),
    settings,
    missingSettings: !settings,
  };
}

interface SimulationEvidence {
  artifact: SourcifyArtifact | null;
  metadata: Record<string, unknown> | null;
}

function primaryArtifact(
  evidence: SourcifyMetadataResult,
  address: string
): SourcifyArtifact | null {
  return evidence.artifacts?.find(
    (artifact) => artifact.address?.toLowerCase() === address.toLowerCase()
  ) ?? evidence.artifacts?.[0] ?? null;
}

function simulationBundle(
  addresses: string[],
  evidence: SimulationEvidence[]
): SimulationEvidenceBundle {
  const simulationArtifacts: SourcifyArtifact[] = [];
  const partialAddresses: string[] = [];

  evidence.forEach(({ artifact }, index) => {
    if (artifact) simulationArtifacts.push(artifact);
    if (!artifact || artifact.missingSettings) {
      partialAddresses.push(addresses[index]);
    }
  });

  return {
    simulationArtifacts,
    metadata: evidence[0]?.metadata ?? null,
    partialAddresses,
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export function createContractEvidence(
  dependencies: ContractEvidenceDependencies
): ContractEvidenceModule {
  const resolveContracts = async (request: ContractEvidenceScope) => {
    const targets = normalizedTargets(request.root, request.related ?? []);
    const results = await mapWithConcurrency(targets, 5, (address) =>
      dependencies.resolveContract(address, request.chain, {
        signal: request.signal,
        priority: request.completeness === 'complete' ? 'completeness' : 'speed',
      })
    );
    return { targets, results };
  };

  return {
    async inspect(request) {
      const { results } = await resolveContracts(request);
      return { root: results[0], related: results.slice(1) };
    },

    async simulate(request) {
      const targets = normalizedTargets(request.root, request.related ?? []);
      if (request.completeness !== 'complete') {
        const evidence = await mapWithConcurrency(targets, 5, async (address) => {
          const resolved = await dependencies.resolveSimulationArtifacts(
            address,
            request.chain.id
          );
          return {
            artifact: primaryArtifact(resolved, address),
            metadata: resolved.metadata,
          };
        });
        return simulationBundle(targets, evidence);
      }

      const { results } = await resolveContracts(request);
      const evidence = await mapWithConcurrency(
        results,
        5,
        async (result): Promise<SimulationEvidence> => {
          const resolvedArtifact = artifactFromResolvedEvidence(result);
          const resolvedMetadata =
            (result.metadata as Record<string, unknown> | undefined) ?? null;
          if (resolvedArtifact && !resolvedArtifact.missingSettings) {
            return {
              artifact: resolvedArtifact,
              metadata: resolvedMetadata,
            };
          }

          const enriched = await dependencies.resolveSimulationArtifacts(
            result.address,
            request.chain.id
          );
          return {
            artifact: primaryArtifact(enriched, result.address) ?? resolvedArtifact,
            metadata: enriched.metadata ?? resolvedMetadata,
          };
        }
      );
      return simulationBundle(targets, evidence);
    },

    async clear(scope = { kind: 'all' }) {
      if (scope.kind === 'all' || scope.kind === 'resolution') {
        await dependencies.clearResolverCache(
          scope.kind === 'resolution' ? scope.address : undefined,
          scope.kind === 'resolution' ? scope.chainId : undefined
        );
      }
      if (scope.kind === 'all' || scope.kind === 'artifacts') {
        dependencies.clearArtifactCache();
      }
    },

    cacheStats() {
      return dependencies.getResolverCacheStats();
    },
  };
}

export const contractEvidence = createContractEvidence({
  resolveContract: (address, chain, options) =>
    contractResolver.resolve(address, chain, options),
  resolveSimulationArtifacts: async (address, chainId) => {
    const sourcify = await buildArtifactsFromSourcify(address, chainId);
    if (sourcify.artifacts?.length) return sourcify;
    return fetchBlockscoutMetadata(address, chainId);
  },
  clearResolverCache: async (address, chainId) => {
    await contractResolver.clearCache(address, chainId);
    if (address && chainId) {
      clearContextCache(address, chainId);
      clearProxyCache(address, chainId);
    } else {
      clearAllContextCache();
      clearAllProxyCache();
    }
  },
  clearArtifactCache: clearArtifactCaches,
  getResolverCacheStats: () => contractResolver.getCacheStats(),
});
