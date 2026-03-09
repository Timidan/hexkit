/**
 * Unified Network Configuration Manager
 *
 * Single source of truth for all network provider settings:
 * - RPC providers (Alchemy, Infura, Custom)
 * - Explorer API keys (Etherscan, Blockscout)
 * - ABI source priority (Sourcify, Etherscan, Blockscout)
 * - Fallback policies
 *
 * All components MUST use this module instead of direct localStorage access.
 */

export type RpcProviderMode = 'DEFAULT' | 'ALCHEMY' | 'INFURA' | 'CUSTOM';

export type AbiSourceType = 'sourcify' | 'etherscan' | 'blockscout';

interface ChainOverride {
  customRpcUrl?: string;
  etherscanApiKey?: string;
}

export interface NetworkConfig {
  // RPC Provider Settings
  rpcMode: RpcProviderMode;
  alchemyApiKey?: string;
  infuraProjectId?: string;
  customRpcUrl?: string;

  // Explorer API Keys
  etherscanApiKey?: string;
  blockscoutApiKey?: string;

  // ABI Source Priority (order matters)
  sourcePriority: AbiSourceType[];

  // Fallback Policy
  allowPublicRpcFallback: boolean;

  // Per-chain overrides (optional)
  chainOverrides?: Record<number, ChainOverride>;

  // Version for future migrations
  version: number;
}

export interface RpcResolution {
  url: string;
  mode: RpcProviderMode;
  isFallback: boolean;
  note?: string;
}

const STORAGE_KEY = 'web3-toolkit:network-config';
const SECRETS_KEY = 'web3-toolkit:secrets'; // sessionStorage key for cross-reload persistence
const CONFIG_VERSION = 1;

// In-memory secret cache — backed by sessionStorage for cross-reload persistence
const inMemorySecrets: Partial<Pick<NetworkConfig, SecretField>> = {};

// Old storage keys for migration
const OLD_RPC_SETTINGS_KEY = 'web3-toolkit:user-rpc-settings';
const OLD_UNIVERSAL_API_KEYS_KEY = 'web3-toolkit-universal-api-keys';

// Fields that count as secrets and go into sessionStorage
const SECRET_FIELDS = [
  'alchemyApiKey',
  'infuraProjectId',
  'etherscanApiKey',
  'blockscoutApiKey',
] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

/** Extract secret fields from a config object */
function extractSecrets(config: NetworkConfig): Partial<Pick<NetworkConfig, SecretField>> {
  const secrets: Partial<Pick<NetworkConfig, SecretField>> = {};
  for (const field of SECRET_FIELDS) {
    if (config[field]) secrets[field] = config[field];
  }
  return secrets;
}

/** Strip secret fields from a config object for localStorage */
function stripSecrets(config: NetworkConfig): NetworkConfig {
  const clean = { ...config };
  for (const field of SECRET_FIELDS) {
    delete clean[field];
  }
  // Also strip per-chain etherscanApiKey values
  if (clean.chainOverrides) {
    const cleanOverrides: Record<number, ChainOverride> = {};
    for (const [chainIdStr, override] of Object.entries(clean.chainOverrides)) {
      const { etherscanApiKey: _removed, ...rest } = override;
      if (Object.keys(rest).length > 0) {
        cleanOverrides[Number(chainIdStr)] = rest;
      }
    }
    clean.chainOverrides = Object.keys(cleanOverrides).length > 0 ? cleanOverrides : undefined;
  }
  return clean;
}

/** Read secrets from in-memory cache, hydrating from sessionStorage if needed */
function readSecrets(): Partial<Pick<NetworkConfig, SecretField>> {
  // If in-memory cache is populated, return it directly
  if (SECRET_FIELDS.some((f) => inMemorySecrets[f])) {
    return { ...inMemorySecrets };
  }
  // Hydrate from sessionStorage (survives page reload within same tab)
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(SECRETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Pick<NetworkConfig, SecretField>>;
        for (const field of SECRET_FIELDS) {
          if (parsed[field]) {
            (inMemorySecrets as Record<string, string>)[field] = parsed[field]!;
          }
        }
      }
    } catch {
      // ignore corrupted sessionStorage
    }
  }
  return { ...inMemorySecrets };
}

/** Write secrets to in-memory cache + sessionStorage for cross-reload persistence */
function writeSecrets(secrets: Partial<Pick<NetworkConfig, SecretField>>): void {
  for (const field of SECRET_FIELDS) {
    if (secrets[field]) {
      (inMemorySecrets as Record<string, string>)[field] = secrets[field]!;
    } else {
      // Delete cleared keys to prevent stale secrets
      delete (inMemorySecrets as Record<string, unknown>)[field];
    }
  }
  // Persist to sessionStorage (tab-scoped, auto-cleared on tab close)
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(SECRETS_KEY, JSON.stringify(inMemorySecrets));
    } catch {
      // sessionStorage may be unavailable
    }
  }
}

/** One-time migration: load secrets from sessionStorage + strip any from localStorage */
function migrateSecretsToMemory(): void {
  if (typeof window === 'undefined') return;
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return;

  // Load from sessionStorage into in-memory cache (keeps sessionStorage intact for persistence)
  try {
    const sessionRaw = sessionStorage.getItem(SECRETS_KEY);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw) as Partial<Pick<NetworkConfig, SecretField>>;
      for (const field of SECRET_FIELDS) {
        if (parsed[field]) {
          (inMemorySecrets as Record<string, string>)[field] = parsed[field]!;
        }
      }
    }
  } catch {
    // ignore corrupted sessionStorage
  }

  // Extract any secrets still in localStorage config blob and move to sessionStorage
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as NetworkConfig;
    const secrets = extractSecrets(parsed);
    if (Object.keys(secrets).length === 0) return;
    writeSecrets(secrets); // Writes to both in-memory + sessionStorage
    // Strip secrets from localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripSecrets(parsed)));
  } catch {
    // ignore — corrupted data
  }
}

const DEFAULT_CONFIG: NetworkConfig = {
  rpcMode: 'DEFAULT',
  sourcePriority: ['sourcify', 'etherscan', 'blockscout'],
  allowPublicRpcFallback: false,
  version: CONFIG_VERSION,
};

// Alchemy chain support
const ALCHEMY_ENDPOINTS: Record<number, (key: string) => string> = {
  1: (key) => `https://eth-mainnet.g.alchemy.com/v2/${key}`,
  11155111: (key) => `https://eth-sepolia.g.alchemy.com/v2/${key}`,
  8453: (key) => `https://base-mainnet.g.alchemy.com/v2/${key}`,
  84532: (key) => `https://base-sepolia.g.alchemy.com/v2/${key}`,
  137: (key) => `https://polygon-mainnet.g.alchemy.com/v2/${key}`,
  80002: (key) => `https://polygon-amoy.g.alchemy.com/v2/${key}`,
  42161: (key) => `https://arb-mainnet.g.alchemy.com/v2/${key}`,
  421614: (key) => `https://arb-sepolia.g.alchemy.com/v2/${key}`,
  10: (key) => `https://opt-mainnet.g.alchemy.com/v2/${key}`,
  11155420: (key) => `https://opt-sepolia.g.alchemy.com/v2/${key}`,
  43114: (key) => `https://avax-mainnet.g.alchemy.com/v2/${key}`,
};

// Infura chain support
const INFURA_ENDPOINTS: Record<number, (key: string) => string> = {
  1: (key) => `https://mainnet.infura.io/v3/${key}`,
  11155111: (key) => `https://sepolia.infura.io/v3/${key}`,
  8453: (key) => `https://base-mainnet.infura.io/v3/${key}`,
  84532: (key) => `https://base-sepolia.infura.io/v3/${key}`,
  137: (key) => `https://polygon-mainnet.infura.io/v3/${key}`,
  80002: (key) => `https://polygon-amoy.infura.io/v3/${key}`,
  42161: (key) => `https://arbitrum-mainnet.infura.io/v3/${key}`,
  421614: (key) => `https://arbitrum-sepolia.infura.io/v3/${key}`,
  10: (key) => `https://optimism-mainnet.infura.io/v3/${key}`,
  11155420: (key) => `https://optimism-sepolia.infura.io/v3/${key}`,
  43114: (key) => `https://avalanche-mainnet.infura.io/v3/${key}`,
};

// Public RPC fallbacks (used only when allowPublicRpcFallback is true)
const PUBLIC_RPC_FALLBACKS: Record<number, string> = {
  1: 'https://ethereum.publicnode.com',
  11155111: 'https://rpc.sepolia.ethpandaops.io',
  8453: 'https://mainnet.base.org',
  84532: 'https://sepolia.base.org',
  137: 'https://polygon-rpc.com',
  80002: 'https://rpc-amoy.polygon.technology',
  17000: 'https://ethereum-holesky.publicnode.com',
  4202: 'https://rpc.sepolia-api.lisk.com',
  42161: 'https://arb1.arbitrum.io/rpc',
  421614: 'https://sepolia-rollup.arbitrum.io/rpc',
  10: 'https://mainnet.optimism.io',
  11155420: 'https://sepolia.optimism.io',
  56: 'https://bsc-dataseed.binance.org/',
  97: 'https://bsc-testnet.public.blastapi.io',
  43114: 'https://api.avax.network/ext/bc/C/rpc',
};

interface OldRpcSettings {
  mode?: RpcProviderMode;
  alchemyKey?: string;
  infuraKey?: string;
  genericUrl?: string;
  etherscanKey?: string;
}

interface OldUniversalApiKeys {
  ETHERSCAN?: string;
  BLOCKSCOUT?: string;
}

function migrateFromOldSettings(): NetworkConfig | null {
  if (typeof window === 'undefined') return null;

  const oldRpcRaw = localStorage.getItem(OLD_RPC_SETTINGS_KEY);
  const oldApiKeysRaw = localStorage.getItem(OLD_UNIVERSAL_API_KEYS_KEY);

  if (!oldRpcRaw && !oldApiKeysRaw) return null;

  let oldRpc: OldRpcSettings = {};
  let oldApiKeys: OldUniversalApiKeys = {};

  try {
    if (oldRpcRaw) oldRpc = JSON.parse(oldRpcRaw);
  } catch {
    // ignore parse errors
  }

  try {
    if (oldApiKeysRaw) oldApiKeys = JSON.parse(oldApiKeysRaw);
  } catch {
    // ignore parse errors
  }

  // Merge old settings into new format
  const migrated: NetworkConfig = {
    ...DEFAULT_CONFIG,
    rpcMode: oldRpc.mode ?? 'DEFAULT',
    alchemyApiKey: oldRpc.alchemyKey?.trim() || undefined,
    infuraProjectId: oldRpc.infuraKey?.trim() || undefined,
    customRpcUrl: oldRpc.genericUrl?.trim() || undefined,
    etherscanApiKey: oldRpc.etherscanKey?.trim() || oldApiKeys.ETHERSCAN?.trim() || undefined,
    blockscoutApiKey: oldApiKeys.BLOCKSCOUT?.trim() || undefined,
  };

  // Save migrated config: secrets → sessionStorage, rest → localStorage
  writeSecrets(extractSecrets(migrated));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stripSecrets(migrated)));

  // Clean up old keys
  localStorage.removeItem(OLD_RPC_SETTINGS_KEY);
  localStorage.removeItem(OLD_UNIVERSAL_API_KEYS_KEY);

  return migrated;
}

function readConfig(): NetworkConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CONFIG };

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    // Try migrating from old settings
    const migrated = migrateFromOldSettings();
    if (migrated) return migrated;
    // Even with no localStorage config, session secrets may exist
    const secrets = readSecrets();
    return { ...DEFAULT_CONFIG, ...secrets };
  }

  try {
    const parsed = JSON.parse(raw) as NetworkConfig;
    // Merge secrets from sessionStorage on top
    const secrets = readSecrets();
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      ...secrets,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config: NetworkConfig): void {
  if (typeof window === 'undefined') return;

  const toSave: NetworkConfig = {
    ...config,
    version: CONFIG_VERSION,
  };

  // Split: secrets → sessionStorage, rest → localStorage
  writeSecrets(extractSecrets(toSave));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stripSecrets(toSave)));
  window.dispatchEvent(new CustomEvent('network-config-updated'));
}

/** Private/reserved IP ranges that should be rejected for user-supplied RPC URLs */
const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/10\.\d+\.\d+\.\d+/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,
  /^https?:\/\/192\.168\.\d+\.\d+/i,
  /^https?:\/\/169\.254\.\d+\.\d+/i, // Link-local / AWS metadata
  /^https?:\/\/0\.0\.0\.0/i,
];

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/** Validate that a user-supplied RPC URL is not targeting private/reserved IP ranges */
function isUrlSafeFromSsrf(url: string): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  // Reject private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(normalized)) return false;
  }
  return true;
}

// On first load, migrate secrets from localStorage/sessionStorage into in-memory store
migrateSecretsToMemory();

export const networkConfigManager = {
  /**
   * Get the current network configuration
   */
  getConfig(): NetworkConfig {
    return readConfig();
  },

  /**
   * Save network configuration
   */
  saveConfig(config: Partial<NetworkConfig>): void {
    const current = readConfig();
    writeConfig({
      ...current,
      ...config,
    });
  },

  /**
   * Resolve the RPC URL for a given chain
   */
  resolveRpcUrl(chainId: number, defaultUrl?: string): RpcResolution {
    const config = readConfig();
    const fallbackUrl = defaultUrl || PUBLIC_RPC_FALLBACKS[chainId] || '';

    // Check for per-chain override first
    const chainOverride = config.chainOverrides?.[chainId];
    if (chainOverride?.customRpcUrl) {
      return {
        url: normalizeUrl(chainOverride.customRpcUrl),
        mode: 'CUSTOM',
        isFallback: false,
      };
    }

    // Handle CUSTOM mode
    if (config.rpcMode === 'CUSTOM') {
      const customUrl = config.customRpcUrl?.trim();
      if (customUrl) {
        return {
          url: normalizeUrl(customUrl),
          mode: 'CUSTOM',
          isFallback: false,
        };
      }
      // No custom URL configured
      if (config.allowPublicRpcFallback && fallbackUrl) {
        return {
          url: fallbackUrl,
          mode: 'DEFAULT',
          isFallback: true,
          note: 'Custom RPC selected but not configured. Using public fallback.',
        };
      }
      return {
        url: '',
        mode: 'CUSTOM',
        isFallback: false,
        note: 'Custom RPC selected but not configured. No fallback allowed.',
      };
    }

    // Handle ALCHEMY mode
    if (config.rpcMode === 'ALCHEMY') {
      const apiKey = config.alchemyApiKey?.trim();
      const builder = ALCHEMY_ENDPOINTS[chainId];

      if (apiKey && builder) {
        return {
          url: builder(apiKey),
          mode: 'ALCHEMY',
          isFallback: false,
        };
      }

      // Alchemy not available for this chain or no key
      if (config.allowPublicRpcFallback && fallbackUrl) {
        return {
          url: fallbackUrl,
          mode: 'DEFAULT',
          isFallback: true,
          note: apiKey
            ? `Alchemy does not support chain ${chainId}. Using public fallback.`
            : 'Alchemy API key not configured. Using public fallback.',
        };
      }

      return {
        url: '',
        mode: 'ALCHEMY',
        isFallback: false,
        note: apiKey
          ? `Alchemy does not support chain ${chainId}. No fallback allowed.`
          : 'Alchemy API key not configured. No fallback allowed.',
      };
    }

    // Handle INFURA mode
    if (config.rpcMode === 'INFURA') {
      const projectId = config.infuraProjectId?.trim();
      const builder = INFURA_ENDPOINTS[chainId];

      if (projectId && builder) {
        return {
          url: builder(projectId),
          mode: 'INFURA',
          isFallback: false,
        };
      }

      // Infura not available for this chain or no key
      if (config.allowPublicRpcFallback && fallbackUrl) {
        return {
          url: fallbackUrl,
          mode: 'DEFAULT',
          isFallback: true,
          note: projectId
            ? `Infura does not support chain ${chainId}. Using public fallback.`
            : 'Infura Project ID not configured. Using public fallback.',
        };
      }

      return {
        url: '',
        mode: 'INFURA',
        isFallback: false,
        note: projectId
          ? `Infura does not support chain ${chainId}. No fallback allowed.`
          : 'Infura Project ID not configured. No fallback allowed.',
      };
    }

    // DEFAULT mode - use public RPC
    return {
      url: fallbackUrl,
      mode: 'DEFAULT',
      isFallback: false,
    };
  },

  /**
   * Get Etherscan API key (chain-specific override or global)
   */
  getEtherscanApiKey(chainId?: number): string | undefined {
    const config = readConfig();

    // Check chain-specific override
    if (chainId && config.chainOverrides?.[chainId]?.etherscanApiKey) {
      return config.chainOverrides[chainId].etherscanApiKey;
    }

    return config.etherscanApiKey?.trim() || undefined;
  },

  /**
   * Get Blockscout API key
   */
  getBlockscoutApiKey(): string | undefined {
    const config = readConfig();
    return config.blockscoutApiKey?.trim() || undefined;
  },

  /**
   * Get ABI source priority order
   */
  getSourcePriority(): AbiSourceType[] {
    const config = readConfig();
    return config.sourcePriority || DEFAULT_CONFIG.sourcePriority;
  },

  /**
   * Check if public RPC fallback is allowed
   */
  isFallbackAllowed(): boolean {
    const config = readConfig();
    return config.allowPublicRpcFallback ?? true;
  },

  /**
   * Get the current RPC mode
   */
  getRpcMode(): RpcProviderMode {
    const config = readConfig();
    return config.rpcMode || 'DEFAULT';
  },

  /**
   * Check if Alchemy is configured and supports a chain
   */
  isAlchemyAvailable(chainId: number): boolean {
    const config = readConfig();
    return !!(config.alchemyApiKey?.trim() && ALCHEMY_ENDPOINTS[chainId]);
  },

  /**
   * Check if Infura is configured and supports a chain
   */
  isInfuraAvailable(chainId: number): boolean {
    const config = readConfig();
    return !!(config.infuraProjectId?.trim() && INFURA_ENDPOINTS[chainId]);
  },

  /**
   * Get supported chain IDs for a provider
   */
  getSupportedChains(provider: 'alchemy' | 'infura'): number[] {
    if (provider === 'alchemy') {
      return Object.keys(ALCHEMY_ENDPOINTS).map(Number);
    }
    return Object.keys(INFURA_ENDPOINTS).map(Number);
  },

  /**
   * Clear all settings and reset to defaults
   */
  reset(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SECRETS_KEY); // Clean up legacy
    // Clear in-memory secrets
    for (const field of SECRET_FIELDS) {
      delete (inMemorySecrets as Record<string, unknown>)[field];
    }
    window.dispatchEvent(new CustomEvent('network-config-updated'));
  },
};

export const isValidRpcUrl = (value: string): boolean => {
  const trimmed = normalizeUrl(value);
  if (!/^https?:\/\//i.test(trimmed)) return false;
  // Allow localhost for development
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(trimmed)) return true;
  // Reject private IP ranges for non-localhost
  return isUrlSafeFromSsrf(trimmed);
};

