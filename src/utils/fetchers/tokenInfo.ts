import { ethers } from 'ethers';
import type { Chain } from '../../types';
import type { ContractInfoResult } from '../../types/contractInfo';
import { getAlchemyApiKey } from '../env';

const buildRpcUrl = (chain: Chain): string => {
  const apiKey = getAlchemyApiKey();
  if (!apiKey) {
    return chain.rpcUrl;
  }

  switch (chain.id) {
    case 1:
      return `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;
    case 8453:
      return `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
    case 84532:
      return `https://base-sepolia.g.alchemy.com/v2/${apiKey}`;
    case 137:
      return `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`;
    default:
      return chain.rpcUrl;
  }
};

export const fetchTokenInfo = async (
  address: string,
  abi: any[],
  chain: Chain
): Promise<ContractInfoResult['tokenInfo']> => {
  console.log(`🔍 [Token] Fetching token info for ${address}`);

  try {
    const provider = new ethers.providers.JsonRpcProvider(buildRpcUrl(chain));
    const contract = new ethers.Contract(address, abi, provider);

    const functions = abi
      .filter((item) => item.type === 'function')
      .map((item) => item.name);

    if (functions.includes('name') && functions.includes('symbol')) {
      console.log('🔍 [Token] Using direct contract calls...');

      const calls = [] as Promise<unknown>[];
      if (functions.includes('name')) calls.push(contract.name());
      if (functions.includes('symbol')) calls.push(contract.symbol());
      if (functions.includes('decimals')) calls.push(contract.decimals());
      if (functions.includes('totalSupply')) calls.push(contract.totalSupply());

      const results = await Promise.allSettled(calls);

      const tokenInfo: ContractInfoResult['tokenInfo'] = {
        name:
          results[0]?.status === 'fulfilled'
            ? (results[0].value as string)
            : undefined,
        symbol:
          results[1]?.status === 'fulfilled'
            ? (results[1].value as string)
            : undefined,
        decimals:
          results[2]?.status === 'fulfilled'
            ? Number(results[2].value)
            : undefined,
        totalSupply:
          results[3]?.status === 'fulfilled'
            ? (results[3].value as ethers.BigNumber)?.toString?.() ?? String(results[3].value)
            : undefined,
      };

      console.log('🔍 [Token] Direct call results:', tokenInfo);

      if (tokenInfo.name && tokenInfo.symbol) {
        return tokenInfo;
      }
    }

    console.log('🔍 [Token] Trying static calls...');
    try {
      const name = await contract.callStatic.name().catch(() => undefined);
      const symbol = await contract.callStatic.symbol().catch(() => undefined);
      const decimals = await contract.callStatic
        .decimals()
        .catch(() => undefined);

      if (name && symbol) {
        console.log(`🔍 [Token] Static call successful: ${name} (${symbol})`);
        return { name, symbol, decimals: Number(decimals) || 18 };
      }
    } catch (staticError) {
      console.log('🔍 [Token] Static call failed:', staticError);
    }
  } catch (error) {
    console.warn('🔍 [Token] Error fetching token info via direct calls:', error);
  }

  console.log(`🔍 [Token] Could not fetch token info for ${address}`);
  return undefined;
};
