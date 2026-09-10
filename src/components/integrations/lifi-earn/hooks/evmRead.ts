import { ethers } from "ethers";
import { networkConfigManager } from "../../../../config/networkConfig";
import { SUPPORTED_CHAINS } from "../../../../utils/chains";
import { isNativeToken } from "../../../../utils/addressConstants";

export function getReadProvider(
  chainId: number,
): ethers.providers.JsonRpcProvider {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!chain) throw new Error(`Chain ${chainId} not supported`);

  const resolution = networkConfigManager.resolveRpcUrl(chainId, chain.rpcUrl);
  if (!resolution.url) {
    throw new Error(
      `No RPC URL configured for chain ${chainId}. Set a custom RPC or enable the public fallback in Network Settings.`,
    );
  }
  return new ethers.providers.JsonRpcProvider(resolution.url);
}

export async function readErc20Balance(
  tokenAddress: string,
  ownerAddress: string,
  chainId: number,
): Promise<string> {
  const provider = getReadProvider(chainId);

  if (isNativeToken(tokenAddress)) {
    const raw: ethers.BigNumber = await provider.getBalance(ownerAddress);
    return raw.toString();
  }

  const contract = new ethers.Contract(
    tokenAddress,
    ["function balanceOf(address owner) view returns (uint256)"],
    provider,
  );
  const raw: ethers.BigNumber = await contract.balanceOf(ownerAddress);
  return raw.toString();
}

export async function readErc20Allowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  chainId: number,
): Promise<string> {
  const provider = getReadProvider(chainId);
  const contract = new ethers.Contract(
    tokenAddress,
    ["function allowance(address owner, address spender) view returns (uint256)"],
    provider,
  );

  const allowance: ethers.BigNumber = await contract.allowance(
    ownerAddress,
    spenderAddress,
  );
  return allowance.toString();
}
