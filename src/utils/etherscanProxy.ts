const ETHERSCAN_PROXY_ROUTE = "/api/explorer/etherscan";
type EtherscanContractAction = "getabi" | "getsourcecode";

interface EtherscanProxyRequest {
  action: EtherscanContractAction;
  address: string;
  chainId: number;
  personalApiKey?: string;
  signal?: AbortSignal;
}

export async function postEtherscanLookup({
  action,
  address,
  chainId,
  personalApiKey,
  signal,
}: EtherscanProxyRequest): Promise<Response> {
  return fetch(ETHERSCAN_PROXY_ROUTE, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      address,
      chainId,
      ...(personalApiKey ? { personalApiKey } : {}),
    }),
    signal,
  });
}
