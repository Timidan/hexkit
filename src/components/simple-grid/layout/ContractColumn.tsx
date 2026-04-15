/**
 * ContractColumn - Contract input, saved contracts, contract info card.
 *
 * Sub-components extracted for maintainability:
 * - AbiUploadSection: ABI error display + manual ABI upload modal
 * - ContractPreviewCard: Token/diamond preview card + loading skeleton
 * - ContractInfoCard: Full contract info card with badges and function counts
 */
import React from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { RadioGroup, RadioGroupItem } from "../../ui/radio-group";
import { Label } from "../../ui/label";
import { Button } from "../../ui/button";
import { SUPPORTED_CHAINS } from "../../../utils/chains";
import ContractAddressInput from "../../contract/ContractAddressInput";
import { useGridContext } from "../GridContext";
import AbiUploadSection from "./AbiUploadSection";
import ContractPreviewCard from "./ContractPreviewCard";
import ContractInfoCard from "./ContractInfoCard";

export default function ContractColumn(): React.ReactElement {
  const ctx: any = useGridContext();
  const {
    contractModeToggle,
    isSimulationMode,
    contractAddress,
    setContractAddress,
    selectedNetwork,
    setSelectedNetwork,
    contractSource,
    setContractSource,
    isLoadingABI,
    abiError,
    abiSource,
    resolvedContractName,
    showSavedContracts,
    setShowSavedContracts,
    manualAbi,
    savedContracts,
    handleFetchABI,
    handleCancelFetch,
    handleManualAddressChange,
    loadContractFromStorage,
    navigate,
    tokenInfo,
  } = ctx;

  return (
    <>
      <div className="flex items-center justify-end mb-4">
        {/* Simulation History Button - only in simulation mode */}
        {isSimulationMode && (
          <Button
            type="button"
            variant="icon-borderless"
            size="icon-inline"
            onClick={() => navigate("/simulations")}
            title="Simulation History"
            aria-label="Simulation History"
            className="cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
          >
            <ClockCounterClockwise className="h-5 w-5" />
          </Button>
        )}
      </div>
      {contractModeToggle && contractModeToggle}

      {/* Contract Source Selection - Nested under mode toggle */}
      <div className="flex items-center gap-3 mb-3 ml-3 pl-3 border-l-2 border-muted-foreground/30">
        <span className="text-xs text-muted-foreground">└</span>
        <RadioGroup
          value={contractSource}
          onValueChange={(value) => setContractSource(value as "project" | "address")}
          className="flex items-center gap-4"
        >
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="project" id="source-project" className="h-3.5 w-3.5" />
            <Label htmlFor="source-project" className="text-xs cursor-pointer">
              From Project
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="address" id="source-address" className="h-3.5 w-3.5" />
            <Label htmlFor="source-address" className="text-xs cursor-pointer">
              Any Address
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Contract Input */}
      {contractSource === "project" ? (
        <div className="space-y-3">
          {savedContracts.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-3 items-center">
                <Select
                  onValueChange={async (value) => {
                    const index = parseInt(value);
                    if (!isNaN(index) && savedContracts[index]) {
                      await loadContractFromStorage(savedContracts[index]);
                      setContractSource("address");
                    }
                  }}
                >
                  <SelectTrigger className="w-full max-w-[400px]">
                    <SelectValue placeholder="Select saved contract…" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[280px] overflow-y-auto">
                    {savedContracts.map((contract: any, index: number) => (
                      <SelectItem key={index} value={String(index)}>
                        <span className="truncate">
                          {contract.name
                            ? `${contract.name} (${contract.chain.name})`
                            : `${contract.address.slice(0, 6)}...${contract.address.slice(-4)} (${contract.chain.name})`}
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
                    {savedContracts.map((contract: any, index: number) => (
                      <div
                        key={index}
                        className="p-2 rounded border border-border/40 bg-background/50 hover:bg-accent/30 hover:border-primary/40 cursor-pointer transition-all text-left"
                        onClick={async () => {
                          await loadContractFromStorage(contract);
                          setContractSource("address");
                          setShowSavedContracts(false);
                        }}
                      >
                        <div className="font-medium text-foreground text-[11px] truncate">
                          {contract.name || "Unnamed"}
                        </div>
                        <div className="text-[9px] text-muted-foreground font-mono truncate">
                          {contract.chain.name} · {contract.address.slice(0, 6)}...{contract.address.slice(-4)}
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
            <ContractAddressInput
              contractAddress={contractAddress}
              onAddressChange={handleManualAddressChange}
              selectedNetwork={selectedNetwork}
              onNetworkChange={setSelectedNetwork}
              supportedChains={SUPPORTED_CHAINS}
              isLoading={isLoadingABI}
              error={abiError}
              onFetchABI={handleFetchABI}
              onCancel={handleCancelFetch}
              contractName={resolvedContractName}
              abiSource={abiSource}
              tokenInfo={tokenInfo}
            />
          </div>

          <AbiUploadSection />
          <ContractPreviewCard />
          <ContractInfoCard />
        </div>
      )}
    </>
  );
}
