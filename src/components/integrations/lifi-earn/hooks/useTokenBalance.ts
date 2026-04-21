import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";
import { networkConfigManager } from "../../../../config/networkConfig";
import { SUPPORTED_CHAINS } from "../../../../utils/chains";
import { isNativeToken } from "../../../../utils/addressConstants";

const ERC20_BALANCE_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];

async function fetchBalance(
  tokenAddress: string,
  ownerAddress: string,
  chainId: number,
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

  if (isNativeToken(tokenAddress)) {
    const raw: ethers.BigNumber = await provider.getBalance(ownerAddress);
    return raw.toString();
  }

  const contract = new ethers.Contract(
    tokenAddress,
    ERC20_BALANCE_ABI,
    provider,
  );
  const raw: ethers.BigNumber = await contract.balanceOf(ownerAddress);
  return raw.toString();
}

export function useTokenBalance(params: {
  tokenAddress: string | null;
  ownerAddress: string | null;
  chainId: number | null;
}) {
  return useQuery({
    queryKey: [
      "token-balance",
      params.tokenAddress,
      params.ownerAddress,
      params.chainId,
    ],
    queryFn: () =>
      fetchBalance(
        params.tokenAddress!,
        params.ownerAddress!,
        params.chainId!,
      ),
    enabled:
      !!params.tokenAddress &&
      !!params.ownerAddress &&
      !!params.chainId,
    // Balance changes after approve/deposit — keep fresh-ish but don't hammer.
    staleTime: 10 * 1000,
    refetchOnWindowFocus: false,
  });
}
