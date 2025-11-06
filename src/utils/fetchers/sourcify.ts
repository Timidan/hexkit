import axios from 'axios';
import type { Chain } from '../../types';
import type { ContractInfoResult } from '../../types/contractInfo';

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

const REPO_TIMEOUT_MS = 3500;
const API_TIMEOUT_MS = 4500;

const getRepoBases = () => {
  if (typeof window !== 'undefined') {
    return ['/api/sourcify/repository', 'https://repo.sourcify.dev'];
  }
  return ['https://repo.sourcify.dev', '/api/sourcify/repository'];
};

const getApiBases = () => {
  if (typeof window !== 'undefined') {
    return ['/api/sourcify/server', 'https://sourcify.dev/server'];
  }
  return ['https://sourcify.dev/server', '/api/sourcify/server'];
};

const normalizeBase = (base: string) => base.replace(/\/+$/, '');

const joinUrl = (base: string, path: string) => {
  const normalizedBase = normalizeBase(base);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const buildRepoPaths = (chainId: number, address: string) => [
  `/contracts/full_match/${chainId}/${address}/metadata.json`,
  `/contracts/partial_match/${chainId}/${address}/metadata.json`,
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

const attemptFetch = async <T>(
  bases: string[],
  builder: (base: string) => string,
  timeoutMs: number,
  headers?: Record<string, string>
): Promise<T> => {
  const errors: string[] = [];

  for (const base of bases) {
    const url = builder(base);
    try {
      const response = await axios.get<T>(url, {
        timeout: timeoutMs,
        headers,
      });
      return response.data;
    } catch (error: any) {
      if (error?.code === 'ECONNABORTED') {
        errors.push(`${url}: timeout`);
      } else if (error?.response?.status) {
        errors.push(`${url}: ${error.response.status}`);
      } else {
        errors.push(`${url}: ${error.message || error}`);
      }
      continue;
    }
  }

  throw new Error(errors.join(' | '));
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
    const repoErrors: string[] = [];

    const repoBases = getRepoBases();
    const repoPaths = buildRepoPaths(chain.id, normalizedAddress);

    for (const path of repoPaths) {
      try {
        const metadata = await attemptFetch<Record<string, any>>(
          repoBases,
          (base) => joinUrl(base, path),
          REPO_TIMEOUT_MS
        );

        const abi = metadata?.output?.abi;
        if (Array.isArray(abi)) {
          return {
            success: true,
            contractName: extractContractName(metadata),
            abi: JSON.stringify(abi),
            source: 'sourcify',
            explorerName: 'Sourcify',
            verified: true,
          };
        }
        repoErrors.push(`${path}: missing ABI payload`);
      } catch (error: any) {
        repoErrors.push(`${path}: ${error.message || error}`);
      }
    }

    const apiBases = getApiBases();
    const cacheBuster = Date.now().toString(36);
    try {
      const apiResponse = await attemptFetch<SourcifyResponse>(
        apiBases,
        (base) =>
          joinUrl(
            base,
            `/v2/contract/${chain.id}/${normalizedAddress}?fields=abi,metadata&_=${cacheBuster}`
          ),
        API_TIMEOUT_MS,
        {
          Accept: 'application/json',
        }
      );

      const hasValidData =
        apiResponse.match ||
        apiResponse.creationMatch ||
        apiResponse.runtimeMatch ||
        (Array.isArray(apiResponse.abi) && apiResponse.abi.length > 0);

      if (hasValidData && Array.isArray(apiResponse.abi)) {
        return {
          success: true,
          contractName: extractContractName(apiResponse.metadata),
          abi: JSON.stringify(apiResponse.abi),
          source: 'sourcify',
          explorerName: 'Sourcify',
          verified: true,
        };
      }
      repoErrors.push('API response missing verified ABI');
    } catch (error: any) {
      repoErrors.push(`API lookup: ${error.message || error}`);
    }

    const errorMessage =
      repoErrors.length > 0
        ? `Contract not verified on Sourcify (${repoErrors.join(' | ')})`
        : 'Contract not verified on Sourcify';

    return { success: false, error: errorMessage };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return { success: false, error: 'Contract not found on Sourcify' };
    }
    console.error(' [Sourcify] Error:', error);
    return { success: false, error: `Sourcify error: ${error.message}` };
  }
};
