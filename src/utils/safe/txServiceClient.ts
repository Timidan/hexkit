import { txServiceHostForChain } from './safeRegistry';

export type SafeTxServiceResponse = {
  safe: string;
  to: string;
  value: string;
  data: string | null;
  operation: 0 | 1;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: string;
  confirmations: Array<{
    owner: string;
    signature: string;
    signatureType?: string;
  }>;
};

export interface FetchSafeTxArgs {
  chainId: number;
  safeTxHash: string;
  fetcher?: typeof fetch;
  proxyBase?: string; // e.g. "/api/safe/proxy"
  proxySecret?: string;
}

export async function fetchSafeTx(
  args: FetchSafeTxArgs,
): Promise<SafeTxServiceResponse> {
  const host = txServiceHostForChain(args.chainId);
  if (!host) throw new Error(`No tx-service host for chainId ${args.chainId}`);
  const path = `/api/v1/multisig-transactions/${args.safeTxHash}/`;
  const url = args.proxyBase
    ? `${args.proxyBase}?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`
    : `https://${host}${path}`;
  const doFetch = args.fetcher ?? fetch;
  const res = await doFetch(url, {
    method: 'GET',
    headers: args.proxySecret ? { 'x-proxy-secret': args.proxySecret } : {},
  });
  if (!res.ok) {
    throw new Error(`safe tx-service: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SafeTxServiceResponse;
}

export type SafeInfoResponse = {
  address: string;
  masterCopy?: string;
  owners: string[];
  threshold: number;
  nonce: number;
  version?: string;
};

export interface FetchSafeInfoArgs {
  chainId: number;
  safeAddress: string;
  fetcher?: typeof fetch;
  proxyBase?: string;
  proxySecret?: string;
}

export async function fetchSafeInfo(
  args: FetchSafeInfoArgs,
): Promise<SafeInfoResponse> {
  const host = txServiceHostForChain(args.chainId);
  if (!host) throw new Error(`No tx-service host for chainId ${args.chainId}`);
  const path = `/api/v1/safes/${args.safeAddress}/`;
  const url = args.proxyBase
    ? `${args.proxyBase}?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`
    : `https://${host}${path}`;
  const doFetch = args.fetcher ?? fetch;
  const res = await doFetch(url, {
    method: 'GET',
    headers: args.proxySecret ? { 'x-proxy-secret': args.proxySecret } : {},
  });
  if (!res.ok) {
    throw new Error(`safe tx-service (safes): ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SafeInfoResponse;
}
