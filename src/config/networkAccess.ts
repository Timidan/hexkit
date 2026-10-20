import { ethers } from 'ethers';
import type { Chain } from '../types';
import { PUBLIC_ARCHIVE_RPC_FALLBACKS } from '../chains/registry';
import {
  networkConfigManager,
  type AbiSourceType,
  type RpcResolution,
} from './networkConfig';

// A transport failure (refused, timed out, unreachable). A node's own JSON-RPC error,
// such as a revert, arrives as "processing response error" and is a real answer.
const isUnavailable = (err: any): boolean =>
  err?.code === 'TIMEOUT' ||
  (err?.code === 'SERVER_ERROR' &&
    (err.reason !== 'processing response error' ||
      /\b429\b|rate limit/i.test(String(err.error?.message ?? ''))));

/**
 * The app's public default RPC. Public endpoints refuse or stall under load, so a call
 * that gets no answer moves to the next archive-capable public RPC instead of waiting
 * out a 429 back-off. A user's own RPC never gets here.
 */
export class PublicRpcProvider extends ethers.providers.StaticJsonRpcProvider {
  private readonly fallbacks: ethers.providers.StaticJsonRpcProvider[];

  constructor(urls: string[], network: ethers.providers.Networkish, timeout = 30_000) {
    const [primary, ...rest] = urls.map((url) => ({
      url,
      timeout,
      allowGzip: true,
      throttleCallback: async () => false,
    }));
    super(primary, network);
    this.fallbacks = rest.map((connection) => new ethers.providers.StaticJsonRpcProvider(connection, network));
  }

  async send(method: string, params: Array<any>): Promise<any> {
    try {
      return await super.send(method, params);
    } catch (err) {
      let last = err;
      for (const provider of this.fallbacks) {
        if (!isUnavailable(last)) break;
        try {
          return await provider.send(method, params);
        } catch (next) {
          last = next;
        }
      }
      throw last;
    }
  }
}

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
    chain: Pick<Chain, 'id' | 'name'>,
    fallbackUrls?: string[]
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

      const provider = dependencies.providerFactory(
        resolution.url,
        chain,
        resolution.mode === 'DEFAULT' ? PUBLIC_ARCHIVE_RPC_FALLBACKS[chain.id] : undefined
      );
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
  providerFactory: (url, chain, fallbackUrls) =>
    fallbackUrls?.length
      ? new PublicRpcProvider([url, ...fallbackUrls], { name: chain.name, chainId: chain.id })
      : new ethers.providers.StaticJsonRpcProvider(
          { url, timeout: 30_000, allowGzip: true },
          { name: chain.name, chainId: chain.id }
        ),
  getSourcePriority: () => networkConfigManager.getSourcePriority(),
  getEtherscanApiKey: (chainId) =>
    networkConfigManager.getEtherscanApiKey(chainId),
  getBlockscoutApiKey: () => networkConfigManager.getBlockscoutApiKey(),
});
