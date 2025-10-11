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

    let abi: string | undefined;
    let contractName: string | undefined;
    let lastFailure: string | undefined;

    const keyParam = apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : '';
    const baseCandidates = [
      resolveProxy(chain),
      etherscanExplorer.url,
      chain.apiUrl,
    ].filter(
      (base, index, arr) => !!base && arr.findIndex((b) => b === base) === index
    ) as string[];

    for (const base of baseCandidates) {
      try {
        const [abiResponse, nameResponse] = await Promise.allSettled([
          axios.get(
            `${base}?module=contract&action=getabi&address=${address}${keyParam}`,
            {
              timeout: 15000,
            }
          ),
          axios.get(
            `${base}?module=contract&action=getsourcecode&address=${address}${keyParam}`,
            {
              timeout: 15000,
            }
          ),
        ]);

        if (abiResponse.status === 'fulfilled') {
          const data = abiResponse.value.data;
          if (
            data?.status === '1' &&
            typeof data.result === 'string' &&
            isAbiVerified(data.result)
          ) {
            try {
              JSON.parse(data.result);
              abi = data.result;
            } catch {
              lastFailure = 'Invalid ABI payload returned by Etherscan';
            }
          } else {
            lastFailure =
              data?.result ||
              data?.message ||
              'Contract ABI not found on Etherscan';
          }
        } else {
          lastFailure = abiResponse.reason?.message || String(abiResponse.reason);
        }

        if (!abi) {
          continue;
        }

        if (nameResponse.status === 'fulfilled') {
          const nameData = nameResponse.value.data?.result?.[0];
          if (nameData) {
            const candidate =
              nameData.ContractName ||
              nameData.contractName ||
              nameData.contract_name ||
              nameData.Contract_Name;
            if (
              typeof candidate === 'string' &&
              candidate.trim().length > 0 &&
              !/^smart contract$/i.test(candidate)
            ) {
              contractName = candidate.trim();
            }
          }
          if (!contractName) {
            contractName = 'Smart Contract';
          }
        }

        // Successful fetch, break the loop
        break;
      } catch (err: any) {
        lastFailure = err?.message || String(err);
        continue;
      }
    }

    if (!abi) {
      return {
        success: false,
        error:
          lastFailure?.trim().length
            ? `Contract ABI not found on Etherscan (${lastFailure})`
            : 'Contract ABI not found on Etherscan',
      };
    }

    return {
      success: true,
      abi,
      contractName,
      source: 'etherscan',
      explorerName: etherscanExplorer.name,
      verified: true,
    };
  } catch (error: any) {
    console.error('Etherscan API error:', error);
    return {
      success: false,
      error: `Etherscan error: ${error.message}`,
    };
  }
};
