import type { Chain } from '../types';

// Supported API providers and their coverage
export const API_PROVIDERS = {
  ETHERSCAN: {
    name: 'Etherscan',
    key: 'etherscan',
    website: 'https://etherscan.io/apis',
    description: 'Works for ALL supported EVM chains (Ethereum, Polygon, BSC, Arbitrum, etc.)',
    supportedChains: [1, 137, 56, 42161], // All our supported chains use Etherscan-compatible APIs
    instructions: [
      'Visit etherscan.io/apis',
      'Create a free account',
      'Generate an API key',
      'This ONE key works across ALL EVM chains in our toolkit'
    ]
  },
  BLOCKSCOUT: {
    name: 'Blockscout',
    key: 'blockscout',
    website: 'https://blockscout.com',
    description: 'Alternative explorer for various EVM chains',
    supportedChains: [1, 100, 56], // Ethereum, Gnosis Chain, BSC
    instructions: [
      'Blockscout instances usually don\'t require API keys',
      'Some instances may have rate limits',
      'Leave empty unless you have a specific Blockscout API key'
    ]
  }
} as const;

export type ApiProviderKey = keyof typeof API_PROVIDERS;

interface StoredUniversalAPIKeys {
  [providerKey: string]: string;
}

const UNIVERSAL_API_KEYS_STORAGE_KEY = 'web3-toolkit-universal-api-keys';

export class UniversalAPIKeyManager {
  private static instance: UniversalAPIKeyManager;
  private keys: StoredUniversalAPIKeys = {};

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): UniversalAPIKeyManager {
    if (!UniversalAPIKeyManager.instance) {
      UniversalAPIKeyManager.instance = new UniversalAPIKeyManager();
    }
    return UniversalAPIKeyManager.instance;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(UNIVERSAL_API_KEYS_STORAGE_KEY);
      if (stored) {
        this.keys = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load universal API keys from localStorage:', error);
      this.keys = {};
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(UNIVERSAL_API_KEYS_STORAGE_KEY, JSON.stringify(this.keys));
    } catch (error) {
      console.warn('Failed to save universal API keys to localStorage:', error);
    }
  }

  // Get API key for a specific provider
  getAPIKey(provider: ApiProviderKey): string | null {
    return this.keys[provider] || null;
  }

  // Set API key for a provider
  setAPIKey(provider: ApiProviderKey, apiKey: string): void {
    if (apiKey.trim()) {
      this.keys[provider] = apiKey.trim();
    } else {
      delete this.keys[provider];
    }
    this.saveToStorage();
  }

  // Check if we have an API key for a provider
  hasAPIKey(provider: ApiProviderKey): boolean {
    return !!this.getAPIKey(provider);
  }

  // Get the best API key for a specific chain
  getBestAPIKeyForChain(chain: Chain): { provider: ApiProviderKey; apiKey: string } | null {
    // Try Etherscan first as it supports the most chains
    if (API_PROVIDERS.ETHERSCAN.supportedChains.includes(chain.id as any)) {
      const etherscanKey = this.getAPIKey('ETHERSCAN');
      if (etherscanKey) {
        return { provider: 'ETHERSCAN', apiKey: etherscanKey };
      }
    }

    // Try Blockscout as fallback
    if (API_PROVIDERS.BLOCKSCOUT.supportedChains.includes(chain.id as any)) {
      const blockscoutKey = this.getAPIKey('BLOCKSCOUT');
      if (blockscoutKey) {
        return { provider: 'BLOCKSCOUT', apiKey: blockscoutKey };
      }
    }

    return null;
  }

  // Get all providers that support a specific chain
  getProvidersForChain(chain: Chain): ApiProviderKey[] {
    const providers: ApiProviderKey[] = [];
    
    Object.entries(API_PROVIDERS).forEach(([key, provider]) => {
      if (provider.supportedChains.includes(chain.id as any)) {
        providers.push(key as ApiProviderKey);
      }
    });

    return providers;
  }

  // Remove API key for a provider
  removeAPIKey(provider: ApiProviderKey): void {
    delete this.keys[provider];
    this.saveToStorage();
  }

  // Get status of all providers
  getAllProviderStatus(): { [K in ApiProviderKey]: { hasKey: boolean; name: string } } {
    return Object.fromEntries(
      Object.entries(API_PROVIDERS).map(([key, provider]) => [
        key,
        {
          hasKey: this.hasAPIKey(key as ApiProviderKey),
          name: provider.name
        }
      ])
    ) as { [K in ApiProviderKey]: { hasKey: boolean; name: string } };
  }

  // Clear all keys
  clearAllKeys(): void {
    this.keys = {};
    this.saveToStorage();
  }
}

export const universalApiKeyManager = UniversalAPIKeyManager.getInstance();