// Visual mirror of EVM `<ContractColumn>`: From Project / Any Address radios,
// saved-contracts Select + grid, address input. Parent owns address + class
// state; the `actionRow` slot is optional (callers may render actions below).
import React, { useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import StarknetContractInput from "./StarknetContractInput";
import {
  loadSavedStarknetContracts,
  saveStarknetContract,
  type StarknetSavedContract,
} from "../../chains/starknet/savedContractsStorage";
import type {
  StarknetTokenType,
  StarknetErc20Meta,
} from "../../chains/starknet/tokenDetection";
import {
  STARKNET_NETWORKS,
  STARKNET_MAINNET_SYNTHETIC_ID,
  STARKNET_SEPOLIA_SYNTHETIC_ID,
  type ExtendedChain,
} from "../shared/NetworkSelector";
import { parseStarknetAddress } from "@/chains/types/starknet";

export interface StarknetContractColumnProps {
  contractAddress: string;
  onAddressChange: (address: string) => void;
  selectedNetwork: ExtendedChain;
  onNetworkChange: (network: ExtendedChain) => void;
  isLoading: boolean;
  error: string | null;
  onFetchClass: () => void;
  onCancel?: () => void;
  contractName?: string;
  classHash?: string;
  /** EVM-equivalent token-type label, surfaced as a small badge after the
   *  class resolves. Defaults to `null` (no badge rendered). */
  tokenType?: StarknetTokenType;
  /** Live `name`/`symbol`/`decimals` snapshot for ERC-20s. All fields are
   *  optional; missing fields are simply omitted from the badge subtext.
   *  Defaults to `undefined`. */
  tokenMeta?: StarknetErc20Meta;
  actionRow?: React.ReactNode;
}

function networkExtendedFor(network: "mainnet" | "sepolia"): ExtendedChain {
  const targetId =
    network === "sepolia"
      ? STARKNET_SEPOLIA_SYNTHETIC_ID
      : STARKNET_MAINNET_SYNTHETIC_ID;
  return (
    STARKNET_NETWORKS.find((n) => n.id === targetId) ?? STARKNET_NETWORKS[0]
  );
}

const StarknetContractColumn: React.FC<StarknetContractColumnProps> = ({
  contractAddress,
  onAddressChange,
  selectedNetwork,
  onNetworkChange,
  isLoading,
  error,
  onFetchClass,
  onCancel,
  contractName,
  classHash,
  tokenType = null,
  tokenMeta,
  actionRow,
}) => {
  const [contractSource, setContractSource] = useState<"project" | "address">(
    "address",
  );
  const [showSavedContracts, setShowSavedContracts] = useState(false);
  const [savedContracts, setSavedContracts] = useState<StarknetSavedContract[]>(
    () => loadSavedStarknetContracts(),
  );

  // 600ms debounced auto-fetch once the address parses as a felt. Magnifier
  // remains a synchronous escape hatch. Ref captures latest `onFetchClass`
  // so a parent re-render with a new closure doesn't refire the effect.
  const onFetchClassRef = useRef(onFetchClass);
  useEffect(() => {
    onFetchClassRef.current = onFetchClass;
  }, [onFetchClass]);

  useEffect(() => {
    const trimmed = contractAddress.trim();
    if (!trimmed || isLoading || contractName) return;
    try {
      parseStarknetAddress(trimmed);
    } catch {
      return;
    }
    const timer = window.setTimeout(() => onFetchClassRef.current?.(), 600);
    return () => window.clearTimeout(timer);
  }, [contractAddress, isLoading, contractName]);

  // Auto-save on successful resolve — mirrors EVM `useContractState` save
  // hook. The session-save ref dedupes within a session so re-renders with
  // an unchanged (address, classHash) pair don't churn localStorage.
  const sessionSavedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!classHash || !contractAddress) return;
    const addrKey = contractAddress.trim().toLowerCase();
    const dedupeKey = `${addrKey}|${classHash.toLowerCase()}`;
    if (!addrKey || sessionSavedRef.current.has(dedupeKey)) return;
    const network: "mainnet" | "sepolia" =
      selectedNetwork.id === STARKNET_SEPOLIA_SYNTHETIC_ID ? "sepolia" : "mainnet";
    saveStarknetContract({
      name: contractName,
      contractAddress,
      classHash,
      network,
      savedAt: Date.now(),
    });
    sessionSavedRef.current.add(dedupeKey);
    setSavedContracts(loadSavedStarknetContracts());
  }, [classHash, contractAddress, contractName, selectedNetwork.id]);

  const handlePickSaved = (entry: StarknetSavedContract) => {
    onAddressChange(entry.contractAddress);
    onNetworkChange(networkExtendedFor(entry.network));
    setContractSource("address");
    setShowSavedContracts(false);
  };

  return (
    <>
      {/* Contract Source Selection — nested under the page-level mode toggle.
          Visual mirror of EVM ContractColumn lines 75-96. */}
      <div className="flex items-center gap-3 mb-3 ml-3 pl-3 border-l-2 border-muted-foreground/30">
        <span className="text-xs text-muted-foreground">└</span>
        <RadioGroup
          value={contractSource}
          onValueChange={(value) =>
            setContractSource(value as "project" | "address")
          }
          className="flex items-center gap-4"
        >
          <div className="flex items-center gap-1.5">
            <RadioGroupItem
              value="project"
              id="starknet-source-project"
              className="h-3.5 w-3.5"
            />
            <Label
              htmlFor="starknet-source-project"
              className="text-xs cursor-pointer"
            >
              From Project
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem
              value="address"
              id="starknet-source-address"
              className="h-3.5 w-3.5"
            />
            <Label
              htmlFor="starknet-source-address"
              className="text-xs cursor-pointer"
            >
              Any Address
            </Label>
          </div>
        </RadioGroup>
      </div>

      {contractSource === "project" ? (
        <div className="space-y-3">
          {savedContracts.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-3 items-center">
                <Select
                  onValueChange={(value) => {
                    const index = parseInt(value);
                    if (!isNaN(index) && savedContracts[index]) {
                      handlePickSaved(savedContracts[index]);
                    }
                  }}
                >
                  <SelectTrigger className="w-full max-w-[400px]">
                    <SelectValue placeholder="Select saved contract…" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    className="max-h-[280px] overflow-y-auto"
                  >
                    {savedContracts.map((contract, index) => (
                      <SelectItem key={index} value={String(index)}>
                        <span className="truncate">
                          {contract.name
                            ? `${contract.name} (${contract.network})`
                            : `${contract.contractAddress.slice(0, 6)}...${contract.contractAddress.slice(-4)} (${contract.network})`}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSavedContracts(!showSavedContracts)}
                  className="opacity-70 hover:opacity-100"
                >
                  {showSavedContracts ? "Hide All" : "Show All"}
                </Button>
              </div>

              {showSavedContracts && (
                <div className="border border-border/50 rounded-lg p-2 bg-card/20 w-full">
                  <div className="grid grid-cols-3 gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                    {savedContracts.map((contract, index) => (
                      <div
                        key={index}
                        className="p-2 rounded border border-border/40 bg-background/50 hover:bg-accent/30 hover:border-primary/40 cursor-pointer transition-all text-left"
                        onClick={() => handlePickSaved(contract)}
                      >
                        <div className="font-medium text-foreground text-[11px] truncate">
                          {contract.name || "Unnamed"}
                        </div>
                        <div className="text-[9px] text-muted-foreground font-mono truncate">
                          {contract.network} ·{" "}
                          {contract.contractAddress.slice(0, 6)}...
                          {contract.contractAddress.slice(-4)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-5 rounded-lg border border-border text-center">
              <div className="text-muted-foreground mb-2">
                No saved contracts
              </div>
              <div className="text-xs text-muted-foreground/70">
                Use "Insert any address" to fetch and save contracts
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: "24px" }}>
            <StarknetContractInput
              contractAddress={contractAddress}
              onAddressChange={onAddressChange}
              selectedNetwork={selectedNetwork}
              onNetworkChange={onNetworkChange}
              isLoading={isLoading}
              error={error}
              onFetchClass={onFetchClass}
              onCancel={onCancel}
              contractName={contractName}
              classHash={classHash}
            />
            {/* Token-type badge — EVM parity gesture. Only rendered after the
                class resolves successfully (no error, no spinner) so it lands
                next to the contractName/classHash pill the input draws. */}
            {tokenType && !error && !isLoading && (
              <div
                className="flex items-center gap-2 flex-wrap text-[11px] pl-1 mt-2"
                data-testid="starknet-token-type-badge"
              >
                {tokenType === "erc20" && (
                  <Badge variant="success" size="sm">
                    ERC-20
                  </Badge>
                )}
                {tokenType === "erc721" && (
                  <Badge variant="accent" size="sm">
                    ERC-721
                  </Badge>
                )}
                {tokenType === "erc1155" && (
                  <Badge variant="accent" size="sm">
                    ERC-1155
                  </Badge>
                )}
                {tokenType === "erc20" && tokenMeta && (
                  <span className="font-mono text-muted-foreground">
                    {[
                      tokenMeta.symbol,
                      tokenMeta.decimals !== undefined
                        ? `${tokenMeta.decimals} decimals`
                        : null,
                    ]
                      .filter(Boolean)
                      .map((piece, idx) => (
                        <span key={idx}>
                          {idx > 0 ? " · " : "· "}
                          {piece}
                        </span>
                      ))}
                  </span>
                )}
                {(tokenType === "erc721" || tokenType === "erc1155") &&
                  contractName && (
                    <span className="font-mono text-muted-foreground">
                      · {contractName}
                    </span>
                  )}
              </div>
            )}
          </div>
        </div>
      )}

      {actionRow && <div className="mt-2">{actionRow}</div>}
    </>
  );
};

export default StarknetContractColumn;
