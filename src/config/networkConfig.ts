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
export type ExplorerKeyMode = 'default' | 'personal';

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
  etherscanKeyMode: ExplorerKeyMode;
  rememberPersonalEtherscanKey: boolean;
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
const LOCAL_SECRETS_KEY = 'web3-toolkit:secrets';
const SESSION_SECRETS_KEY = 'web3-toolkit:session-secrets';
const LEGACY_SESSION_SECRETS_KEY = 'web3-toolkit:secrets';
const CONFIG_VERSION = 3;
const DEFAULT_SOURCE_PRIORITY: AbiSourceType[] = ['etherscan', 'sourcify', 'blockscout'];
const LEGACY_SOURCE_PRIORITY: AbiSourceType[] = ['sourcify', 'etherscan', 'blockscout'];

// Old storage keys for migration
const OLD_RPC_SETTINGS_KEY = 'web3-toolkit:user-rpc-settings';
const OLD_UNIVERSAL_API_KEYS_KEY = 'web3-toolkit-universal-api-keys';

// Fields that count as secrets and are stored outside the public config blob.
const SECRET_FIELDS = [
  'alchemyApiKey',
  'infuraProjectId',
  'etherscanApiKey',
  'blockscoutApiKey',
] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

const DEFAULT_CONFIG: NetworkConfig = {
  rpcMode: 'DEFAULT',
  etherscanKeyMode: 'default',
  rememberPersonalEtherscanKey: false,
  sourcePriority: DEFAULT_SOURCE_PRIORITY,
  allowPublicRpcFallback: false,
  version: CONFIG_VERSION,
};

function matchesSourcePriority(
  value: AbiSourceType[] | undefined,
  expected: AbiSourceType[]
): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    expected.every((entry, index) => value[index] === entry);
}

function migrateConfigShape(config: NetworkConfig): NetworkConfig {
  const version = typeof config.version === 'number' ? config.version : 0;
  if (version >= CONFIG_VERSION) {
    return config;
  }

  const migrated = { ...config, version: CONFIG_VERSION };
  if (!config.sourcePriority || matchesSourcePriority(config.sourcePriority, LEGACY_SOURCE_PRIORITY)) {
    migrated.sourcePriority = [...DEFAULT_SOURCE_PRIORITY];
  }
  return migrated;
}

function parseStoredSecrets(
  raw: string | null
): Partial<Pick<NetworkConfig, SecretField>> {
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Partial<Pick<NetworkConfig, SecretField>>;
  } catch {
    try {
      const decoded = decodeURIComponent(escape(atob(raw)));
      return JSON.parse(decoded) as Partial<Pick<NetworkConfig, SecretField>>;
    } catch {
      return {};
    }
  }
}

function readSecretsFromStorage(
  storage: Storage | undefined,
  storageKey: string
): Partial<Pick<NetworkConfig, SecretField>> {
  if (!storage) {
    return {};
  }

  try {
    return parseStoredSecrets(storage.getItem(storageKey));
  } catch {
    return {};
  }
}

function writeSecretsToStorage(
  storage: Storage | undefined,
  storageKey: string,
  secrets: Partial<Pick<NetworkConfig, SecretField>>
): void {
  if (!storage) {
    return;
  }

  try {
    if (Object.keys(secrets).length === 0) {
      storage.removeItem(storageKey);
      return;
    }

    storage.setItem(storageKey, JSON.stringify(secrets));
  } catch {
    // ignore unavailable storage
  }
}

function splitSecretsByStorage(
  secrets: Partial<Pick<NetworkConfig, SecretField>>,
  config: Pick<NetworkConfig, 'rememberPersonalEtherscanKey'>
): {
  localSecrets: Partial<Pick<NetworkConfig, SecretField>>;
  sessionSecrets: Partial<Pick<NetworkConfig, SecretField>>;
} {
  const localSecrets: Partial<Pick<NetworkConfig, SecretField>> = {};
  const sessionSecrets: Partial<Pick<NetworkConfig, SecretField>> = {};

  for (const field of SECRET_FIELDS) {
    const value = secrets[field]?.trim();
    if (!value) {
      continue;
    }

    if (field === 'etherscanApiKey' && !config.rememberPersonalEtherscanKey) {
      sessionSecrets[field] = value;
      continue;
    }

    localSecrets[field] = value;
  }

  return { localSecrets, sessionSecrets };
}

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

function readSecrets(): Partial<Pick<NetworkConfig, SecretField>> {
  if (typeof window === 'undefined') {
    return {};
  }

  return {
    ...readSecretsFromStorage(window.localStorage, LOCAL_SECRETS_KEY),
    ...readSecretsFromStorage(window.sessionStorage, SESSION_SECRETS_KEY),
  };
}

function writeSecrets(
  secrets: Partial<Pick<NetworkConfig, SecretField>>,
  config: Pick<NetworkConfig, 'rememberPersonalEtherscanKey'>
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const { localSecrets, sessionSecrets } = splitSecretsByStorage(secrets, config);
  writeSecretsToStorage(window.localStorage, LOCAL_SECRETS_KEY, localSecrets);
  writeSecretsToStorage(window.sessionStorage, SESSION_SECRETS_KEY, sessionSecrets);
}

function migrateSecretsToMemory(): void {
  if (typeof window === 'undefined') return;

  const rawConfig = window.localStorage.getItem(STORAGE_KEY);
  let parsedConfig: NetworkConfig | null = null;

  if (rawConfig) {
    try {
      parsedConfig = JSON.parse(rawConfig) as NetworkConfig;
    } catch {
      parsedConfig = null;
    }
  }

  const legacySessionSecrets = readSecretsFromStorage(
    window.sessionStorage,
    LEGACY_SESSION_SECRETS_KEY
  );
  const localSecrets = readSecretsFromStorage(window.localStorage, LOCAL_SECRETS_KEY);
  const embeddedSecrets = parsedConfig ? extractSecrets(parsedConfig) : {};
  const mergedSecrets = {
    ...localSecrets,
    ...legacySessionSecrets,
    ...embeddedSecrets,
  };
  const effectiveConfig: NetworkConfig = {
    ...DEFAULT_CONFIG,
    ...(parsedConfig ? migrateConfigShape(parsedConfig) : {}),
    ...(!parsedConfig?.etherscanKeyMode && mergedSecrets.etherscanApiKey
      ? { etherscanKeyMode: 'personal' as const }
      : {}),
  };

  if (Object.keys(mergedSecrets).length > 0) {
    writeSecrets(mergedSecrets, effectiveConfig);
  }

  if (legacySessionSecrets && Object.keys(legacySessionSecrets).length > 0) {
    window.sessionStorage.removeItem(LEGACY_SESSION_SECRETS_KEY);
  }

  if (parsedConfig) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(stripSecrets({ ...effectiveConfig, ...mergedSecrets }))
    );
  }
}

// Alchemy chain support
const ALCHEMY_ENDPOINTS: Record<number, (key: string) => string> = {
  1: (key) => `https://eth-mainnet.g.alchemy.com/v2/${key}`,
  11155111: (key) => `https://eth-sepolia.g.alchemy.com/v2/${key}`,
  17000: (key) => `https://eth-holesky.g.alchemy.com/v2/${key}`,
  8453: (key) => `https://base-mainnet.g.alchemy.com/v2/${key}`,
  84532: (key) => `https://base-sepolia.g.alchemy.com/v2/${key}`,
  137: (key) => `https://polygon-mainnet.g.alchemy.com/v2/${key}`,
  80002: (key) => `https://polygon-amoy.g.alchemy.com/v2/${key}`,
  42161: (key) => `https://arb-mainnet.g.alchemy.com/v2/${key}`,
  421614: (key) => `https://arb-sepolia.g.alchemy.com/v2/${key}`,
  10: (key) => `https://opt-mainnet.g.alchemy.com/v2/${key}`,
  11155420: (key) => `https://opt-sepolia.g.alchemy.com/v2/${key}`,
  56: (key) => `https://bnb-mainnet.g.alchemy.com/v2/${key}`,
  97: (key) => `https://bnb-testnet.g.alchemy.com/v2/${key}`,
  43114: (key) => `https://avax-mainnet.g.alchemy.com/v2/${key}`,
  100: (key) => `https://gnosis-mainnet.g.alchemy.com/v2/${key}`,
  4202: (key) => `https://lisk-sepolia.g.alchemy.com/v2/${key}`,
};

// Infura chain support
const INFURA_ENDPOINTS: Record<number, (key: string) => string> = {
  1: (key) => `https://mainnet.infura.io/v3/${key}`,
  11155111: (key) => `https://sepolia.infura.io/v3/${key}`,
  17000: (key) => `https://holesky.infura.io/v3/${key}`,
  8453: (key) => `https://base-mainnet.infura.io/v3/${key}`,
  84532: (key) => `https://base-sepolia.infura.io/v3/${key}`,
  137: (key) => `https://polygon-mainnet.infura.io/v3/${key}`,
  80002: (key) => `https://polygon-amoy.infura.io/v3/${key}`,
  42161: (key) => `https://arbitrum-mainnet.infura.io/v3/${key}`,
  421614: (key) => `https://arbitrum-sepolia.infura.io/v3/${key}`,
  10: (key) => `https://optimism-mainnet.infura.io/v3/${key}`,
  11155420: (key) => `https://optimism-sepolia.infura.io/v3/${key}`,
  56: (key) => `https://bsc-mainnet.infura.io/v3/${key}`,
  97: (key) => `https://bsc-testnet.infura.io/v3/${key}`,
  43114: (key) => `https://avalanche-mainnet.infura.io/v3/${key}`,
  100: (key) => `https://gnosis-mainnet.infura.io/v3/${key}`,
  4202: (key) => `https://lisk-sepolia.infura.io/v3/${key}`,
};

// Public RPC fallbacks — archival-capable free endpoints (may be rate-limited)
const PUBLIC_RPC_FALLBACKS: Record<number, string> = {
  1: 'https://ethereum-rpc.publicnode.com',
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
  8453: 'https://base-rpc.publicnode.com',
  84532: 'https://base-sepolia-rpc.publicnode.com',
  137: 'https://polygon-bor-rpc.publicnode.com',
  80002: 'https://polygon-amoy-bor-rpc.publicnode.com',
  17000: 'https://holesky.rpc.thirdweb.com',
  4202: 'https://rpc.sepolia-api.lisk.com',
  42161: 'https://arbitrum-one-rpc.publicnode.com',
  421614: 'https://arbitrum-sepolia-rpc.publicnode.com',
  10: 'https://optimism-rpc.publicnode.com',
  11155420: 'https://sepolia.optimism.io',
  56: 'https://bsc-dataseed.binance.org',
  97: 'https://bsc-testnet-rpc.publicnode.com',
  43114: 'https://api.avax.network/ext/bc/C/rpc',
  100: 'https://rpc.gnosischain.com',
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
    etherscanKeyMode:
      oldRpc.etherscanKey?.trim() || oldApiKeys.ETHERSCAN?.trim()
        ? 'personal'
        : 'default',
    rememberPersonalEtherscanKey: false,
    blockscoutApiKey: oldApiKeys.BLOCKSCOUT?.trim() || undefined,
  };

  // Save migrated config: non-sensitive config in localStorage, secrets in mode-specific storage
  writeSecrets(extractSecrets(migrated), migrated);
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
    // Even with no config blob, persisted secrets may exist
    const secrets = readSecrets();
    return {
      ...DEFAULT_CONFIG,
      ...secrets,
      ...(secrets.etherscanApiKey ? { etherscanKeyMode: 'personal' as const } : {}),
    };
  }

  try {
    const parsed = migrateConfigShape(JSON.parse(raw) as NetworkConfig);
    // Merge persisted secrets on top
    const secrets = readSecrets();
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      ...secrets,
      ...(!parsed.etherscanKeyMode && secrets.etherscanApiKey
        ? { etherscanKeyMode: 'personal' as const }
        : {}),
    };
  } catch {
    return { ...DEFAULT_CONFIG, ...readSecrets() };
  }
}

function writeConfig(config: NetworkConfig): void {
  if (typeof window === 'undefined') return;

  const toSave: NetworkConfig = {
    ...config,
    version: CONFIG_VERSION,
  };

  // Split: non-sensitive config in localStorage, secrets in local/session storage by mode
  writeSecrets(extractSecrets(toSave), toSave);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stripSecrets(toSave)));
  window.dispatchEvent(new CustomEvent('network-config-updated'));
}

function autoSwitchProviderModeToDefault(
  config: NetworkConfig,
  providerLabel: 'Alchemy' | 'Infura',
  fallbackUrl: string
): RpcResolution {
  const note = fallbackUrl
    ? `${providerLabel} was selected without an API key. Switched back to App Default RPC.`
    : `${providerLabel} was selected without an API key. Switched back to App Default RPC, but no default RPC is configured for this network.`;

  if (typeof window !== 'undefined') {
    window.localStorage.setItem('web3-toolkit:rpc-auto-switch-notice', note);
    window.sessionStorage.setItem('web3-toolkit:rpc-auto-switch-notice', note);
    window.dispatchEvent(
      new CustomEvent('network-config-auto-switched', {
        detail: { note, provider: providerLabel },
      })
    );
  }

  writeConfig({
    ...config,
    rpcMode: 'DEFAULT',
  });

  if (fallbackUrl) {
    return {
      url: fallbackUrl,
      mode: 'DEFAULT',
      isFallback: true,
      note,
    };
  }

  return {
    url: '',
    mode: 'DEFAULT',
    isFallback: true,
    note,
  };
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

// On first load, normalize legacy secret storage into the current local/session split.
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

      if (!apiKey) {
        return autoSwitchProviderModeToDefault(config, 'Alchemy', fallbackUrl);
      }

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

      if (!projectId) {
        return autoSwitchProviderModeToDefault(config, 'Infura', fallbackUrl);
      }

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
   * Get the personal Etherscan API key when personal mode is enabled.
   */
  getEtherscanApiKey(chainId?: number): string | undefined {
    const config = readConfig();
    if (config.etherscanKeyMode !== 'personal') {
      return undefined;
    }

    // Check chain-specific override
    if (chainId && config.chainOverrides?.[chainId]?.etherscanApiKey) {
      return config.chainOverrides[chainId].etherscanApiKey?.trim() || undefined;
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
    localStorage.removeItem(LOCAL_SECRETS_KEY);
    sessionStorage.removeItem(SESSION_SECRETS_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_SECRETS_KEY);
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
