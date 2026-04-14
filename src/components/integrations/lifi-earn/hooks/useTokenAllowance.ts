import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";
import { networkConfigManager } from "../../../../config/networkConfig";
import { SUPPORTED_CHAINS } from "../../../../utils/chains";

const ERC20_ALLOWANCE_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
];

async function fetchAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  chainId: number
): Promise<string> {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!chain) throw new Error(`Chain ${chainId} not supported`);

  const resolution = networkConfigManager.resolveRpcUrl(chainId, chain.rpcUrl);
  if (!resolution.url) {
    throw new Error(
      `No RPC URL configured for chain ${chainId}. Set a custom RPC or enable the public fallback in Network Settings.`,
    );
  }
  const provider = new ethers.providers.JsonRpcProvider(resolution.url);
  const contract = new ethers.Contract(
    tokenAddress,
    ERC20_ALLOWANCE_ABI,
    provider
  );

  const allowance: ethers.BigNumber = await contract.allowance(
    ownerAddress,
    spenderAddress
  );
  return allowance.toString();
}

export function useTokenAllowance(params: {
  tokenAddress: string | null;
  ownerAddress: string | null;
  spenderAddress: string | null;
  chainId: number | null;
}) {
  return useQuery({
    queryKey: [
      "token-allowance",
      params.tokenAddress,
      params.ownerAddress,
      params.spenderAddress,
      params.chainId,
    ],
    queryFn: () =>
      fetchAllowance(
        params.tokenAddress!,
        params.ownerAddress!,
        params.spenderAddress!,
        params.chainId!
      ),
    enabled:
      !!params.tokenAddress &&
      !!params.ownerAddress &&
      !!params.spenderAddress &&
      !!params.chainId,
    staleTime: 15 * 1000,
    refetchOnWindowFocus: false,
  });
}
