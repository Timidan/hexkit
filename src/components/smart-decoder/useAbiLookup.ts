import {
  ETHERSCAN_INSTANCES,
  BLOCKSCOUT_INSTANCES,
  type AbiFetchResult,
} from './types';
import { isAbortError } from './utils';

/**
 * Fetch ABI from Etherscan-style explorer instances.
 */
export const fetchABIFromEtherscanInstances = async (
  address: string,
  chainId?: string,
  signal?: AbortSignal,
  addStep?: (step: string) => void
): Promise<AbiFetchResult> => {
  const errors: string[] = [];

  const instances = chainId
    ? ETHERSCAN_INSTANCES.filter((instance) => instance.chainId === String(chainId))
    : ETHERSCAN_INSTANCES;

  if (!instances.length) {
    throw new Error('No Etherscan-style explorer configured for the selected network');
  }

  for (const instance of instances) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Lookup cancelled', 'AbortError');
      }
      addStep?.(` Searching ${instance.name} (Etherscan)...`);

      let apiKey = '';
      try {
        const stored = localStorage.getItem(`apiKey_${instance.apiKeyParam}`);
        if (stored) apiKey = stored;
      } catch {
        // localStorage unavailable
      }

      const apiKeyParam = apiKey ? `&apikey=${apiKey}` : '';
      const response = await fetch(
        `${instance.url}/api?module=contract&action=getabi&address=${address}${apiKeyParam}`,
        {
          headers: { 'Accept': 'application/json' },
          signal,
        }
      );

      if (response.ok) {
        const data = await response.json();

        if (data.status === '1' && data.result) {
          try {
            const abi = JSON.parse(data.result);
            if (Array.isArray(abi)) {
              addStep?.(` Found verified contract on ${instance.name} (Etherscan)!`);
              return {
                abi,
                chainId: instance.chainId,
                sourceKind: 'etherscan',
                sourceName: instance.name,
              };
            }
          } catch {
            errors.push(`${instance.name}: invalid ABI format`);
          }
        } else {
          errors.push(`${instance.name}: ${data.message || 'ABI not available'}`);
        }
      } else {
        errors.push(`${instance.name}: API error ${response.status}`);
      }
    } catch (error: any) {
      if (isAbortError(error)) throw error;
      errors.push(`${instance.name}: ${error.message}`);
      continue;
    }
  }

  throw new Error(`Could not retrieve ABI from Etherscan: ${errors.join(', ')}`);
};

/**
 * Fetch ABI from Blockscout explorer instances.
 */
export const fetchABIFromBlockscoutInstances = async (
  address: string,
  chainId?: string,
  signal?: AbortSignal,
  addStep?: (step: string) => void
): Promise<AbiFetchResult> => {
  const errors: string[] = [];

  const instances = chainId
    ? BLOCKSCOUT_INSTANCES.filter((instance) => instance.chainId === String(chainId))
    : BLOCKSCOUT_INSTANCES;

  if (!instances.length) {
    throw new Error('No Blockscout explorer configured for the selected network');
  }

  for (const instance of instances) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Lookup cancelled', 'AbortError');
      }
      addStep?.(` Searching ${instance.name}...`);
      const response = await fetch(
        `${instance.url}/api/v2/smart-contracts/${address}`,
        {
          headers: { 'Accept': 'application/json' },
          signal,
        }
      );

      if (response.ok) {
        const data = await response.json();

        if (data.is_verified && data.abi && Array.isArray(data.abi)) {
          addStep?.(` Found verified contract on ${instance.name}!`);
          return {
            abi: data.abi,
            chainId: instance.chainId,
            sourceKind: 'blockscout',
            sourceName: instance.name,
          };
        } else {
          errors.push(`${instance.name}: ABI not available`);
        }
      } else if (response.status === 404) {
        errors.push(`${instance.name}: contract not found`);
      } else {
        errors.push(`${instance.name}: API error ${response.status}`);
      }
    } catch (error: any) {
      if (isAbortError(error)) throw error;
      errors.push(`${instance.name}: ${error.message}`);
      continue;
    }
  }

  throw new Error(`Could not retrieve ABI from Blockscout: ${errors.join(', ')}`);
};

/**
 * Fetch contract name from Etherscan-style instances.
 */
export const fetchContractNameFromEtherscanInstances = async (
  address: string,
  chainId?: string,
  signal?: AbortSignal
): Promise<string | null> => {
  const instances = chainId
    ? ETHERSCAN_INSTANCES.filter((instance) => instance.chainId === String(chainId))
    : ETHERSCAN_INSTANCES;

  for (const instance of instances) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Lookup cancelled', 'AbortError');
      }
      let apiKey = '';
      try {
        const stored = localStorage.getItem(`apiKey_${instance.apiKeyParam}`);
        if (stored) apiKey = stored;
      } catch {
        // localStorage unavailable
      }

      const apiKeyParam = apiKey ? `&apikey=${apiKey}` : '';
      const response = await fetch(
        `${instance.url}/api?module=contract&action=getsourcecode&address=${address}${apiKeyParam}`,
        {
          headers: { Accept: 'application/json' },
          signal,
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
        const record = data.result[0];
        const contractName = record.ContractName || record.contractName;
        if (contractName && contractName !== '0') {
          return contractName;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
};

/**
 * Fetch contract name from Blockscout instances.
 */
export const fetchContractNameFromBlockscoutInstances = async (
  address: string,
  chainId?: string,
  signal?: AbortSignal
): Promise<string | null> => {
  const instances = chainId
    ? BLOCKSCOUT_INSTANCES.filter((instance) => instance.chainId === String(chainId))
    : BLOCKSCOUT_INSTANCES;

  for (const instance of instances) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Lookup cancelled', 'AbortError');
      }
      const response = await fetch(
        `${instance.url}/api/v2/smart-contracts/${address}`,
        {
          headers: { Accept: 'application/json' },
          signal,
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const candidate = data?.name || data?.contract_name;
      if (data?.is_verified && typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      continue;
    }
  }

  return null;
};
