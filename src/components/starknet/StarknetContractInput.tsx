/**
 * StarknetContractInput — visual mirror of EVM `<ContractAddressInput>`.
 *
 * Same DOM structure, same Tailwind classes. The only differences are:
 *   - validation uses Starknet felt parsing (instead of `ethers.utils.isAddress`)
 *   - the fetch button resolves a contract → class via bridge `/class` after the
 *     parent finds the class hash via `RpcProvider.getClassHashAt`
 *   - on success it surfaces the friendly contractName + short class-hash
 *     pill underneath, mirroring how EVM shows contractName + abiSource.
 *
 * Network selection inside the row is hard-pinned to STARKNET_NETWORKS.
 */
import React from "react";
import { MagnifyingGlass, X, Square } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "../shared";
import NetworkSelector, {
  STARKNET_NETWORKS,
  type ExtendedChain,
} from "../shared/NetworkSelector";
import { isFelt } from "../../chains/types/starknet";
import "@/styles/ContractComponents.css";
import { cn } from "@/lib/utils";

export interface StarknetContractInputProps {
  contractAddress: string;
  onAddressChange: (address: string) => void;
  selectedNetwork: ExtendedChain;
  onNetworkChange: (network: ExtendedChain) => void;
  isLoading?: boolean;
  error?: string | null;
  /** Fired when the user clicks the magnifier — parent resolves the
   *  address → class hash via RpcProvider, then class → ABI via the bridge. */
  onFetchClass?: () => void;
  onCancel?: () => void;
  /** Friendly name surfaced after resolution (e.g. "STRK"). */
  contractName?: string;
  /** Resolved class hash (0x… felt) — shown as a small subtext after resolve. */
  classHash?: string;
  className?: string;
}

const StarknetContractInput: React.FC<StarknetContractInputProps> = ({
  contractAddress,
  onAddressChange,
  selectedNetwork,
  onNetworkChange,
  isLoading = false,
  error,
  onFetchClass,
  onCancel,
  contractName,
  classHash,
  className = "",
}) => {
  const trimmed = contractAddress?.trim() || "";
  const isValid = trimmed.length > 0 && isFelt(trimmed);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Label
        htmlFor="starknet-contract-address-input"
        className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1"
      >
        Contract Address
      </Label>

      <div className="relative group">
        <div className="relative flex items-center">
          <Input
            id="starknet-contract-address-input"
            name="starknetContractAddress"
            autoComplete="off"
            spellCheck={false}
            value={contractAddress}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="0x0000…0000"
            className={cn(
              "h-12 pl-4 pr-[120px] font-mono text-sm tracking-tight transition-all duration-300",
              "bg-transparent! border-slate-800/50 hover:border-slate-700/60 focus:ring-0 focus:border-white/50",
              isValid && "border-white/30 bg-white/[0.02]"
            )}
          />

          <div className="absolute right-1.5 flex items-center h-9 gap-1 px-1">
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

            <NetworkSelector
              className="scale-90 opacity-90 hover:opacity-100 transition-opacity"
              selectedNetwork={selectedNetwork}
              onNetworkChange={onNetworkChange}
              networks={STARKNET_NETWORKS}
              showTestnets={STARKNET_NETWORKS.some((n) => n.isTestnet)}
              size="sm"
              variant="input"
            />

            {onFetchClass &&
              (isLoading && onCancel ? (
                <Button
                  type="button"
                  variant="icon-borderless"
                  size="icon-inline"
                  onClick={onCancel}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    "text-red-400 hover:text-red-300 hover:bg-red-500/10 animate-pulse"
                  )}
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
                  onClick={onFetchClass}
                  disabled={!isValid || isLoading}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    "text-foreground/70 hover:text-foreground hover:bg-muted",
                    "disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-foreground/70"
                  )}
                  title="Fetch class"
                  aria-label="Fetch class"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <MagnifyingGlass size={16} />
                  )}
                </Button>
              ))}
          </div>
        </div>
      </div>

      {(contractName || classHash) && !error && (
        <div className="flex items-center gap-2 flex-wrap text-[11px] pl-1">
          {contractName && (
            <span className="px-1.5 py-0.5 rounded border border-border/50 bg-card/40 font-medium text-foreground">
              {contractName}
            </span>
          )}
          {classHash && (
            <span className="font-mono text-muted-foreground truncate">
              class {classHash.slice(0, 10)}…{classHash.slice(-6)}
            </span>
          )}
        </div>
      )}

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

export default StarknetContractInput;
