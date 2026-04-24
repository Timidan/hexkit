/**
 * Network Configuration Context
 *
 * React context wrapper for the unified network configuration manager.
 * Provides hooks for components to access and react to config changes.
 *
 * All components that need network settings MUST use this context
 * instead of direct localStorage access.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type AbiSourceType,
  type NetworkConfig,
  type RpcProviderMode,
  type RpcResolution,
  type SolanaCluster,
  type SolanaRpcConfig,
  type SolanaRpcResolution,
  type StarknetNetwork,
  type StarknetRpcConfig,
  type StarknetRpcResolution,
  networkConfigManager,
} from '../config/networkConfig';

interface NetworkConfigContextValue {
  // Current config state
  config: NetworkConfig;

  // Version counter for cache invalidation
  configVersion: number;

  // RPC resolution
  resolveRpcUrl: (chainId: number, defaultUrl?: string) => RpcResolution;
  resolveStarknetRpc: (network: StarknetNetwork) => StarknetRpcResolution;
  resolveSolanaRpc: (cluster: SolanaCluster) => SolanaRpcResolution;
  getRpcMode: () => RpcProviderMode;
  isFallbackAllowed: () => boolean;

  // API keys
  getEtherscanApiKey: (chainId?: number) => string | undefined;
  getBlockscoutApiKey: () => string | undefined;

  // Source priority
  getSourcePriority: () => AbiSourceType[];

  // Provider availability
  isAlchemyAvailable: (chainId: number) => boolean;
  isInfuraAvailable: (chainId: number) => boolean;

  // Config mutations
  saveConfig: (config: Partial<NetworkConfig>) => void;
  saveStarknetConfig: (patch: Partial<StarknetRpcConfig>) => void;
  saveSolanaConfig: (patch: Partial<SolanaRpcConfig>) => void;
  reset: () => void;

  // Setup acknowledgment (for UX gate)
  hasAcknowledgedDefaults: boolean;
  acknowledgeDefaults: () => void;
}

const NetworkConfigContext = createContext<NetworkConfigContextValue | undefined>(
  undefined
);

interface NetworkConfigProviderProps {
  children: React.ReactNode;
}

// Keys for localStorage
const DEFAULTS_ACK_KEY = 'web3-toolkit:rpc-defaults-ack';

const readAck = (): boolean => {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(DEFAULTS_ACK_KEY) === '1';
};

const writeAck = (): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEFAULTS_ACK_KEY, '1');
  window.dispatchEvent(new CustomEvent('rpc-defaults-acknowledged'));
};

export const NetworkConfigProvider: React.FC<NetworkConfigProviderProps> = ({
  children,
}) => {
  const [config, setConfig] = useState<NetworkConfig>(() =>
    networkConfigManager.getConfig()
  );
  const [configVersion, setConfigVersion] = useState(0);
  const [hasAcknowledgedDefaults, setHasAcknowledgedDefaults] = useState<boolean>(
    () => readAck()
  );

  // Listen for config changes (including from other tabs)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleConfigUpdate = () => {
      setConfig(networkConfigManager.getConfig());
      setConfigVersion((prev) => prev + 1);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'web3-toolkit:network-config') {
        handleConfigUpdate();
      }
      if (event.key === DEFAULTS_ACK_KEY) {
        setHasAcknowledgedDefaults(readAck());
      }
    };

    const handleAck = () => setHasAcknowledgedDefaults(true);

    window.addEventListener('network-config-updated', handleConfigUpdate);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('rpc-defaults-acknowledged', handleAck);

    return () => {
      window.removeEventListener('network-config-updated', handleConfigUpdate);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('rpc-defaults-acknowledged', handleAck);
    };
  }, []);

  const acknowledgeDefaults = useCallback(() => {
    writeAck();
    setHasAcknowledgedDefaults(true);
  }, []);

  // Memoized methods
  const resolveRpcUrl = useCallback(
    (chainId: number, defaultUrl?: string): RpcResolution => {
      return networkConfigManager.resolveRpcUrl(chainId, defaultUrl);
    },
    [configVersion]
  );

  const resolveStarknetRpc = useCallback(
    (network: StarknetNetwork): StarknetRpcResolution => {
      return networkConfigManager.resolveStarknetRpc(network);
    },
    [configVersion]
  );

  const resolveSolanaRpc = useCallback(
    (cluster: SolanaCluster): SolanaRpcResolution => {
      return networkConfigManager.resolveSolanaRpc(cluster);
    },
    [configVersion]
  );

  const getRpcMode = useCallback((): RpcProviderMode => {
    return networkConfigManager.getRpcMode();
  }, [configVersion]);

  const isFallbackAllowed = useCallback((): boolean => {
    return networkConfigManager.isFallbackAllowed();
  }, [configVersion]);

  const getEtherscanApiKey = useCallback(
    (chainId?: number): string | undefined => {
      return networkConfigManager.getEtherscanApiKey(chainId);
    },
    [configVersion]
  );

  const getBlockscoutApiKey = useCallback((): string | undefined => {
    return networkConfigManager.getBlockscoutApiKey();
  }, [configVersion]);

  const getSourcePriority = useCallback((): AbiSourceType[] => {
    return networkConfigManager.getSourcePriority();
  }, [configVersion]);

  const isAlchemyAvailable = useCallback(
    (chainId: number): boolean => {
      return networkConfigManager.isAlchemyAvailable(chainId);
    },
    [configVersion]
  );

  const isInfuraAvailable = useCallback(
    (chainId: number): boolean => {
      return networkConfigManager.isInfuraAvailable(chainId);
    },
    [configVersion]
  );

  const saveConfig = useCallback((newConfig: Partial<NetworkConfig>) => {
    networkConfigManager.saveConfig(newConfig);
    setConfig(networkConfigManager.getConfig());
    setConfigVersion((prev) => prev + 1);
  }, []);

  const saveStarknetConfig = useCallback((patch: Partial<StarknetRpcConfig>) => {
    networkConfigManager.saveStarknetConfig(patch);
    setConfig(networkConfigManager.getConfig());
    setConfigVersion((prev) => prev + 1);
  }, []);

  const saveSolanaConfig = useCallback((patch: Partial<SolanaRpcConfig>) => {
    networkConfigManager.saveSolanaConfig(patch);
    setConfig(networkConfigManager.getConfig());
    setConfigVersion((prev) => prev + 1);
  }, []);

  const reset = useCallback(() => {
    networkConfigManager.reset();
    setConfig(networkConfigManager.getConfig());
    setConfigVersion((prev) => prev + 1);
  }, []);

  // Memoized context value
  const value = useMemo<NetworkConfigContextValue>(
    () => ({
      config,
      configVersion,
      resolveRpcUrl,
      resolveStarknetRpc,
      resolveSolanaRpc,
      getRpcMode,
      isFallbackAllowed,
      getEtherscanApiKey,
      getBlockscoutApiKey,
      getSourcePriority,
      isAlchemyAvailable,
      isInfuraAvailable,
      saveConfig,
      saveStarknetConfig,
      saveSolanaConfig,
      reset,
      hasAcknowledgedDefaults,
      acknowledgeDefaults,
    }),
    [
      config,
      configVersion,
      resolveRpcUrl,
      resolveStarknetRpc,
      resolveSolanaRpc,
      getRpcMode,
      isFallbackAllowed,
      getEtherscanApiKey,
      getBlockscoutApiKey,
      getSourcePriority,
      isAlchemyAvailable,
      isInfuraAvailable,
      saveConfig,
      saveStarknetConfig,
      saveSolanaConfig,
      reset,
      hasAcknowledgedDefaults,
      acknowledgeDefaults,
    ]
  );

  return (
    <NetworkConfigContext.Provider value={value}>
      {children}
    </NetworkConfigContext.Provider>
  );
};

/**
 * Hook to access the network configuration context.
 *
 * @throws Error if used outside of NetworkConfigProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { resolveRpcUrl, getEtherscanApiKey } = useNetworkConfig();
 *
 *   const rpc = resolveRpcUrl(1); // Ethereum mainnet
 *   const apiKey = getEtherscanApiKey(1);
 *
 *   // ...
 * }
 * ```
 */
export const useNetworkConfig = (): NetworkConfigContextValue => {
  const context = useContext(NetworkConfigContext);

  if (!context) {
    throw new Error(
      'useNetworkConfig must be used within NetworkConfigProvider'
    );
  }

  return context;
};

/**
 * Direct access to networkConfigManager for non-React code.
 * Prefer useNetworkConfig() hook in React components.
 */
export { networkConfigManager } from '../config/networkConfig';
