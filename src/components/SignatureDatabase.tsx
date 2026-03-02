import React from "react";
import { AlertCircle } from "lucide-react";
import { AnimatedTabContent } from "./ui/animated-tabs";
import { Alert, AlertDescription } from "./ui/alert";
import "../styles/SignatureDatabase.css";

import {
  useSignatureDatabase,
  LookupTab,
  SearchTab,
  ToolsTab,
  CustomTab,
  CacheTab,
  FileUploadModal,
} from "./signature-database";
import type { SignatureDatabaseProps } from "./signature-database";

export type { TabType, ToolSubTab } from "./signature-database";

const SignatureDatabase: React.FC<SignatureDatabaseProps> = ({
  initialTab = "lookup",
  initialToolSubTab = "selector",
}) => {
  const db = useSignatureDatabase(initialTab, initialToolSubTab);

  return (
    <div className="bg-background px-2 py-3 sm:px-3 max-w-4xl mx-auto">
      <div className="tool-content-container">
        {/* Animated tab content with blur transition */}
        <AnimatedTabContent activeKey={db.activeTab}>
          {db.activeTab === "lookup" && (
            <LookupTab
              lookupInput={db.lookupInput}
              setLookupInput={db.setLookupInput}
              lookupType={db.lookupType}
              setLookupType={db.setLookupType}
              lookupResults={db.lookupResults}
              isLookingUp={db.isLookingUp}
              handleLookup={db.handleLookup}
            />
          )}

          {db.activeTab === "search" && (
            <SearchTab
              searchQuery={db.searchQuery}
              setSearchQuery={db.setSearchQuery}
              isSearchStale={db.isSearchStale}
              isSearching={db.isSearching}
              searchProgress={db.searchProgress}
              handleSearch={db.handleSearch}
              searchResults={db.searchResults}
              flattenedFunctionResults={db.flattenedFunctionResults}
              flattenedEventResults={db.flattenedEventResults}
              error={db.error}
            />
          )}

          {db.activeTab === "tools" && (
            <ToolsTab
              activeToolSubTab={db.activeToolSubTab}
              setActiveToolSubTab={db.setActiveToolSubTab}
              calculatorSignature={db.calculatorSignature}
              setCalculatorSignature={db.setCalculatorSignature}
              calculatorResult={db.calculatorResult}
            />
          )}

          {db.activeTab === "custom" && (
            <CustomTab
              abiInput={db.abiInput}
              setAbiInput={db.setAbiInput}
              contractPath={db.contractPath}
              setContractPath={db.setContractPath}
              extractedSignatures={db.extractedSignatures}
              isExtracting={db.isExtracting}
              extractSignaturesFromABI={db.extractSignaturesFromABI}
              addExtractedSignatures={db.addExtractedSignatures}
              addAllExtractedSignatures={db.addAllExtractedSignatures}
              openFileModal={db.openFileModal}
              selectedFiles={db.selectedFiles}
              setSelectedFiles={db.setSelectedFiles}
              customSignature={db.customSignature}
              setCustomSignature={db.setCustomSignature}
              handleAddCustomSignature={db.handleAddCustomSignature}
              customSignatures={db.customSignatures}
              customOpen={db.customOpen}
              setCustomOpen={db.setCustomOpen}
              clearCache={db.clearCache}
            />
          )}

          {db.activeTab === "cache" && (
            <CacheTab
              flattenedCachedFunctions={db.flattenedCachedFunctions}
              flattenedCachedEvents={db.flattenedCachedEvents}
              flattenedCachedErrors={db.flattenedCachedErrors}
              functionsOpen={db.functionsOpen}
              setFunctionsOpen={db.setFunctionsOpen}
              eventsOpen={db.eventsOpen}
              setEventsOpen={db.setEventsOpen}
              errorsOpen={db.errorsOpen}
              setErrorsOpen={db.setErrorsOpen}
              clearCache={db.clearCache}
            />
          )}
        </AnimatedTabContent>

        {/* Error Display */}
        {db.error && db.activeTab !== "search" && (
          <Alert variant="destructive" className="mt-3 py-2">
            <AlertCircle className="h-3 w-3" />
            <AlertDescription className="text-xs">{db.error}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* File Upload Modal */}
      <FileUploadModal
        showFileModal={db.showFileModal}
        setShowFileModal={db.setShowFileModal}
        selectedFiles={db.selectedFiles}
        parsedContracts={db.parsedContracts}
        selectedContracts={db.selectedContracts}
        isExtracting={db.isExtracting}
        handleFileSelect={db.handleFileSelect}
        handleContractSelection={db.handleContractSelection}
        selectAllContracts={db.selectAllContracts}
        deselectAllContracts={db.deselectAllContracts}
      />
    </div>
  );
};

export default SignatureDatabase;
