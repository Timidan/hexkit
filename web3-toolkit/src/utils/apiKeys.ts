import type { Chain } from '../types';

interface StoredAPIKeys {
  [chainId: string]: string;
}

const API_KEYS_STORAGE_KEY = 'web3-toolkit-api-keys';

export class APIKeyManager {
  private static instance: APIKeyManager;
  private keys: StoredAPIKeys = {};

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): APIKeyManager {
    if (!APIKeyManager.instance) {
      APIKeyManager.instance = new APIKeyManager();
    }
    return APIKeyManager.instance;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(API_KEYS_STORAGE_KEY);
      if (stored) {
        this.keys = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load API keys from localStorage:', error);
      this.keys = {};
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(this.keys));
    } catch (error) {
      console.warn('Failed to save API keys to localStorage:', error);
    }
  }

  getAPIKey(chain: Chain): string | null {
    return this.keys[chain.id.toString()] || null;
  }

  setAPIKey(chain: Chain, apiKey: string): void {
    if (apiKey.trim()) {
      this.keys[chain.id.toString()] = apiKey.trim();
    } else {
      delete this.keys[chain.id.toString()];
    }
    this.saveToStorage();
  }

  hasAPIKey(chain: Chain): boolean {
    return !!this.getAPIKey(chain);
  }

  removeAPIKey(chain: Chain): void {
    delete this.keys[chain.id.toString()];
    this.saveToStorage();
  }

  getAllStoredKeys(): { [chainName: string]: boolean } {
    const result: { [chainName: string]: boolean } = {};
    Object.keys(this.keys).forEach(chainId => {
      result[`Chain ${chainId}`] = !!this.keys[chainId];
    });
    return result;
  }

  clearAllKeys(): void {
    this.keys = {};
    this.saveToStorage();
  }
}

export const apiKeyManager = APIKeyManager.getInstance();