import React, { useEffect, useState } from "react";
import { ChevronDown, Network, Check } from "lucide-react";
import type { Chain } from "../../types";
import ChainIcon, { type ChainKey } from "../icons/ChainIcon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API_KEY = import.meta.env.VITE_API_KEY || "";

// Enhanced chain configuration with testnet support
export interface ExtendedChain extends Partial<Chain> {
  id: number;
  name: string;
  rpcUrl?: string;
  blockExplorer?: string;
  isTestnet?: boolean;
  category?: "mainnet" | "testnet" | "local";
  color?: string;
  chainKey?: ChainKey;
}

// Comprehensive network list with mainnets and testnets
export const EXTENDED_NETWORKS: ExtendedChain[] = [
  // Mainnets
  {
    id: 1,
    name: "Ethereum",
    rpcUrl: "https://ethereum.publicnode.com",
    blockExplorer: "https://etherscan.io",
    isTestnet: false,
    category: "mainnet",
    color: "#627eea",
    chainKey: "ETH",
  },
  {
    id: 137,
    name: "Polygon",
    rpcUrl: "https://polygon-rpc.com",
    blockExplorer: "https://polygonscan.com",
    isTestnet: false,
    category: "mainnet",
    color: "#8247e5",
    chainKey: "POLY",
  },
  {
    id: 42161,
    name: "Arbitrum One",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    blockExplorer: "https://arbiscan.io",
    isTestnet: false,
    category: "mainnet",
    color: "#28a0f0",
    chainKey: "ARB",
  },
  {
    id: 10,
    name: "Optimism",
    rpcUrl: "https://mainnet.optimism.io",
    blockExplorer: "https://optimistic.etherscan.io",
    isTestnet: false,
    category: "mainnet",
    color: "#ff0420",
    chainKey: "OP",
  },
  {
    id: 8453,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    blockExplorer: "https://basescan.org",
    isTestnet: false,
    category: "mainnet",
    color: "#0052ff",
    chainKey: "BASE",
  },
  {
    id: 56,
    name: "BNB Smart Chain",
    rpcUrl: "https://bsc-dataseed.binance.org",
    blockExplorer: "https://bscscan.com",
    isTestnet: false,
    category: "mainnet",
    color: "#f3ba2f",
    chainKey: "BSC",
  },
  {
    id: 100,
    name: "Gnosis Chain",
    rpcUrl: "https://rpc.gnosischain.com",
    blockExplorer: "https://gnosisscan.io",
    isTestnet: false,
    category: "mainnet",
    color: "#3e6957",
    chainKey: "GNO",
  },
  {
    id: 43114,
    name: "Avalanche",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    blockExplorer: "https://snowtrace.io",
    isTestnet: false,
    category: "mainnet",
    color: "#e84142",
    chainKey: "AVAX",
  },

  // Testnets
  {
    id: 11155111,
    name: "Sepolia",
    rpcUrl: API_KEY
      ? `https://eth-sepolia.g.alchemy.com/v2/${API_KEY}`
      : "https://rpc.sepolia.ethpandaops.io",
    blockExplorer: "https://sepolia.etherscan.io",
    isTestnet: true,
    category: "testnet",
    color: "#627eea",
    chainKey: "ETH",
  },
  {
    id: 17000,
    name: "Holesky",
    rpcUrl: "https://ethereum-holesky.publicnode.com",
    blockExplorer: "https://holesky.etherscan.io",
    isTestnet: true,
    category: "testnet",
    color: "#627eea",
    chainKey: "ETH",
  },
  {
    id: 80002,
    name: "Polygon Amoy",
    rpcUrl: "https://rpc-amoy.polygon.technology",
    blockExplorer: "https://amoy.polygonscan.com",
    isTestnet: true,
    category: "testnet",
    color: "#8247e5",
    chainKey: "POLY",
  },
  {
    id: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    blockExplorer: "https://sepolia.arbiscan.io",
    isTestnet: true,
    category: "testnet",
    color: "#28a0f0",
    chainKey: "ARB",
  },
  {
    id: 11155420,
    name: "Optimism Sepolia",
    rpcUrl: "https://sepolia.optimism.io",
    blockExplorer: "https://sepolia-optimism.etherscan.io",
    isTestnet: true,
    category: "testnet",
    color: "#ff0420",
    chainKey: "OP",
  },
  {
    id: 4202,
    name: "Lisk Sepolia",
    rpcUrl: "https://rpc.sepolia-api.lisk.com",
    blockExplorer: "https://sepolia-blockscout.lisk.com",
    isTestnet: true,
    category: "testnet",
    color: "#0f74ff",
    chainKey: "LISK",
  },
  {
    id: 84532,
    name: "Base Sepolia",
    rpcUrl: API_KEY
      ? `https://base-sepolia.g.alchemy.com/v2/${API_KEY}`
      : "https://sepolia.base.org",
    blockExplorer: "https://sepolia.basescan.org",
    isTestnet: true,
    category: "testnet",
    color: "#0052ff",
    chainKey: "BASE",
  },
  {
    id: 97,
    name: "BNB Testnet",
    rpcUrl: "https://bsc-testnet.public.blastapi.io",
    blockExplorer: "https://testnet.bscscan.com",
    isTestnet: true,
    category: "testnet",
    color: "#f3ba2f",
    chainKey: "BSC",
  },
];

export interface NetworkSelectorProps {
  selectedNetwork: ExtendedChain | null;
  onNetworkChange: (network: ExtendedChain) => void;
  networks?: ExtendedChain[];
  showTestnets?: boolean;
  className?: string;
  ariaLabel?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "compact" | "inline" | "input";
}

const NetworkSelector: React.FC<NetworkSelectorProps> = ({
  selectedNetwork,
  onNetworkChange,
  networks = EXTENDED_NETWORKS,
  showTestnets = false,
  className = "",
  ariaLabel,
  size = "md",
  variant = "default",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [networkCategory, setNetworkCategory] = useState<"live" | "testnet">(
    selectedNetwork?.isTestnet ? "testnet" : showTestnets ? "testnet" : "live"
  );

  useEffect(() => {
    if (!selectedNetwork) return;
    setNetworkCategory(selectedNetwork.isTestnet ? "testnet" : "live");
  }, [selectedNetwork?.id, selectedNetwork?.isTestnet]);

  const filteredNetworks = networks.filter((network) =>
    networkCategory === "testnet" ? network.isTestnet : !network.isTestnet
  );

  const mainnetCount = networks.filter((n) => !n.isTestnet).length;
  const testnetCount = networks.filter((n) => n.isTestnet).length;

  const iconSize = size === "sm" ? 16 : size === "lg" ? 24 : 20;
  const isInlineVariant = variant === "inline";
  const isInputVariant = variant === "input";

  const buttonAriaLabel = ariaLabel || selectedNetwork?.name || "Select network";

  const renderNetworkIcon = (network?: ExtendedChain | null, sz = iconSize) => {
    if (!network) {
      return <Network size={sz} className="text-muted-foreground" />;
    }
    const resolvedKey = network.chainKey ?? "ETH";
    return <ChainIcon chain={resolvedKey} size={sz} rounded={sz / 2} />;
  };

  const handleSelectNetwork = (network: ExtendedChain) => {
    onNetworkChange(network);
    setIsOpen(false);
  };

  // Trigger button content based on variant
  const renderTrigger = () => {
    if (isInlineVariant) {
      return (
        <Button
          type="button"
          aria-label={buttonAriaLabel}
          variant="ghost"
          size="icon"
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-lg",
            "bg-slate-800/40 border border-slate-700/50",
            "hover:bg-slate-700/50 hover:border-slate-600/60 transition-all",
            className
          )}
        >
          {renderNetworkIcon(selectedNetwork, 18)}
        </Button>
      );
    }

    if (isInputVariant) {
      return (
        <Button
          type="button"
          aria-label={buttonAriaLabel}
          variant="ghost"
          size="sm"
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 rounded-md h-full",
            "hover:bg-slate-700/30 transition-colors",
            className
          )}
        >
          {renderNetworkIcon(selectedNetwork, 18)}
          <ChevronDown
            size={14}
            className={cn(
              "text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </Button>
      );
    }

    // Default and compact variants
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "flex items-center gap-3 w-full rounded-xl border transition-all",
          "bg-card/50 border-border hover:bg-card/80 hover:border-primary/30",
          size === "sm" && "px-3 py-2 text-sm",
          size === "md" && "px-4 py-3",
          size === "lg" && "px-5 py-4 text-lg",
          variant === "compact" && "rounded-lg",
          className
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-lg",
            "bg-primary/10 border border-primary/20",
            size === "sm" && "w-8 h-8",
            size === "md" && "w-10 h-10",
            size === "lg" && "w-12 h-12"
          )}
          style={{
            backgroundColor: selectedNetwork?.color
              ? `${selectedNetwork.color}20`
              : undefined,
            borderColor: selectedNetwork?.color
              ? `${selectedNetwork.color}40`
              : undefined,
          }}
        >
          {renderNetworkIcon(selectedNetwork, iconSize)}
        </div>

        {variant === "default" && (
          <div className="flex-1 text-left">
            <div className="font-semibold text-foreground">
              {selectedNetwork?.name || "Select Network"}
            </div>
          </div>
        )}

        <ChevronDown
          size={size === "lg" ? 20 : 16}
          className={cn(
            "text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </Button>
    );
  };

  return (
    <div className={cn("network-selector", className)}>
      {variant === "default" && (
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <Network size={14} />
          Network
        </label>
      )}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>

        <PopoverContent
          className={cn(
            "p-0 border-border bg-popover/95 backdrop-blur-xl",
            isInputVariant ? "w-[280px]" : "w-[var(--radix-popover-trigger-width)]"
          )}
          align={isInputVariant ? "end" : "start"}
          sideOffset={8}
        >
          {/* Header with counts and category toggle */}
          <div className="p-3 border-b border-border/50">
            <div className="text-xs text-muted-foreground mb-2">
              {mainnetCount} Live • {testnetCount} Testnets
            </div>

            <Tabs
              value={networkCategory}
              onValueChange={(v) => setNetworkCategory(v as "live" | "testnet")}
              className="w-full"
            >
              <TabsList className="w-full h-8 bg-muted/50 p-0.5">
                <TabsTrigger
                  value="live"
                  className="flex-1 h-7 text-xs gap-1.5 data-[state=active]:bg-background"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-green-500"
                    aria-hidden
                  />
                  Live
                </TabsTrigger>
                <TabsTrigger
                  value="testnet"
                  className="flex-1 h-7 text-xs gap-1.5 data-[state=active]:bg-background"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-yellow-500"
                    aria-hidden
                  />
                  Testnet
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Network list */}
          <div className="max-h-[280px] overflow-y-auto">
            <div className="p-1">
              {filteredNetworks.map((network) => {
                const isSelected = selectedNetwork?.id === network.id;
                return (
                  <Button
                    key={network.id}
                    type="button"
                    variant="ghost"
                    onClick={() => handleSelectNetwork(network)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg transition-colors",
                      "hover:bg-accent/50",
                      isSelected && "bg-primary/10"
                    )}
                  >
                    <div
                      className="flex items-center justify-center w-9 h-9 rounded-lg border"
                      style={{
                        backgroundColor: network.color
                          ? `${network.color}15`
                          : "rgba(255,255,255,0.05)",
                        borderColor: network.color
                          ? `${network.color}30`
                          : "rgba(255,255,255,0.1)",
                      }}
                    >
                      {renderNetworkIcon(network, 20)}
                    </div>

                    <div className="flex-1 text-left">
                      <div className="font-medium text-sm text-foreground">
                        {network.name}
                      </div>
                    </div>

                    {isSelected && (
                      <Check size={16} className="text-primary shrink-0" />
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default NetworkSelector;
