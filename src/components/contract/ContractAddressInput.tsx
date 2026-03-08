import React, { useMemo } from "react";
import { Search, X, Square, CheckCircle2 } from "lucide-react";
import { ethers } from "ethers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "../shared";
import NetworkSelector, {
  EXTENDED_NETWORKS,
  type ExtendedChain,
} from "../shared/NetworkSelector";
import type { Chain } from "../../types";
import "@/styles/ContractComponents.css";
import { cn } from "@/lib/utils";

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
    | "blockscout-ebd"
    | "whatsabi"
    | "manual"
    | "restored"
    | null;
  tokenInfo?: {
    symbol?: string;
    name?: string;
    decimals?: number;
  } | null;
  className?: string;
  /** Custom icon to replace the default Search icon on the fetch button */
  fetchIcon?: React.ReactNode;
  /** Custom title/aria-label for the fetch button */
  fetchLabel?: string;
  /** Callback to cancel an in-progress loading sequence */
  onCancel?: () => void;
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
  className = "",
  fetchIcon,
  fetchLabel,
  onCancel,
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

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Label 
        htmlFor="contract-address-input"
        className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1"
      >
        Contract Address
      </Label>
      
      <div className="relative group">
        <div className="relative flex items-center">
          <Input
            id="contract-address-input"
            name="contractAddress"
            autoComplete="off"
            spellCheck={false}
            value={contractAddress}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="0x0000…0000"
            className={cn(
              "h-12 pl-4 pr-[120px] font-mono text-sm tracking-tight transition-all duration-300",
              "bg-transparent! border-slate-800/50 hover:border-slate-700/60 focus:ring-0 focus:border-white/50",
              isValidAddress && "border-white/30 bg-white/[0.02]"
            )}
          />

          {/* Controls Container */}
          <div className="absolute right-1.5 flex items-center h-9 gap-1 px-1">
            {/* Clear Button - minimal, just icon */}
            {contractAddress && (
              <Button
                type="button"
                variant="icon-borderless"
                size="icon-inline"
                onClick={() => onAddressChange("")}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear address"
                aria-label="Clear address"
              >
                <X size={14} />
              </Button>
            )}

            {/* Network Selector */}
            <NetworkSelector
              className="scale-90 opacity-90 hover:opacity-100 transition-opacity"
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

            {/* Search / Cancel Button */}
            {onFetchABI && (
              isLoading && onCancel ? (
                <Button
                  type="button"
                  variant="icon-borderless"
                  size="icon-inline"
                  onClick={onCancel}
                  className="p-1.5 rounded-md transition-colors text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  title="Cancel loading"
                  aria-label="Cancel loading"
                >
                  <Square size={14} fill="currentColor" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="icon-borderless"
                  size="icon-inline"
                  onClick={onFetchABI}
                  disabled={!isValidAddress || isLoading}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    "text-foreground/70 hover:text-foreground hover:bg-muted",
                    fetchIcon
                      ? "disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-foreground/70"
                      : "disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-foreground/70"
                  )}
                  title={fetchLabel || "Fetch ABI"}
                  aria-label={fetchLabel || "Fetch ABI"}
                >
                  {fetchIcon ? (
                    fetchIcon
                  ) : isLoading ? (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                </Button>
              )
            )}
          </div>
        </div>
      </div>

      {error && (
        <ErrorDisplay 
          error={error} 
          variant="inline" 
          className="mt-1.5 opacity-90 animate-in fade-in slide-in-from-top-1 duration-200" 
        />
      )}
    </div>
  );
};

export default ContractAddressInput;
