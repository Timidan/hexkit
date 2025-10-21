import React from "react";
import type { ethers } from "ethers";
import ContractSummaryCard from "./ContractSummaryCard";
import FunctionSelector from "./FunctionSelector";
import type { ContractConnectorResult } from "./ContractConnector";

interface ContractInteractionPanelProps {
  connection: ContractConnectorResult | null;
  metadata?: React.ComponentProps<typeof ContractSummaryCard>["metadata"];
  readFunctions: ethers.utils.FunctionFragment[];
  writeFunctions: ethers.utils.FunctionFragment[];
  selectedFunctionType: "read" | "write" | null;
  onFunctionTypeChange: (type: "read" | "write" | null) => void;
  selectedFunctionName: string | null;
  onFunctionChange: (name: string | null) => void;
  functionSearch: string;
  onSearchChange: (value: string) => void;
  showFunctionSearch: boolean;
  onToggleSearch: (show: boolean) => void;
  selectedFunctionFragment: ethers.utils.FunctionFragment | null;
  renderFunctionDetails?: (context: {
    connection: ContractConnectorResult;
    selectedFunctionFragment: ethers.utils.FunctionFragment | null;
  }) => React.ReactNode;
  headerSlot?: React.ReactNode;
}

const ContractInteractionPanel: React.FC<ContractInteractionPanelProps> = ({
  connection,
  metadata,
  readFunctions,
  writeFunctions,
  selectedFunctionType,
  onFunctionTypeChange,
  selectedFunctionName,
  onFunctionChange,
  functionSearch,
  onSearchChange,
  showFunctionSearch,
  onToggleSearch,
  selectedFunctionFragment,
  renderFunctionDetails,
  headerSlot,
}) => {
  if (!connection) {
    return null;
  }

  return (
    <div className="contract-interaction-stack">
      <div className="contract-interaction-card">
        <div className="contract-interaction-card__header">
          <span>Contract Overview</span>
        </div>
        <ContractSummaryCard connection={connection} metadata={metadata ?? null} />
      </div>

      <div className="contract-interaction-card">
        <div className="contract-interaction-card__header">
          <span>FACETS</span>
          {headerSlot}
        </div>
        <FunctionSelector
          selectedFunctionType={selectedFunctionType}
          onFunctionTypeChange={onFunctionTypeChange}
          selectedFunction={selectedFunctionName}
          onFunctionChange={onFunctionChange}
          readFunctions={readFunctions}
          writeFunctions={writeFunctions}
          functionSearch={functionSearch}
          onSearchChange={onSearchChange}
          showFunctionSearch={showFunctionSearch}
          onToggleSearch={onToggleSearch}
        />

        {renderFunctionDetails &&
          renderFunctionDetails({
            connection,
            selectedFunctionFragment,
          })}
      </div>
    </div>
  );
};

export default ContractInteractionPanel;
