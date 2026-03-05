/**
 * Etherscan Source
 *
 * OPTIMIZATION: Uses `getsourcecode` instead of `getabi` + `getsourcecode`
 * This returns BOTH the ABI and contract name in a single request.
 *
 * Supports:
 * - Etherscan V2 API (aggregated, supports chainid parameter)
 * - Etherscan V1 API (fallback)
 * - Chain-specific proxies for CORS
 */

import type { Chain } from '../../../types';
import type { SourceResult, AbiItem, ContractMetadata, ProxyInfo } from '../types';

const V2_AGGREGATOR = 'https://api.etherscan.io/v2/api';

// Chain-specific CORS proxies
const CHAIN_PROXIES: Record<number, string> = {
  1: '/api/etherscan',
  8453: '/api/basescan',
  137: '/api/polygonscan',
  42161: '/api/arbiscan',
  10: '/api/etherscan', // Optimism shares Etherscan proxy
};

const getProxy = (chainId: number): string => CHAIN_PROXIES[chainId] || '/api/etherscan';

const detectMissingApiKey = (message?: string): boolean =>
  typeof message === 'string' && /missing\/invalid api key/i.test(message);

const isAbiVerified = (abi: string): boolean =>
  !!abi &&
  abi !== 'Contract source code not verified' &&
  abi !== 'Source code not verified' &&
  abi !== '[]';

const isValidAddress = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
};

export async function fetchEtherscan(
  address: string,
  chain: Chain,
  apiKey: string | undefined,
  signal?: AbortSignal
): Promise<SourceResult> {
  const etherscanExplorer = chain.explorers?.find((e) => e.type === 'etherscan');
  if (!etherscanExplorer) {
    return { success: false, error: 'No Etherscan API available for this network' };
  }

  const normalizedAddress = address.toLowerCase();

  const buildUrl = (baseUrl: string, useV2: boolean): string => {
    const resolvedBase =
      baseUrl.startsWith('/') && typeof window !== 'undefined'
        ? new URL(baseUrl, window.location.origin)
        : baseUrl.startsWith('/')
          ? new URL(`http://localhost${baseUrl}`)
          : new URL(baseUrl);
    const url = resolvedBase instanceof URL ? resolvedBase : new URL(resolvedBase);
    url.searchParams.set('module', 'contract');
    url.searchParams.set('action', 'getsourcecode');
    url.searchParams.set('address', normalizedAddress);
    if (apiKey) url.searchParams.set('apikey', apiKey);
    if (useV2) url.searchParams.set('chainid', String(chain.id));
    return url.toString();
  };

  const endpoints = [
    { url: buildUrl(V2_AGGREGATOR, true), isV2: true },
    { url: buildUrl(getProxy(chain.id), false), isV2: false },
  ];

  if (etherscanExplorer.url && !etherscanExplorer.url.includes('etherscan.io')) {
    endpoints.push({ url: buildUrl(etherscanExplorer.url, false), isV2: false });
  }

  let lastError = 'No endpoints available';
  let needsApiKey = false;

  for (const { url, isV2 } of endpoints) {
    if (signal?.aborted) {
      return { success: false, error: 'Aborted' };
    }

    try {
      const response = await fetch(url, {
        signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      const data = await response.json();

      if (detectMissingApiKey(data?.result) || detectMissingApiKey(data?.message)) {
        needsApiKey = true;
        lastError = 'Missing or invalid API key';
        break;
      }

      if (data?.status !== '1' || !Array.isArray(data?.result) || data.result.length === 0) {
        lastError = data?.result || data?.message || 'Unknown error';
        continue;
      }

      const contract = data.result[0];
      const abiString = contract?.ABI;

      if (!abiString || !isAbiVerified(abiString)) {
        lastError = 'ABI not available on Etherscan';
        continue;
      }

      let abi: AbiItem[];
      try {
        abi = JSON.parse(abiString);
        if (!Array.isArray(abi)) {
          lastError = 'Invalid ABI format';
          continue;
        }
      } catch {
        lastError = 'Failed to parse ABI';
        continue;
      }

      const name =
        contract.ContractName ||
        contract.contractName ||
        contract.Contract_Name ||
        null;

      let proxyInfo: ProxyInfo | undefined;
      const proxyFlag = String(
        contract.Proxy ?? contract.proxy ?? contract.isProxy ?? ''
      ).toLowerCase();
      if (proxyFlag === '1' || proxyFlag === 'true') {
        const impl =
          contract.Implementation ||
          contract.implementation ||
          contract.ImplementationAddress ||
          contract.implementationAddress;
        proxyInfo = {
          isProxy: true,
          proxyType: 'eip1967',
          implementationAddress: isValidAddress(impl) ? impl : undefined,
          implementations: isValidAddress(impl) ? [impl] : undefined,
        };
      }

      let sourceCode: string | undefined;
      if (contract.SourceCode) {
        const rawSource = contract.SourceCode;
        // Multi-file contracts use {{ (double braces) in Etherscan's response format
        if (rawSource.startsWith('{{') || rawSource.startsWith('{')) {
          try {
            // Try to parse as JSON (multi-file format)
            // Format: {"language":"Solidity","sources":{"Contract.sol":{"content":"..."}}}
            // Or wrapped: {{"language":"Solidity",...}}
            const jsonStr = rawSource.startsWith('{{')
              ? rawSource.slice(1, -1) // Remove outer braces
              : rawSource;
            const parsed = JSON.parse(jsonStr);

            // Extract main contract source from sources object
            if (parsed.sources && typeof parsed.sources === 'object') {
              const sourceFiles = Object.entries(parsed.sources);
              if (sourceFiles.length > 0) {
                // Find the main contract file (usually matches contract name)
                const mainFile = sourceFiles.find(([path]) =>
                  path.toLowerCase().includes((name || '').toLowerCase())
                );
                if (mainFile && (mainFile[1] as { content?: string })?.content) {
                  sourceCode = (mainFile[1] as { content: string }).content;
                } else {
                  // Fall back to first file
                  const firstSource = sourceFiles[0][1] as { content?: string };
                  sourceCode = firstSource?.content;
                }
              }
            } else if (parsed.content) {
              sourceCode = parsed.content;
            } else {
              // Unknown JSON shape (e.g., file map without "sources") - keep raw
              sourceCode = rawSource;
            }
          } catch {
            // Not valid JSON, use as-is
            sourceCode = rawSource;
          }
        } else {
          sourceCode = rawSource;
        }
      }

      const metadata: ContractMetadata = {
        compiler: 'Solidity',
        compilerVersion: contract.CompilerVersion || undefined,
        optimization: contract.OptimizationUsed === '1',
        optimizationRuns: contract.Runs ? parseInt(contract.Runs, 10) : undefined,
        evmVersion: contract.EVMVersion || undefined,
        license: contract.LicenseType || undefined,
        constructorArguments: contract.ConstructorArguments || undefined,
        sourceCode,
      };

      return {
        success: true,
        abi,
        name: name && name !== 'Smart Contract' ? name : null,
        confidence: 'verified',
        source: 'etherscan',
        metadata,
        proxyInfo,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { success: false, error: 'Aborted' };
        }
        lastError = error.message;
      } else {
        lastError = String(error);
      }
    }
  }

  return {
    success: false,
    error: needsApiKey
      ? 'Etherscan API requires a valid API key. Add one in settings and retry.'
      : `Could not retrieve ABI from Etherscan: ${lastError}`,
    needsApiKey,
  };
}
