import axios from 'axios';
import type { Chain, ExplorerAPI } from '../../types';
import type { ContractInfoResult } from '../../types/contractInfo';
import { withRetry } from './common';

const BLOCKSCOUT_API_FALLBACKS: Record<number, string[]> = {
  8453: ['https://base.blockscout.com/api'],
  84532: ['https://base-sepolia.blockscout.com/api'],
  137: ['https://polygon.blockscout.com/api'],
  42161: ['https://arbitrum.blockscout.com/api'],
  4202: ['https://sepolia-blockscout.lisk.com/api'],
};

const extractContractName = (data: any): string | undefined => {
  const candidates = [
    data?.contractName,
    data?.name,
    data?.ContractName,
    data?.contract_name,
    data?.result?.contractName,
    data?.result?.ContractName,
    data?.result?.name,
    data?.result?.contract_name,
    data?.result?.contract?.name,
    data?.result?.contract?.contract_name,
    data?.result?.smart_contract?.name,
    data?.result?.smart_contract?.contract_name,
    data?.contract?.name,
    data?.contract?.contract_name,
    data?.smart_contract?.name,
    data?.smart_contract?.contract_name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim();
      if (
        normalized.length === 0 ||
        /^smart contract$/i.test(normalized) ||
        /^contract$/i.test(normalized)
      ) {
        continue;
      }
      return normalized;
    }
  }

  return undefined;
};

const normalizeBase = (base: string) => base.replace(/\/$/, '');

const buildStandardEndpoint = (base: string, address: string, apiKey?: string) => {
  const normalized = normalizeBase(base);
  const url = `${normalized}${normalized.endsWith('/api') ? '' : '/api'}?module=contract&action=getabi&address=${address}`;
  return apiKey ? `${url}&apikey=${encodeURIComponent(apiKey)}` : url;
};

const buildV2Endpoint = (base: string, address: string, apiKey?: string) => {
  const normalized = normalizeBase(base);
  const url = `${normalized}${normalized.endsWith('/api') ? '' : '/api'}/v2/smart-contracts/${address}`;
  return apiKey ? `${url}?token=${encodeURIComponent(apiKey)}` : url;
};

const fetchWithFallback = async (url: string) => {
  try {
    return await axios.get(url, {
      timeout: 15000,
    });
  } catch (error) {
    if ((error as any).response?.status === 404) {
      console.log(`🔍 [Blockscout] Endpoint ${url} returned 404 (expected for unverified contracts)`);
    } else {
      console.warn(`🔍 [Blockscout] Endpoint ${url} failed:`, (error as any).message);
    }
    return null;
  }
};

export const fetchFromBlockscout = async (
  address: string,
  chain: Chain,
  apiKey?: string
): Promise<Partial<ContractInfoResult>> => {
  const normalizedAddress = address?.toLowerCase();
  if (!normalizedAddress || !normalizedAddress.startsWith('0x') || normalizedAddress.length !== 42) {
    return {
      success: false,
      error: 'Invalid contract address format',
    };
  }

  try {
    const explorers: ExplorerAPI[] = [...(chain.explorers || [])];

    const fallbackApis = BLOCKSCOUT_API_FALLBACKS[chain.id] || [];
    fallbackApis.forEach((url) => {
      if (!explorers.some((e) => e.url === url)) {
        explorers.push({
          name: 'Blockscout',
          url,
          type: 'blockscout',
        });
      }
    });

    const blockscoutExplorer = explorers.find((e) => e.type === 'blockscout');
    if (!blockscoutExplorer) {
      return {
        success: false,
        error: 'No Blockscout API available for this network',
      };
    }

    const blockscoutProxy =
      chain.id === 137
        ? '/api/polygon-blockscout'
        : chain.id === 42161
        ? '/api/arbitrum-blockscout'
        : chain.id === 84532
        ? '/api/base-sepolia-blockscout'
        : chain.id === 4202
        ? '/api/lisk-sepolia-blockscout'
        : '/api/blockscout';

    const apiBases = new Set<string>([
      blockscoutProxy,
      blockscoutExplorer.url,
      ...fallbackApis,
    ]);

    const abiEndpoints: string[] = [];
    apiBases.forEach((base) => {
      abiEndpoints.push(buildStandardEndpoint(base, normalizedAddress, apiKey));
      abiEndpoints.push(buildV2Endpoint(base, normalizedAddress, apiKey));
    });

    let abiResult: { abi: string; contractName?: string } | null = null;

    for (const endpoint of abiEndpoints) {
      try {
        console.log(`🔍 [Blockscout] Trying ABI endpoint: ${endpoint}`);
        const response = await withRetry(() =>
          axios.get(endpoint, {
            timeout: 15000,
          })
        );

        if (response.data?.status === '1' && response.data.result) {
          const result = response.data.result;
          if (
            typeof result === 'string' &&
            result !== 'Contract source code not verified'
          ) {
            try {
              JSON.parse(result);
              abiResult = {
                abi: result,
                contractName: extractContractName(response.data),
              };
              break;
            } catch {
              console.warn('🔍 [Blockscout] Invalid ABI payload from v1 endpoint');
            }
          }
        }

        const v2Abi =
          response.data?.abi ||
          response.data?.result?.abi ||
          response.data?.result?.contract?.abi;

        if (v2Abi) {
          if (
            typeof v2Abi === 'string' &&
            v2Abi === 'Contract source code not verified'
          ) {
            continue;
          }
          try {
            const serialized =
              typeof v2Abi === 'string' ? v2Abi : JSON.stringify(v2Abi);
            JSON.parse(serialized);
            abiResult = {
              abi: serialized,
              contractName: extractContractName(response.data),
            };
            break;
          } catch {
            console.warn('🔍 [Blockscout] Invalid ABI payload from v2 endpoint');
            continue;
          }
        }
      } catch (endpointError) {
        // handled inside withRetry logging
        continue;
      }
    }

    if (!abiResult) {
      return { success: false, error: 'Contract not found on Blockscout' };
    }

    if (!abiResult.contractName) {
      try {
        console.log('🔍 [Blockscout] Fetching contract name separately...');
        const nameEndpoints = [
          buildStandardEndpoint(blockscoutExplorer.url, normalizedAddress, apiKey),
          buildV2Endpoint(blockscoutExplorer.url, normalizedAddress, apiKey),
        ];

        for (const nameEndpoint of nameEndpoints) {
          try {
            const nameResponse = await withRetry(() =>
              axios.get(nameEndpoint, {
                timeout: 15000,
              })
            );

            const candidateName = extractContractName(nameResponse.data);
            if (candidateName) {
              abiResult.contractName = candidateName;
              console.log(
                `🔍 [Blockscout] Contract name resolved: ${abiResult.contractName}`
              );
              break;
            }
          } catch (nameError) {
            continue;
          }
        }
      } catch {
        console.warn('Could not fetch contract name from Blockscout');
      }
    }

    return {
      success: true,
      contractName: abiResult.contractName,
      abi: abiResult.abi,
      source: 'blockscout',
      explorerName: blockscoutExplorer.name,
      verified: true,
    };
  } catch (error: any) {
    return { success: false, error: `Blockscout error: ${error.message}` };
  }
};
