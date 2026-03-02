/**
 * Blockscout Source
 *
 * Fetches verified contracts from Blockscout explorers.
 *
 * Strategy:
 * 1. Try V2 API first (returns ABI + name in one request)
 * 2. Fall back to V1 API
 */

import type { Chain } from '../../../types';
import type { SourceResult, AbiItem, ContractMetadata, ProxyInfo, ProxyType } from '../types';

// Chain-specific Blockscout instances
const BLOCKSCOUT_APIS: Record<number, string[]> = {
  1: ['https://eth.blockscout.com/api'],
  8453: ['https://base.blockscout.com/api'],
  84532: ['https://base-sepolia.blockscout.com/api'],
  137: ['https://polygon.blockscout.com/api'],
  42161: ['https://arbitrum.blockscout.com/api'],
  10: ['https://optimism.blockscout.com/api'],
  4202: ['https://sepolia-blockscout.lisk.com/api'],
};

// CORS proxies
const CHAIN_PROXIES: Record<number, string> = {
  1: '/api/eth-blockscout',   // Ethereum mainnet
  137: '/api/polygon-blockscout',
  42161: '/api/arbitrum-blockscout',
  84532: '/api/base-sepolia-blockscout',
  4202: '/api/lisk-sepolia-blockscout',
  8453: '/api/blockscout', // Base mainnet uses default blockscout proxy
};

const getProxy = (chainId: number): string => CHAIN_PROXIES[chainId] || '/api/blockscout';

const extractContractName = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  const candidates = [
    obj.name,
    obj.contractName,
    obj.ContractName,
    obj.contract_name,
    (obj.result as Record<string, unknown>)?.name,
    (obj.result as Record<string, unknown>)?.contractName,
    ((obj.result as Record<string, unknown>)?.contract as Record<string, unknown>)?.name,
    (obj.smart_contract as Record<string, unknown>)?.name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim();
      if (
        normalized.length > 0 &&
        !/^smart contract$/i.test(normalized) &&
        !/^contract$/i.test(normalized)
      ) {
        return normalized;
      }
    }
  }

  return null;
};

const extractAbi = (data: unknown): AbiItem[] | null => {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // V2 API locations
  const abiCandidates = [
    obj.abi,
    (obj.result as Record<string, unknown>)?.abi,
    ((obj.result as Record<string, unknown>)?.contract as Record<string, unknown>)?.abi,
  ];

  for (const candidate of abiCandidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate as AbiItem[];
    }
    if (typeof candidate === 'string' && candidate !== 'Contract source code not verified') {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as AbiItem[];
        }
      } catch {
        // Not valid JSON, continue
      }
    }
  }

  return null;
};

const extractMetadata = (data: unknown): ContractMetadata => {
  if (!data || typeof data !== 'object') return {};

  const obj = data as Record<string, unknown>;
  const contract = obj.result || obj;

  return {
    compilerVersion: (contract as Record<string, unknown>).compiler_version as string | undefined,
    optimization: (contract as Record<string, unknown>).optimization as boolean | undefined,
    optimizationRuns: (contract as Record<string, unknown>).optimization_runs as number | undefined,
    evmVersion: (contract as Record<string, unknown>).evm_version as string | undefined,
    license: (contract as Record<string, unknown>).license_type as string | undefined,
  };
};

// Map Blockscout proxy_type to our ProxyType
const mapBlockscoutProxyType = (blockscoutType: string): ProxyType => {
  const mapping: Record<string, ProxyType> = {
    'eip2535': 'diamond',
    'eip1967': 'eip1967',
    'eip1167': 'eip1167',
    'eip1822': 'eip1822',
    'gnosis_safe': 'gnosis-safe',
    'master_copy': 'gnosis-safe',
    'basic_implementation': 'eip1967',
    'basic_get_implementation': 'eip1967',
  };
  return mapping[blockscoutType.toLowerCase()] || 'unknown';
};

interface BlockscoutImplementation {
  address_hash?: string;
  address?: { hash?: string };
  name?: string;
}

const extractProxyInfo = (data: unknown): ProxyInfo | undefined => {
  if (!data || typeof data !== 'object') return undefined;

  const obj = data as Record<string, unknown>;
  const proxyType = obj.proxy_type as string | undefined;

  if (!proxyType) return undefined;

  const implementations = obj.implementations as BlockscoutImplementation[] | undefined;
  const implAddresses: string[] = [];

  if (implementations && Array.isArray(implementations)) {
    for (const impl of implementations) {
      const addr = impl.address_hash || impl.address?.hash;
      if (addr) implAddresses.push(addr);
    }
  }

  return {
    isProxy: true,
    proxyType: mapBlockscoutProxyType(proxyType),
    implementationAddress: implAddresses[0],
    implementations: implAddresses.length > 0 ? implAddresses : undefined,
  };
};

export async function fetchBlockscout(
  address: string,
  chain: Chain,
  apiKey: string | undefined,
  signal?: AbortSignal
): Promise<SourceResult> {
  const normalizedAddress = address.toLowerCase();
  const chainId = chain.id;

  const bases: string[] = [getProxy(chainId)];

  const fallbacks = BLOCKSCOUT_APIS[chainId] || [];
  bases.push(...fallbacks);

  const blockscoutExplorer = chain.explorers?.find((e) => e.type === 'blockscout');
  if (blockscoutExplorer?.url) {
    bases.push(blockscoutExplorer.url);
  }

  const uniqueBases = [...new Set(bases)];

  let lastError = 'No Blockscout API available';

  for (const base of uniqueBases) {
    if (signal?.aborted) {
      return { success: false, error: 'Aborted' };
    }

    const v2Url = `${base.replace(/\/$/, '')}/v2/smart-contracts/${normalizedAddress}`;

    try {
      const response = await fetch(v2Url, {
        signal,
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        const abi = extractAbi(data);

        if (abi) {
          return {
            success: true,
            abi,
            name: extractContractName(data) ?? undefined,
            confidence: 'verified',
            source: 'blockscout',
            metadata: extractMetadata(data),
            proxyInfo: extractProxyInfo(data),
          };
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Aborted' };
      }
      lastError = error instanceof Error ? error.message : String(error);
    }

    const v1Url = `${base.replace(/\/$/, '')}?module=contract&action=getsourcecode&address=${normalizedAddress}`;

    try {
      const response = await fetch(v1Url, {
        signal,
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();

        if (data?.status === '1' && Array.isArray(data?.result) && data.result.length > 0) {
          const contract = data.result[0];
          const abiString = contract?.ABI || contract?.abi;

          if (abiString && abiString !== 'Contract source code not verified') {
            try {
              const abi = JSON.parse(abiString);
              if (Array.isArray(abi)) {
                return {
                  success: true,
                  abi,
                  name: contract.ContractName || contract.contractName || null,
                  confidence: 'verified',
                  source: 'blockscout',
                  metadata: {
                    compilerVersion: contract.CompilerVersion,
                    optimization: contract.OptimizationUsed === '1',
                    optimizationRuns: contract.Runs ? parseInt(contract.Runs, 10) : undefined,
                  },
                };
              }
            } catch {
              lastError = 'Invalid ABI format from Blockscout';
            }
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Aborted' };
      }
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    success: false,
    error: `Contract not verified on Blockscout: ${lastError}`,
  };
}
