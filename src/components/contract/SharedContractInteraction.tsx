import React from "react";
import type { ethers } from "ethers";
import NetworkSelector, {
  type ExtendedChain,
} from "../shared/NetworkSelector";
import { Badge, Button } from "../shared";
import InlineCopyButton from "../ui/InlineCopyButton";
import { CheckCircle, Loader2, Search } from "lucide-react";
import "../../styles/ContractComponents.css";

export interface SharedContractInteractionProps {
  connectionTitle?: string;
  selectedNetwork: ExtendedChain | null;
  onNetworkChange: (network: ExtendedChain) => void;
  contractAddress: string;
  onContractAddressChange: (value: string) => void;
  onResetContractState?: () => void;
  onFetchContract: () => void;
  isFetchingContract: boolean;
  fetchDisabled?: boolean;
  searchProgress?: {
    source: string;
    status: "searching" | "found" | "not_found" | "error";
    message?: string;
  } | null;
  errorMessage?: string | null;
  contractSummary?: {
    name: string;
    address: string;
    chainLabel: string;
    explorerUrl?: string;
    sourceLabel?: string;
    readCount: number;
    writeCount: number;
    tokenName?: string;
    tokenSymbol?: string;
    tokenDecimals?: number;
  } | null;
  onOpenExplorer?: () => void;
  selectedFunctionType: "read" | "write" | null;
  onFunctionTypeChange: (type: "read" | "write") => void;
  readFunctions: ethers.utils.FunctionFragment[];
  writeFunctions: ethers.utils.FunctionFragment[];
  onFunctionSelect: (
    fragment: ethers.utils.FunctionFragment,
    type: "read" | "write"
  ) => void;
  selectedFunctionName: string | null;
  functionSearch: string;
  onFunctionSearchChange: (value: string) => void;
  showFunctionSearch: boolean;
  onToggleFunctionSearch: (show: boolean) => void;
  isContractLoading?: boolean;
  children?: React.ReactNode;
}

const SharedContractInteraction: React.FC<SharedContractInteractionProps> = ({
  connectionTitle = "Contract Connection",
  selectedNetwork,
  onNetworkChange,
  contractAddress,
  onContractAddressChange,
  onResetContractState,
  onFetchContract,
  isFetchingContract,
  fetchDisabled,
  searchProgress,
  errorMessage,
  contractSummary,
  selectedFunctionType,
  onFunctionTypeChange,
  readFunctions,
  writeFunctions,
  onFunctionSelect,
  selectedFunctionName,
  functionSearch,
  onFunctionSearchChange,
  showFunctionSearch,
  onToggleFunctionSearch,
  isContractLoading,
  children,
}) => {
  const handleAddressChange = (value: string) => {
    onContractAddressChange(value);
    onResetContractState?.();
  };

  const renderFunctions = (
    functions: ethers.utils.FunctionFragment[],
    type: "read" | "write"
  ) => {
    if (!functions.length) {
      return (
        <div className="contract-function-panel__empty">
          No {type === "read" ? "read" : "write"} functions available.
        </div>
      );
    }

    return (
      <div className="contract-function-list">
        {functions.map((func) => {
          const active = selectedFunctionName === func.name;
          return (
            <button
              key={`${type}-${func.name}`}
              type="button"
              className={`contract-function-item${
                active ? " contract-function-item-active" : ""
              }`}
              onClick={() => onFunctionSelect(func, type)}
            >
              <div className="contract-function-item__name">{func.name}</div>
              <div className="contract-function-item__descriptor">
                {func.stateMutability}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="contract-interaction-stack">
      <div className="contract-interaction-card">
        <div className="contract-interaction-card__header">
          <span>{connectionTitle}</span>
        </div>

        <div className="contract-connection-grid">
          <div className="contract-connection-grid__column">
            <label className="contract-connection-label">Network</label>
            <NetworkSelector
              selectedNetwork={selectedNetwork}
              onNetworkChange={onNetworkChange}
              showTestnets
              size="md"
              variant="default"
            />
          </div>

          <div className="contract-connection-grid__column">
            <label className="contract-connection-label">Contract Address</label>
            <div className="contract-connection-input-row">
              <input
                className="contract-connection-input"
                value={contractAddress}
                onChange={(event) => handleAddressChange(event.target.value)}
                placeholder="0x..."
              />
              <Button
                variant="primary"
                onClick={onFetchContract}
                loading={isFetchingContract}
                disabled={fetchDisabled || isFetchingContract || !contractAddress}
                icon={!isFetchingContract ? <Search size={16} /> : undefined}
              >
                {isFetchingContract ? "Searching..." : "Fetch"}
              </Button>
            </div>
          </div>
        </div>

        {searchProgress && (
          <div className="contract-search-progress">
            <div className="contract-search-progress__icon">
              {searchProgress.status === "searching" && (
                <Loader2 className="animate-spin" size={14} />
              )}
              {searchProgress.status === "found" && <CheckCircle size={14} />}
            </div>
            <div className="contract-search-progress__content">
              <div className="contract-search-progress__title">
                {searchProgress.source}
              </div>
              {searchProgress.message && (
                <div className="contract-search-progress__message">
                  {searchProgress.message}
                </div>
              )}
            </div>
            <Badge variant="info" size="sm">
              {searchProgress.status}
            </Badge>
          </div>
        )}

        {errorMessage && (
          <div className="contract-error-banner">{errorMessage}</div>
        )}
      </div>

      <div className="contract-interaction-card">
        <div className="contract-interaction-card__header">
          <span>Contract Overview</span>
        </div>

        {contractSummary ? (
          <div className="contract-summary-card">
            <div className="contract-summary-card__header">
              <div className="contract-summary-card__avatar">
                <InlineCopyButton
                  value={contractSummary.address}
                  ariaLabel="Copy contract address"
                  iconSize={14}
                />
              </div>
              <div className="contract-summary-card__meta">
                <div className="contract-summary-card__title-row">
                  <span className="contract-summary-card__name">
                    {contractSummary.name}
                  </span>
                  {contractSummary.sourceLabel && (
                    <Badge
                      variant="success"
                      size="sm"
                      className="contract-summary-card__badge"
                    >
                      {contractSummary.sourceLabel}
                    </Badge>
                  )}
                </div>
                <div className="contract-summary-card__submeta">
                  <span>{contractSummary.chainLabel}</span>
                  <span className="contract-summary-card__divider">•</span>
                  <span className="contract-summary-card__address">
                    {contractSummary.address}
                  </span>
                </div>
              </div>
              {contractSummary.explorerUrl && (
                <a
                  href={contractSummary.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contract-summary-card__action"
                >
                  ↗
                </a>
              )}
            </div>

            <div className="contract-summary-card__stats">
              <div className="contract-summary-card__stat contract-summary-card__stat--read">
                <span>
                  Read
                </span>
                <strong>{contractSummary.readCount}</strong>
              </div>
              <div className="contract-summary-card__stat contract-summary-card__stat--write">
                <span>
                  Write
                </span>
                <strong>{contractSummary.writeCount}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="contract-function-panel__empty">
            {isContractLoading
              ? "Fetching contract metadata..."
              : "Connect a contract to view details."}
          </div>
        )}
      </div>

      <div className="contract-interaction-card">
        <div className="contract-interaction-card__header">
          <span>Facets</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleFunctionSearch(!showFunctionSearch)}
          >
            {showFunctionSearch ? "Hide" : "Search"}
          </Button>
        </div>

        <div className="function-type-buttons">
          <Button
            variant={selectedFunctionType === "read" ? "primary" : "ghost"}
            className={`function-type-button${
              selectedFunctionType === "read" ? " function-type-button-active" : ""
            }`}
            onClick={() => onFunctionTypeChange("read")}
          >
            <div className="button-text">
              <span>Read Functions</span>
              <Badge variant="accent" size="sm">
                {readFunctions.length}
              </Badge>
            </div>
          </Button>

          <Button
            variant={selectedFunctionType === "write" ? "primary" : "ghost"}
            className={`function-type-button${
              selectedFunctionType === "write" ? " function-type-button-active" : ""
            }`}
            onClick={() => onFunctionTypeChange("write")}
          >
            <div className="button-text">
              <span>Write Functions</span>
              <Badge variant="warning" size="sm">
                {writeFunctions.length}
              </Badge>
            </div>
          </Button>
        </div>

        {showFunctionSearch && (
          <div className="contract-function-search">
            <input
              value={functionSearch}
              onChange={(event) => onFunctionSearchChange(event.target.value)}
              placeholder="Search functions..."
            />
          </div>
        )}

        {selectedFunctionType === "read"
          ? renderFunctions(readFunctions, "read")
          : renderFunctions(writeFunctions, "write")}
      </div>

      {children}
    </div>
  );
};

export default SharedContractInteraction;
