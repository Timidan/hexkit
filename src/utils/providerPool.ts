import { ethers } from 'ethers';
import type { Chain } from '../types';
import { networkConfigManager } from '../config/networkConfig';

interface CachedProviderEntry {
  provider: ethers.providers.JsonRpcProvider;
  url: string;
}

const providerCache = new Map<number, CachedProviderEntry>();

export const getSharedProvider = (chain: Chain): ethers.providers.JsonRpcProvider => {
  const resolution = networkConfigManager.resolveRpcUrl(chain.id, chain.rpcUrl);
  const cached = providerCache.get(chain.id);

  if (cached && cached.url === resolution.url) {
    return cached.provider;
  }

  // If no URL available and fallback not allowed, throw
  if (!resolution.url) {
    throw new Error(
      `No RPC URL available for chain ${chain.id} (${chain.name}). ` +
      (resolution.note || 'Configure an RPC provider in settings.')
    );
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
    (entry.provider as ethers.providers.JsonRpcProvider & { destroy?: () => void }).destroy?.();
  });
  providerCache.clear();
};
