/**
 * Sourcify Source
 *
 * Fetches verified contracts from Sourcify's repository.
 *
 * Strategy:
 * 1. Try V2 API first via shared cache (faster, single request, deduped)
 * 2. Fall back to repository endpoints (full_match, then partial_match)
 *
 * Performance: Uses shared SourcifyCache for cross-module request
 * deduplication and in-memory caching. If fetchStorageLayout or
 * artifactFetching already fetched this contract, the cache hit is instant.
 */

import type { Chain } from '../../../types';
import type { SourceResult, AbiItem, ContractMetadata } from '../types';
import { fetchSourcifyV2Cached } from '../../cache/sourcifyCache';

const REPO_BASE = 'https://repo.sourcify.dev';

// CORS proxies for browser
const REPO_PROXY = '/api/sourcify/repository';

const isBrowser = typeof window !== 'undefined';

const getRepoBase = (): string => (isBrowser ? REPO_PROXY : REPO_BASE);

const extractContractName = (metadata: Record<string, unknown>): string | null => {
  const settings = metadata?.settings as Record<string, unknown> | undefined;
  const compilationTarget = settings?.compilationTarget as Record<string, string> | undefined;

  if (compilationTarget) {
    const targetKeys = Object.keys(compilationTarget);
    if (targetKeys.length > 0) {
      const name = compilationTarget[targetKeys[0]];
      if (name && name !== 'Smart Contract') return name;
    }
  }

  const name = metadata?.name as string | undefined;
  if (name && name !== 'Smart Contract') return name;

  return null;
};

const extractMetadata = (metadata: Record<string, unknown>): ContractMetadata => {
  const compiler = metadata?.compiler as Record<string, unknown> | undefined;
  const settings = metadata?.settings as Record<string, unknown> | undefined;
  const optimizer = settings?.optimizer as Record<string, unknown> | undefined;

  return {
    compiler: metadata?.language as string | undefined,
    compilerVersion: compiler?.version as string | undefined,
    optimization: optimizer?.enabled as boolean | undefined,
    optimizationRuns: optimizer?.runs as number | undefined,
    evmVersion: settings?.evmVersion as string | undefined,
  };
};

export async function fetchSourcify(
  address: string,
  chain: Chain,
  signal?: AbortSignal
): Promise<SourceResult> {
  const normalizedAddress = address.toLowerCase();
  const chainId = chain.id;

  try {
    const data = await fetchSourcifyV2Cached(
      chainId,
      normalizedAddress,
      ['abi', 'metadata', 'sources'],
      signal,
    );

    if (data) {

      const hasMatch =
        data.match ||
        data.creationMatch ||
        data.runtimeMatch ||
        (Array.isArray(data.abi) && data.abi.length > 0);

      if (hasMatch && Array.isArray(data.abi)) {
        let sourceCode: string | undefined;
        let mainSourcePath: string | undefined;
        const allSources: Record<string, string> = {};
        const contractName = extractContractName((data.metadata || {}) as Record<string, unknown>);

        if (data.sources && typeof data.sources === 'object') {
          const sourceFiles = Object.entries(data.sources as Record<string, unknown>);

          for (const [path, content] of sourceFiles) {
            const fileContent = typeof content === 'string'
              ? content
              : (content as { content?: string })?.content;
            if (fileContent) {
              allSources[path] = fileContent;
            }
          }

          if (sourceFiles.length > 0) {
            const mainFile = sourceFiles.find(([path]) =>
              contractName && path.toLowerCase().includes(contractName.toLowerCase())
            );
            if (mainFile) {
              mainSourcePath = mainFile[0];
              sourceCode = typeof mainFile[1] === 'string'
                ? mainFile[1]
                : (mainFile[1] as { content?: string })?.content;
            } else {
              const solFile = sourceFiles.find(([path]) => path.endsWith('.sol'));
              if (solFile) {
                mainSourcePath = solFile[0];
                sourceCode = typeof solFile[1] === 'string'
                  ? solFile[1]
                  : (solFile[1] as { content?: string })?.content;
              }
            }
          }
        }

        const metadata = extractMetadata((data.metadata || {}) as Record<string, unknown>);
        if (sourceCode) {
          metadata.sourceCode = sourceCode;
        }
        if (Object.keys(allSources).length > 0) {
          metadata.sources = allSources;
        }
        if (mainSourcePath) {
          metadata.mainSourcePath = mainSourcePath;
        }

        return {
          success: true,
          abi: data.abi as AbiItem[],
          name: contractName ?? undefined,
          confidence: 'verified',
          source: 'sourcify',
          metadata,
        };
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Aborted' };
    }
    // Continue to fallback
  }

  if (signal?.aborted) {
    return { success: false, error: 'Aborted' };
  }

  const repoPaths = [
    `/contracts/full_match/${chainId}/${normalizedAddress}/metadata.json`,
    `/contracts/partial_match/${chainId}/${normalizedAddress}/metadata.json`,
  ];

  const repoResults = await Promise.all(
    repoPaths.map(async (path) => {
      if (signal?.aborted) {
        return { aborted: true, result: null as SourceResult | null };
      }

      try {
        const repoUrl = `${getRepoBase()}${path}`;
        const response = await fetch(repoUrl, {
          signal,
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return { aborted: false, result: null as SourceResult | null };
        }

        const metadata = await response.json();
        const output = metadata?.output as Record<string, unknown> | undefined;
        const abi = output?.abi as AbiItem[] | undefined;

        if (!Array.isArray(abi) || abi.length === 0) {
          return { aborted: false, result: null as SourceResult | null };
        }

        return {
          aborted: false,
          result: {
            success: true,
            abi,
            name: extractContractName(metadata) ?? undefined,
            confidence: 'verified',
            source: 'sourcify',
            metadata: extractMetadata(metadata),
          } as SourceResult,
        };
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { aborted: true, result: null as SourceResult | null };
        }
        return { aborted: false, result: null as SourceResult | null };
      }
    })
  );

  if (repoResults.some((entry) => entry.aborted)) {
    return { success: false, error: 'Aborted' };
  }

  // Preserve preference order: full_match first, then partial_match.
  for (const entry of repoResults) {
    if (entry.result) {
      return entry.result;
    }
  }

  return {
    success: false,
    error: 'Contract not verified on Sourcify',
  };
}
