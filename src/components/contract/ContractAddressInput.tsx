import React, { useMemo } from "react";
import { Search } from "lucide-react";
import { ethers } from "ethers";
import { Button, ErrorDisplay, Badge } from "../shared";
import NetworkSelector, {
  EXTENDED_NETWORKS,
  type ExtendedChain,
} from "../shared/NetworkSelector";
import type { Chain } from "../../types";
import "../../styles/ContractComponents.css";

const DEFAULT_NATIVE_CURRENCY = {
  name: "Ether",
  symbol: "ETH",
  decimals: 18,
};

const mapChainToExtended = (chain: Chain): ExtendedChain => {
  const match = EXTENDED_NETWORKS.find((network) => network.id === chain.id);
  if (match) {
    return match;
  }

  return {
    id: chain.id,
    name: chain.name,
    rpcUrl: chain.rpcUrl,
    blockExplorer: chain.blockExplorer || chain.explorerUrl,
    isTestnet: false,
    category: "mainnet",
  };
};

const mapExtendedToChain = (
  extended: ExtendedChain,
  fallbackChains: Chain[],
  current?: Chain | null
): Chain => {
  const matched = fallbackChains.find((chain) => chain.id === extended.id);
  if (matched) {
    return matched;
  }

  return {
    id: extended.id,
    name: extended.name,
    rpcUrl: extended.rpcUrl ?? current?.rpcUrl ?? "",
    explorerUrl: extended.blockExplorer ?? current?.explorerUrl ?? "",
    blockExplorer: extended.blockExplorer ?? current?.blockExplorer ?? "",
    apiUrl: current?.apiUrl ?? "",
    explorers: current?.explorers ?? [],
    nativeCurrency: current?.nativeCurrency ?? DEFAULT_NATIVE_CURRENCY,
  };
};

export interface ContractAddressInputProps {
  contractAddress: string;
  onAddressChange: (address: string) => void;
  selectedNetwork: Chain | null;
  onNetworkChange: (network: Chain) => void;
  supportedChains: Chain[];
  isLoading?: boolean;
  error?: string | null;
  onFetchABI?: () => void;
  contractName?: string;
  abiSource?:
    | "sourcify"
    | "blockscout"
    | "etherscan"
    | "blockscout-bytecode"
    | "manual"
    | null;
  tokenInfo?: {
    symbol?: string;
    name?: string;
    decimals?: number;
  } | null;
  className?: string;
}

const ContractAddressInput: React.FC<ContractAddressInputProps> = ({
  contractAddress,
  onAddressChange,
  selectedNetwork,
  onNetworkChange,
  supportedChains,
  isLoading = false,
  error,
  onFetchABI,
  contractName,
  abiSource,
  tokenInfo,
  className = "",
}) => {
  const extendedNetworks = useMemo<ExtendedChain[]>(
    () => supportedChains.map(mapChainToExtended),
    [supportedChains]
  );

  const selectedExtendedNetwork = useMemo<ExtendedChain | null>(() => {
    if (!selectedNetwork) return null;
    return (
      extendedNetworks.find((network) => network.id === selectedNetwork.id) ??
      mapChainToExtended(selectedNetwork)
    );
  }, [extendedNetworks, selectedNetwork]);

  const trimmedAddress = contractAddress?.trim() || "";
  const isValidAddress =
    trimmedAddress && ethers.utils.isAddress(trimmedAddress);

  const formatAbiSource = (
    source: NonNullable<ContractAddressInputProps["abiSource"]>
  ) => {
    if (source === "blockscout-bytecode") {
      return "blockscout-ebytecode";
    }
    return source;
  };

  return (
    <div className={`contract-address-input-container ${className}`}>
      <label className="contract-endpoint-label">Contract Address</label>
      <div className="contract-endpoint-row">
        <div className="decoder-address-wrapper has-selector">
          <div className="decoder-address-field decoder-address-field--contract">
            <input
              className="decoder-address-field__input"
              type="text"
              value={contractAddress}
              onChange={(event) => onAddressChange(event.target.value)}
              placeholder="0x..."
            />
            <NetworkSelector
              className="decoder-address-field__selector"
              selectedNetwork={selectedExtendedNetwork}
              onNetworkChange={(network) =>
                onNetworkChange(
                  mapExtendedToChain(network, supportedChains, selectedNetwork)
                )
              }
              networks={extendedNetworks}
              showTestnets={extendedNetworks.some(
                (network) => network.isTestnet
              )}
              size="sm"
              variant="input"
            />
            {onFetchABI && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="contract-endpoint-field__inline-action"
                onClick={onFetchABI}
                icon={<Search size={12} />}
                loading={isLoading}
                disabled={!isValidAddress || isLoading}
              >
                {isLoading ? "..." : "Fetch"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && <ErrorDisplay error={error} variant="inline" />}
    </div>
  );
};

export default ContractAddressInput;
