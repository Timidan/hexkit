import { ethers } from 'ethers';
import {
  NetworkAccessError,
  networkAccess,
} from '../../../../config/networkAccess';
import { SUPPORTED_CHAINS } from '../../../../utils/chains';
import { isNativeToken } from '../../../../utils/addressConstants';

const ERC20_BALANCE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];
const ERC20_ALLOWANCE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
];

export function getReadProvider(
  chainId: number
): ethers.providers.JsonRpcProvider {
  const chain = SUPPORTED_CHAINS.find((candidate) => candidate.id === chainId);
  if (!chain) throw new Error(`Chain ${chainId} not supported`);

  try {
    return networkAccess.access(chain).provider;
  } catch (error) {
    if (error instanceof NetworkAccessError) {
      throw new Error(
        `No RPC URL configured for chain ${chainId}. Set a custom RPC or enable the public fallback in Network Settings.`
      );
    }
    throw error;
  }
}

export async function readErc20Balance(
  tokenAddress: string,
  ownerAddress: string,
  chainId: number
): Promise<string> {
  const provider = getReadProvider(chainId);
  if (isNativeToken(tokenAddress)) {
    return (await provider.getBalance(ownerAddress)).toString();
  }
  const contract = new ethers.Contract(
    tokenAddress,
    ERC20_BALANCE_ABI,
    provider
  );
  return (await contract.balanceOf(ownerAddress)).toString();
}

export async function readErc20Allowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  chainId: number
): Promise<string> {
  const contract = new ethers.Contract(
    tokenAddress,
    ERC20_ALLOWANCE_ABI,
    getReadProvider(chainId)
  );
  return (await contract.allowance(ownerAddress, spenderAddress)).toString();
}
