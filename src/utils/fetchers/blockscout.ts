import axios from 'axios';
import type { Chain, ExplorerAPI } from '../../types';
import type { ContractInfoResult } from '../../types/contractInfo';
import { withRetry } from './common';

const BLOCKSCOUT_API_FALLBACKS: Record<number, string[]> = {
  8453: ['https://base.blockscout.com/api'],
  84532: ['https://base-sepolia.blockscout.com/api'],
  137: ['https://polygon.blockscout.com/api'],
  42161: ['https://arbitrum.blockscout.com/api'],
};

const normalizeBase = (base: string) => base.replace(/\/$/, '');

const buildStandardEndpoint = (base: string, address: string) => {
  const normalized = normalizeBase(base);
  return `${normalized}${normalized.endsWith('/api') ? '' : '/api'}?module=contract&action=getabi&address=${address}`;
};

const buildV2Endpoint = (base: string, address: string) => {
  const normalized = normalizeBase(base);
  return `${normalized}${normalized.endsWith('/api') ? '' : '/api'}/v2/smart-contracts/${address}`;
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
  chain: Chain
): Promise<Partial<ContractInfoResult>> => {
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
        : '/api/blockscout';

    const apiBases = new Set<string>([
      blockscoutProxy,
      blockscoutExplorer.url,
      ...fallbackApis,
    ]);

    const abiEndpoints: string[] = [];
    apiBases.forEach((base) => {
      abiEndpoints.push(buildStandardEndpoint(base, address));
      abiEndpoints.push(buildV2Endpoint(base, address));
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
          abiResult = { abi: response.data.result };
          break;
        }

        const v2Abi =
          response.data?.abi ||
          response.data?.result?.abi ||
          response.data?.result?.contract?.abi;

        if (v2Abi) {
          abiResult = {
            abi: typeof v2Abi === 'string' ? v2Abi : JSON.stringify(v2Abi),
            contractName:
              response.data?.contractName ||
              response.data?.name ||
              response.data?.result?.contractName ||
              response.data?.result?.name,
          };
          break;
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
          buildStandardEndpoint(blockscoutExplorer.url, address),
          buildV2Endpoint(blockscoutExplorer.url, address),
        ];

        for (const nameEndpoint of nameEndpoints) {
          try {
            const nameResponse = await withRetry(() =>
              axios.get(nameEndpoint, {
                timeout: 15000,
              })
            );

            if (
              nameResponse.data?.status === '1' &&
              nameResponse.data.result?.[0]
            ) {
              abiResult.contractName =
                nameResponse.data.result[0].ContractName;
              console.log(
                `🔍 [Blockscout] Contract name from source code: ${abiResult.contractName}`
              );
              break;
            }

            if (nameResponse.data?.name || nameResponse.data?.contract_name) {
              abiResult.contractName =
                nameResponse.data.name || nameResponse.data.contract_name;
              console.log(
                `🔍 [Blockscout] Contract name from v2 API: ${abiResult.contractName}`
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
