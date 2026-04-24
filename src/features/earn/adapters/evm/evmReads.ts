// Bare async variants of useTokenBalance / useTokenAllowance so the adapter
// can call them outside of render.
import { ethers } from "ethers";
import { networkConfigManager } from "../../../../config/networkConfig";
import { SUPPORTED_CHAINS } from "../../../../utils/chains";
import { isNativeToken } from "../../../../utils/addressConstants";

const ERC20_BALANCE_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];
const ERC20_ALLOWANCE_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
];

function providerFor(chainId: number): ethers.providers.JsonRpcProvider {
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

export async function fetchEvmTokenBalance(
  chainId: number,
  tokenAddress: string,
  owner: string,
): Promise<bigint> {
  const provider = providerFor(chainId);
  if (isNativeToken(tokenAddress)) {
    const raw = await provider.getBalance(owner);
    return BigInt(raw.toString());
  }
  const contract = new ethers.Contract(tokenAddress, ERC20_BALANCE_ABI, provider);
  const raw: ethers.BigNumber = await contract.balanceOf(owner);
  return BigInt(raw.toString());
}

export async function fetchEvmTokenAllowance(
  chainId: number,
  tokenAddress: string,
  owner: string,
  spender: string,
): Promise<bigint> {
  const provider = providerFor(chainId);
  const contract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, provider);
  const raw: ethers.BigNumber = await contract.allowance(owner, spender);
  return BigInt(raw.toString());
}
