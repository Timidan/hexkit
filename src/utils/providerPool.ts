import { ethers } from 'ethers';
import type { Chain } from '../types';
import { userRpcManager } from './userRpc';

interface CachedProviderEntry {
  provider: ethers.providers.JsonRpcProvider;
  url: string;
}

const providerCache = new Map<number, CachedProviderEntry>();

export const getSharedProvider = (chain: Chain): ethers.providers.JsonRpcProvider => {
  const resolution = userRpcManager.getEffectiveRpcUrl(chain, chain.rpcUrl);
  const cached = providerCache.get(chain.id);

  if (cached && cached.url === resolution.url) {
    return cached.provider;
  }

  const provider = new ethers.providers.JsonRpcProvider(resolution.url, {
    name: chain.name,
    chainId: chain.id,
  });

  providerCache.set(chain.id, {
    provider,
    url: resolution.url,
  });

  return provider;
};

export const clearProviderCache = () => {
  providerCache.forEach((entry) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry.provider as any).destroy?.();
  });
  providerCache.clear();
};
