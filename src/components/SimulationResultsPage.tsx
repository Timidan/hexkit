import React, { Suspense } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { AnimatedTabContent } from "./ui/animated-tabs";
import { Button } from "./ui/button";
import "../styles/SimulationResultsPage.css";

// Sub-module imports
import type { SimulationResultsPageProps, SimulatorTab } from "./simulation-results/types";
import { useSimulationPageState } from "./simulation-results/useSimulationPageState";
import { resolveFunctionName, computeGasValues, resolveReturnData } from "./simulation-results/gasHelpers";
import type { ContractContextExtras } from "./simulation-results/useSimulationPageState";
import { ResultsHeader } from "./simulation-results/ResultsHeader";
import { TransactionSummary } from "./simulation-results/TransactionSummary";
import { SummaryTab } from "./simulation-results/SummaryTab";
import { ContractsTab } from "./simulation-results/ContractsTab";
import { EventsTab } from "./simulation-results/EventsTab";
import { StateTab } from "./simulation-results/StateTab";

const DebugWindowWithContext = React.lazy(async () => {
  const module = await import("./debug/DebugWindow");
  return { default: module.DebugWindowWithContext };
});

const SimulationResultsPage: React.FC<SimulationResultsPageProps> = (props) => {
  const state = useSimulationPageState(props);

  const {
    id, navigate,
    result, artifacts, contractContext, contextSimulationId,
    activeTab, setActiveTab,
    searchQuery, setSearchQuery, deferredSearchQuery,
    traceFilters, handleToggleFilter,
    highlightedTraceRow, highlightedValue, setHighlightedValue,
    isLoadingFromHistory, loadError,
    lookedUpEventNames, eventNameFilter, setEventNameFilter,
    eventContractFilter, setEventContractFilter,
    decodedTrace, isTraceDecoding, filteredTraceRows,
    traceDiagnostics, revertInfo, revertRowId,
    handleBack, handleReSimulate, handleExportTestData,
    handleShare, handleGoToRevert, handleOpenDebug,
    isDebugging, isDebugLoading, closeDebugWindow,
    debugPrepState, cancelDebugPrep, hasLiveDebugSession,
    callTree,
    formatAddressWithName, normalizeValue,
  } = state;

  if (isLoadingFromHistory) {
    return (
      <div className="sim-results-page">
        <div className="sim-results-empty">
          <p>Loading simulation from history...</p>
          <div className="sim-loading-spinner" />
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="sim-results-page">
        <div className="sim-results-empty">
          {loadError ? (
            <div className="sim-not-found">
              <div className="sim-not-found__icon">Search</div>
              <h2 className="sim-not-found__title">{loadError}</h2>
              <p className="sim-not-found__subtitle">
                This simulation ID doesn't exist in your local history.
                Simulations are stored in your browser's IndexedDB and may have been cleared.
              </p>
              <div className="sim-not-found__actions">
                <Button onClick={() => navigate('/evm/simulations')} variant="outline">
                  View Simulation History
                </Button>
                <Button onClick={handleBack} variant="secondary">
                  <ArrowLeft size={16} />
                  Go to Builder
                </Button>
              </div>
            </div>
          ) : (
            <p>No simulation data available</p>
          )}
          {!loadError && (
            <Button onClick={handleBack} variant="secondary" className="sim-btn-secondary">
              <ArrowLeft size={16} />
              Go Back
            </Button>
          )}
        </div>
      </div>
    );
  }

  const statusColor = result.success ? "var(--sim-success)" : "var(--sim-error)";
  const statusLabel = result.success ? "Success" : "Failed";
  const statusIcon = result.success ? "\u2713" : "\u2717";

  const hash = id || Date.now().toString();
  const network = contractContext?.networkName || "Ethereum";
  const blockNumber = result.blockNumber ? String(result.blockNumber) : "\u2014";

  const rootCall = callTree && callTree.length > 0 ? callTree[0] : null;
  const from = result.from || rootCall?.from || "0x0000000000000000000000000000000000000000";
  const to = result.to || contractContext?.address || rootCall?.to || "\u2014";
  const value = result.value || rootCall?.value?.toString() || "0";
  const rawInput = result.data || rootCall?.input || "0x";

  const functionName = resolveFunctionName(result, rootCall, decodedTrace, rawInput, contractContext);
  const { gasUsed, gasLimit, gasPrice, nonce, txFee, txType } = computeGasValues(
    result, decodedTrace, rawInput, contractContext
  );
  const returnData = resolveReturnData(decodedTrace, artifacts, rootCall, rawInput);
  const errorMessage = result.error || result.revertReason || null;

  const contextWithExtras = contractContext as (typeof contractContext & ContractContextExtras);

  return (
    <div className="sim-results-page">
      {!isDebugging && (
        <>
          <ResultsHeader
            statusColor={statusColor}
            statusLabel={statusLabel}
            statusIcon={statusIcon}
            handleBack={handleBack}
            handleExportTestData={handleExportTestData}
            handleShare={handleShare}
            handleOpenDebug={handleOpenDebug}
            handleReSimulate={handleReSimulate}
            closeDebugWindow={closeDebugWindow}
            isDebugging={isDebugging}
            isDebugLoading={isDebugLoading}
            debugEnabled={contextWithExtras?.debugEnabled}
            hasLiveDebugSession={hasLiveDebugSession}
            debugPrepState={debugPrepState}
            cancelDebugPrep={cancelDebugPrep}
          />

          <TransactionSummary
            hash={hash}
            network={network}
            statusColor={statusColor}
            statusIcon={statusIcon}
            statusLabel={statusLabel}
            blockNumber={blockNumber}
            result={result}
            from={from}
            to={to}
            functionName={functionName}
            value={value}
            txFee={txFee}
            gasUsed={gasUsed}
            gasLimit={gasLimit}
            gasPrice={gasPrice}
            txType={txType}
            nonce={nonce}
            chainId={contractContext?.networkId || 1}
            formatAddressWithName={formatAddressWithName}
            normalizeValue={normalizeValue}
            highlightedValue={highlightedValue}
            setHighlightedValue={setHighlightedValue}
          />

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as SimulatorTab)}
            className="sim-tabs-container"
          >
            <nav className="sim-tabs-wrapper responsive-scroll">
              <TabsList className="sim-tabs-list">
                <TabsTrigger value="summary" className="sim-tab-trigger">Summary</TabsTrigger>
                <TabsTrigger value="contracts" className="sim-tab-trigger">Contracts</TabsTrigger>
                <TabsTrigger value="events" className="sim-tab-trigger">Events</TabsTrigger>
                <TabsTrigger value="state" className="sim-tab-trigger">State</TabsTrigger>
              </TabsList>
            </nav>

            <AnimatedTabContent activeKey={activeTab} className="sim-tab-content responsive-scroll">
              {activeTab === "summary" && (
                <SummaryTab
                  result={result}
                  artifacts={artifacts}
                  errorMessage={errorMessage}
                  revertInfo={revertInfo}
                  filteredTraceRows={filteredTraceRows}
                  isTraceDecoding={isTraceDecoding}
                  deferredSearchQuery={deferredSearchQuery}
                  setSearchQuery={setSearchQuery}
                  traceFilters={traceFilters}
                  handleToggleFilter={handleToggleFilter}
                  handleGoToRevert={handleGoToRevert}
                  revertRowId={revertRowId}
                  rawInput={rawInput}
                  returnData={returnData}
                  decodedTrace={decodedTrace}
                  traceDiagnostics={traceDiagnostics}
                  highlightedValue={highlightedValue}
                  setHighlightedValue={setHighlightedValue}
                />
              )}
              {activeTab === "contracts" && (
                <ContractsTab result={result} contractContext={contractContext} />
              )}
              {activeTab === "events" && (
                <EventsTab
                  result={result}
                  artifacts={artifacts}
                  contractContext={contractContext}
                  decodedTrace={decodedTrace}
                  lookedUpEventNames={lookedUpEventNames}
                  eventNameFilter={eventNameFilter}
                  setEventNameFilter={setEventNameFilter}
                  eventContractFilter={eventContractFilter}
                  setEventContractFilter={setEventContractFilter}
                />
              )}
              {activeTab === "state" && (
                <StateTab result={result} artifacts={artifacts} contractContext={contractContext} />
              )}
            </AnimatedTabContent>
          </Tabs>
        </>
      )}

      {isDebugging && (
        <Suspense
          fallback={(
            <div className="sim-results-page">
              <div className="sim-results-empty">
                <p>Opening debugger...</p>
                <div className="sim-loading-spinner" />
              </div>
            </div>
          )}
        >
          <DebugWindowWithContext />
        </Suspense>
      )}
    </div>
  );
};

export default SimulationResultsPage;
