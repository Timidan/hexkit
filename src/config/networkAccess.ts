import { ethers } from 'ethers';
import type { Chain } from '../types';
import {
  networkConfigManager,
  type AbiSourceType,
  type RpcResolution,
} from './networkConfig';

export class NetworkAccessError extends Error {
  readonly code = 'RPC_UNAVAILABLE';
  readonly chain: Pick<Chain, 'id' | 'name'>;

  constructor(chain: Pick<Chain, 'id' | 'name'>, note?: string) {
    super(
      `No RPC URL available for chain ${chain.id} (${chain.name}). ` +
        (note || 'Configure an RPC provider in settings.')
    );
    this.chain = chain;
    this.name = 'NetworkAccessError';
  }
}

interface DestroyableProvider extends ethers.providers.JsonRpcProvider {
  destroy?: () => void;
}

interface NetworkAccessDependencies {
  resolveRpcUrl: (chainId: number, defaultUrl?: string) => RpcResolution;
  providerFactory: (
    url: string,
    chain: Pick<Chain, 'id' | 'name'>
  ) => ethers.providers.JsonRpcProvider;
  getSourcePriority: () => AbiSourceType[];
  getEtherscanApiKey: (chainId?: number) => string | undefined;
  getBlockscoutApiKey: () => string | undefined;
}

export interface NetworkConnection {
  chain: Chain;
  resolution: RpcResolution;
  provider: ethers.providers.JsonRpcProvider;
}

export interface NetworkAccessModule {
  resolve(chain: Chain): RpcResolution;
  /** `url` pins the endpoint (e.g. a validated fallback) instead of resolving it from settings. */
  access(chain: Chain, url?: string): NetworkConnection;
  contractResolutionPolicy(chainId: number): {
    sourcePriority: AbiSourceType[];
    etherscanApiKey?: string;
    blockscoutApiKey?: string;
  };
  clear(): void;
}

export function createNetworkAccess(
  dependencies: NetworkAccessDependencies
): NetworkAccessModule {
  const providers = new Map<
    number,
    { url: string; provider: ethers.providers.JsonRpcProvider }
  >();

  const destroy = (provider: ethers.providers.JsonRpcProvider) => {
    (provider as DestroyableProvider).destroy?.();
  };

  return {
    resolve(chain) {
      return dependencies.resolveRpcUrl(chain.id, chain.rpcUrl);
    },

    access(chain, url) {
      const resolution: RpcResolution = url
        ? { url, mode: 'CUSTOM', isFallback: false }
        : dependencies.resolveRpcUrl(chain.id, chain.rpcUrl);
      if (!resolution.url) {
        throw new NetworkAccessError(chain, resolution.note);
      }

      const cached = providers.get(chain.id);
      if (cached?.url === resolution.url) {
        return { chain, resolution, provider: cached.provider };
      }
      if (cached) destroy(cached.provider);

      const provider = dependencies.providerFactory(resolution.url, chain);
      providers.set(chain.id, { url: resolution.url, provider });
      return { chain, resolution, provider };
    },

    contractResolutionPolicy(chainId) {
      return {
        sourcePriority: [...dependencies.getSourcePriority()],
        etherscanApiKey: dependencies.getEtherscanApiKey(chainId),
        blockscoutApiKey: dependencies.getBlockscoutApiKey(),
      };
    },

    clear() {
      for (const { provider } of providers.values()) destroy(provider);
      providers.clear();
    },
  };
}

export const networkAccess = createNetworkAccess({
  resolveRpcUrl: (chainId, defaultUrl) =>
    networkConfigManager.resolveRpcUrl(chainId, defaultUrl),
  // Static: the chain is known, so skip ethers v5's eth_chainId probe before every call.
  providerFactory: (url, chain) =>
    new ethers.providers.StaticJsonRpcProvider(
      { url, timeout: 30_000, allowGzip: true },
      { name: chain.name, chainId: chain.id }
    ),
  getSourcePriority: () => networkConfigManager.getSourcePriority(),
  getEtherscanApiKey: (chainId) =>
    networkConfigManager.getEtherscanApiKey(chainId),
  getBlockscoutApiKey: () => networkConfigManager.getBlockscoutApiKey(),
});
