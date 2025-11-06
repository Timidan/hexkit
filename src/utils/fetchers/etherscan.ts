import axios from 'axios';
import type { Chain } from '../../types';
import type { ContractInfoResult } from '../../types/contractInfo';

const explorerSupportsEtherscan = (chain: Chain) =>
  chain.explorers?.some((e) => e.type === 'etherscan');

const resolveProxy = (chain: Chain) => {
  if (chain.id === 8453) return '/api/basescan';
  if (chain.id === 137) return '/api/polygonscan';
  if (chain.id === 42161) return '/api/arbiscan';
  if (chain.id === 10) return '/api/etherscan'; // Optimism shares Etherscan proxy
  return '/api/etherscan';
};

const isAbiVerified = (abi: string) =>
  abi &&
  abi !== 'Contract source code not verified' &&
  abi !== 'Source code not verified' &&
  abi !== '[]';

const V2_AGGREGATOR = 'https://api.etherscan.io/v2/api';
const V1_AGGREGATOR = 'https://api.etherscan.io/api';

const normalizeBase = (base: string) => base.replace(/\/+$/, '');

const toV2Base = (base: string) => {
  const trimmed = normalizeBase(base);
  if (trimmed.includes('/v2/')) {
    return trimmed;
  }
  if (trimmed.endsWith('/api')) {
    return `${trimmed.slice(0, -4)}/v2/api`;
  }
  return `${trimmed}/v2/api`;
};

const detectMissingApiKey = (message?: string) =>
  typeof message === 'string' && /missing\/invalid api key/i.test(message);

interface AttemptOutcome {
  success: boolean;
  abi?: string;
  contractName?: string;
  failureMessage?: string;
  missingApiKey?: boolean;
}

const extractContractName = (result: any): string | undefined => {
  const candidate =
    result?.ContractName ||
    result?.contractName ||
    result?.contract_name ||
    result?.Contract_Name;

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.length > 0 && !/^smart contract$/i.test(trimmed)) {
      return trimmed;
    }
  }

  return undefined;
};

const attemptEtherscanRequest = async (
  base: string,
  address: string,
  chain: Chain,
  apiKey: string | undefined,
  version: 'v2' | 'v1'
): Promise<AttemptOutcome> => {
  const isV2 = version === 'v2';

  const buildParams = (action: 'getabi' | 'getsourcecode') => {
    const params: Record<string, string> = {
      module: 'contract',
      action,
      address,
    };

    if (apiKey) {
      params.apikey = apiKey;
    }

    if (isV2) {
      params.chainid = String(chain.id);
    }

    return params;
  };

  try {
    const abiResponse = await axios.get(base, {
      params: buildParams('getabi'),
      timeout: 15000,
    });

    const abiData = abiResponse.data;
    const abiStatus = abiData?.status;
    const abiResult = abiData?.result;

    if (
      abiStatus === '1' &&
      typeof abiResult === 'string' &&
      isAbiVerified(abiResult)
    ) {
      try {
        JSON.parse(abiResult);
      } catch {
        return {
          success: false,
          failureMessage: 'Invalid ABI payload returned by Etherscan',
        };
      }

      let contractName: string | undefined;
      try {
        const nameResponse = await axios.get(base, {
          params: buildParams('getsourcecode'),
          timeout: 15000,
        });

        const nameData = nameResponse.data;
        if (Array.isArray(nameData?.result) && nameData.result.length > 0) {
          contractName = extractContractName(nameData.result[0]);
        }
      } catch (nameError) {
        console.warn('Etherscan name lookup failed:', nameError);
      }

      if (!contractName) {
        contractName = 'Smart Contract';
      }

      return {
        success: true,
        abi: abiResult,
        contractName,
      };
    }

    const failureMessage =
      typeof abiResult === 'string' && abiResult.trim().length > 0
        ? abiResult
        : abiData?.message || 'Unknown Etherscan response';

    return {
      success: false,
      failureMessage,
      missingApiKey: detectMissingApiKey(failureMessage),
    };
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || String(error);
    return {
      success: false,
      failureMessage: message,
      missingApiKey: detectMissingApiKey(message),
    };
  }
};

export const fetchFromEtherscan = async (
  address: string,
  chain: Chain,
  apiKey?: string
): Promise<Partial<ContractInfoResult>> => {
  try {
    const etherscanExplorer = chain.explorers?.find(
      (e) => e.type === 'etherscan'
    );

    if (!etherscanExplorer || !explorerSupportsEtherscan(chain)) {
      return {
        success: false,
        error: 'No Etherscan API available for this network',
      };
    }

    const explorerName = etherscanExplorer.name || 'Etherscan';

    const rawBases = new Set<string>([
      resolveProxy(chain),
      etherscanExplorer.url,
      chain.apiUrl,
    ].filter(Boolean) as string[]);

    const v2Bases = new Set<string>(
      Array.from(rawBases).map((base) => toV2Base(base))
    );
    v2Bases.add(V2_AGGREGATOR);

    const v1Bases = new Set<string>(rawBases);
    v1Bases.add(V1_AGGREGATOR);

    const v2Failures: string[] = [];
    let missingApiKeyDetected = false;

    for (const base of v2Bases) {
      const outcome = await attemptEtherscanRequest(
        base,
        address,
        chain,
        apiKey,
        'v2'
      );

      if (outcome.success && outcome.abi) {
        return {
          success: true,
          abi: outcome.abi,
          contractName: outcome.contractName,
          source: 'etherscan',
          explorerName,
          verified: true,
        };
      }

      if (outcome.missingApiKey) {
        missingApiKeyDetected = true;
      }

      if (outcome.failureMessage) {
        v2Failures.push(outcome.failureMessage);
      }
    }

    if (!missingApiKeyDetected) {
      for (const base of v1Bases) {
        const outcome = await attemptEtherscanRequest(
          base,
          address,
          chain,
          apiKey,
          'v1'
        );

        if (outcome.success && outcome.abi) {
          return {
            success: true,
            abi: outcome.abi,
            contractName: outcome.contractName,
            source: 'etherscan',
            explorerName,
            verified: true,
          };
        }

        if (outcome.failureMessage) {
          v2Failures.push(outcome.failureMessage);
        }
      }
    }

    const failureSummary = v2Failures
      .filter(Boolean)
      .join('; ');

    return {
      success: false,
      error: missingApiKeyDetected
        ? 'Etherscan API V2 rejected the request: missing or invalid API key. Add a valid key in the API settings and retry.'
        : failureSummary.length
          ? `Contract ABI not found on Etherscan (${failureSummary})`
          : 'Contract ABI not found on Etherscan',
    };
  } catch (error: any) {
    console.error('Etherscan API error:', error);
    return {
      success: false,
      error: `Etherscan error: ${error.message}`,
    };
  }
};
