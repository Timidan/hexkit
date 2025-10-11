import axios from 'axios';
import type { Chain } from '../../types';
import type { ContractInfoResult } from '../../types/contractInfo';
import { withRetry } from './common';

interface SourcifyResponse {
  match?: any; // "match", "exact_match", or null
  creationMatch?: any;
  runtimeMatch?: any;
  verifiedAt?: string;
  chainId?: string;
  address?: string;
  abi?: any[];
  metadata?: {
    settings?: {
      compilationTarget?: Record<string, string>;
    };
    name?: string;
    compiler?: {
      version?: string;
    };
    language?: string;
    output?: {
      abi?: any[];
    };
  };
}

const buildRepoUrls = (chainId: number, address: string) => [
  `/api/sourcify/repository/contracts/full_match/${chainId}/${address}/metadata.json`,
  `/api/sourcify/repository/contracts/partial_match/${chainId}/${address}/metadata.json`,
];

const extractContractName = (metadata: any): string | undefined => {
  const compilationTarget = metadata?.settings?.compilationTarget;
  if (compilationTarget) {
    const targetKeys = Object.keys(compilationTarget);
    if (targetKeys.length > 0) {
      return compilationTarget[targetKeys[0]];
    }
  }
  return metadata?.name;
};

export const fetchFromSourcify = async (
  address: string,
  chain: Chain
): Promise<Partial<ContractInfoResult>> => {
  const normalizedAddress = address?.toLowerCase();
  if (!normalizedAddress || !normalizedAddress.startsWith('0x') || normalizedAddress.length !== 42) {
    return { success: false, error: 'Invalid contract address format' };
  }

  try {
    for (const url of buildRepoUrls(chain.id, normalizedAddress)) {
      try {
        const metadataResponse = await withRetry(() =>
          axios.get(url, {
            timeout: 10000,
            headers: {
              Accept: 'application/json',
            },
          })
        );

        const abi = metadataResponse.data?.output?.abi;
        if (Array.isArray(abi)) {
          return {
            success: true,
            contractName: extractContractName(metadataResponse.data),
            abi: JSON.stringify(abi),
            source: 'sourcify',
            explorerName: 'Sourcify',
            verified: true,
          };
        }
      } catch (repoErr: any) {
        if (repoErr.response?.status === 404) {
          console.log(
            `🔍 [Sourcify] Repo endpoint ${url} returned 404 (expected for unverified contracts)`
          );
        } else {
          console.warn(`🔍 [Sourcify] Repo endpoint ${url} failed:`, repoErr.message);
        }
        continue;
      }
    }

    const checkUrl = `/api/sourcify/server/v2/contract/${chain.id}/${normalizedAddress}?fields=abi,metadata`;
    const response = await withRetry(() =>
      axios.get<SourcifyResponse>(checkUrl, {
        timeout: 15000,
      })
    );

    const hasValidData =
      response.data.match ||
      response.data.creationMatch ||
      response.data.runtimeMatch ||
      (response.status === 304 &&
        response.data.abi &&
        Array.isArray(response.data.abi));

    if (hasValidData) {
      const abiArray = response.data.abi;
      if (abiArray && Array.isArray(abiArray)) {
        return {
          success: true,
          contractName: extractContractName(response.data.metadata),
          abi: JSON.stringify(abiArray),
          source: 'sourcify',
          explorerName: 'Sourcify',
          verified: true,
        };
      }
    }

    return { success: false, error: 'Contract not verified on Sourcify' };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return { success: false, error: 'Contract not found on Sourcify' };
    }
    console.error('🔍 [Sourcify] Error:', error);
    return { success: false, error: `Sourcify error: ${error.message}` };
  }
};
