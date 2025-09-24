import axios from 'axios';
import type { Chain } from '../../types';
import type { ContractInfoResult } from '../../types/contractInfo';

const explorerSupportsEtherscan = (chain: Chain) =>
  chain.explorers?.some((e) => e.type === 'etherscan');

const resolveProxy = (chain: Chain) => {
  if (chain.id === 8453) return '/api/basescan';
  if (chain.id === 137) return '/api/polygonscan';
  return '/api/etherscan';
};

export const fetchFromEtherscan = async (
  address: string,
  chain: Chain
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

    const proxy = resolveProxy(chain);

    const [abiResponse, nameResponse] = await Promise.allSettled([
      axios.get(`${proxy}/api?module=contract&action=getabi&address=${address}`, {
        timeout: 15000,
      }),
      axios.get(
        `${proxy}/api?module=contract&action=getsourcecode&address=${address}`,
        {
          timeout: 15000,
        }
      ),
    ]);

    let abi: string | undefined;
    if (abiResponse.status === 'fulfilled') {
      const data = abiResponse.value.data;
      if (data?.status === '1' && data.result) {
        abi = data.result;
      }
    }

    if (!abi) {
      return {
        success: false,
        error: 'Contract ABI not found on Etherscan',
      };
    }

    let contractName: string | undefined;
    if (nameResponse.status === 'fulfilled') {
      const data = nameResponse.value.data?.result?.[0];
      if (data) {
        contractName = data.ContractName || 'Smart Contract';
      }
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
