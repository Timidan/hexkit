import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { SettingsIcon, SearchIcon, ZapIcon } from "./icons/IconLibrary";
import { Card, Button, LoadingSpinner, ErrorDisplay, Badge } from "./shared";
import {
  ContractConnector,
  FunctionCaller,
  type ContractConnectorResult,
} from "./contract";
import { CalldataDecoder, type DecodingResult } from "./decoder";
import { SUPPORTED_CHAINS } from "../utils/chains";
import type { Chain } from "../types";
import {
  fetchDiamondFacets,
  getDiamondFacetAddresses,
  type DiamondFacet,
  type FacetProgressCallback,
} from "../utils/diamondFacetFetcher";
import "../styles/SimpleGridUI.css";

const NewSimpleGridUI: React.FC = () => {
  // Main state
  const [contractSource, setContractSource] = useState<"project" | "address">(
    "address"
  );
  const [functionMode, setFunctionMode] = useState<"function" | "raw">(
    "function"
  );
  const [selectedFunctionType, setSelectedFunctionType] = useState<
    "read" | "write" | null
  >(null);
  const [selectedFunction, setSelectedFunction] =
    useState<ethers.utils.FunctionFragment | null>(null);
  const [generatedCallData, setGeneratedCallData] = useState<string>("0x");
  const [usePendingBlock, setUsePendingBlock] = useState(true);

  // Contract connection state
  const [contractConnection, setContractConnection] =
    useState<ContractConnectorResult | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Diamond facet state
  const [isDiamond, setIsDiamond] = useState(false);
  const [diamondFacets, setDiamondFacets] = useState<DiamondFacet[]>([]);
  const [selectedFacet, setSelectedFacet] = useState<string | null>(null);
  const [showFacetSidebar, setShowFacetSidebar] = useState(false);
  const [facetLoading, setFacetLoading] = useState(false);
  const [facetProgress, setFacetProgress] = useState<{
    current: number;
    total: number;
    currentFacet: string;
    status: "fetching" | "success" | "error";
  }>({ current: 0, total: 0, currentFacet: "", status: "fetching" });

  // Function search
  const [functionSearch, setFunctionSearch] = useState("");
  const [showFunctionSearch, setShowFunctionSearch] = useState(false);

  // Transaction execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);

  // Calldata decoder state
  const [showCalldataDecoder, setShowCalldataDecoder] = useState(false);
  const [calldataToDecodeFromSim, setCalldataToDecodeFromSim] = useState("");

  // Styles
  const headerStyle: React.CSSProperties = {
    fontSize: "32px",
    fontWeight: "bold",
    background: "linear-gradient(45deg, #007bff, #28a745)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    marginBottom: "8px",
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1.6fr 1fr",
    gap: "24px",
    maxWidth: "1600px",
    margin: "0 auto",
  };

  const cardStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)",
    border: "1px solid #333",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
  };

  const subHeaderStyle: React.CSSProperties = {
    fontSize: "20px",
    fontWeight: "600",
    marginBottom: "20px",
    color: "#fff",
  };

  const selectionCardStyle = (isSelected: boolean): React.CSSProperties => ({
    background: isSelected
      ? "linear-gradient(135deg, rgba(0, 123, 255, 0.2) 0%, rgba(40, 167, 69, 0.2) 100%)"
      : "rgba(255, 255, 255, 0.05)",
    border: `1px solid ${isSelected ? "#007bff" : "#333"}`,
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "12px",
    cursor: "pointer",
    transition: "all 0.3s ease",
  });

  // Handle contract connection
  const handleContractConnected = useCallback(
    (result: ContractConnectorResult) => {
      setContractConnection(result);
      setIsConnected(true);

      // Check if it's a diamond contract
      if (result.tokenInfo?.type === "unknown" && result.abi) {
        // Try to detect diamond by checking for diamond-specific functions
        const diamondFunctions = [
          "facets",
          "facetAddresses",
          "facetAddress",
          "facetFunctionSelectors",
        ];
        const hasDiamondFunctions = diamondFunctions.some((funcName) =>
          result.abi.some(
            (item: any) => item.type === "function" && item.name === funcName
          )
        );

        if (hasDiamondFunctions) {
          setIsDiamond(true);
          loadDiamondFacets(result.address, result.chain);
        }
      }
    },
    []
  );

  const handleConnectionError = useCallback((error: string) => {
    console.error("Contract connection error:", error);
    setIsConnected(false);
    setContractConnection(null);
  }, []);

  // Diamond facet loading
  const loadDiamondFacets = useCallback(
    async (address: string, chain: Chain) => {
      setFacetLoading(true);
      setFacetProgress({
        current: 0,
        total: 0,
        currentFacet: "",
        status: "fetching",
      });

      try {
        const progressCallback: FacetProgressCallback = (progress) => {
          setFacetProgress({ ...progress, status: "fetching" });
        };

        // First get the facet addresses
        const facetAddresses = await getDiamondFacetAddresses(chain, address);
        const facets = await fetchDiamondFacets(
          chain,
          facetAddresses,
          progressCallback
        );
        setDiamondFacets(facets);
        setFacetProgress((prev) => ({ ...prev, status: "success" }));
      } catch (error) {
        console.error("Failed to load diamond facets:", error);
        setFacetProgress((prev) => ({ ...prev, status: "error" }));
      } finally {
        setFacetLoading(false);
      }
    },
    []
  );

  // Function selection
  const handleFunctionSelected = useCallback(
    (func: ethers.utils.FunctionFragment, type: "read" | "write") => {
      setSelectedFunction(func);
      setSelectedFunctionType(type);
      setExecutionResult(null);
    },
    []
  );

  // Function execution
  const handleFunctionExecuted = useCallback(
    (result: any) => {
      setExecutionResult(result);
      setIsExecuting(false);

      // If this was a write function and we got a transaction hash, extract calldata for decoder
      if (
        result.success &&
        selectedFunction &&
        selectedFunctionType === "write"
      ) {
        try {
          if (contractConnection?.interface && selectedFunction) {
            const calldata =
              contractConnection.interface.encodeFunctionData(selectedFunction);
            setCalldataToDecodeFromSim(calldata);
            setShowCalldataDecoder(true);
          }
        } catch (error) {
          console.warn("Failed to extract calldata for decoder:", error);
        }
      }
    },
    [selectedFunction, selectedFunctionType, contractConnection]
  );

  const handleExecutionError = useCallback((error: string) => {
    console.error("Function execution error:", error);
    setIsExecuting(false);
  }, []);

  // Calldata decoder handlers
  const handleCalldataDecoded = useCallback((result: DecodingResult) => {
    console.log("Calldata decoded:", result);
  }, []);

  const handleDecodingError = useCallback((error: string) => {
    console.error("Calldata decoding error:", error);
  }, []);

  // Simulation function
  const handleSimulateTransaction = useCallback(async () => {
    if (!contractConnection || !selectedFunction) {
      alert("Please connect a contract and select a function first");
      return;
    }

    setIsExecuting(true);

    try {
      // Generate calldata for simulation
      const calldata =
        contractConnection.interface.encodeFunctionData(selectedFunction);
      setGeneratedCallData(calldata);

      // Set calldata for decoder
      setCalldataToDecodeFromSim(calldata);
      setShowCalldataDecoder(true);

      // You can add actual simulation logic here using Tenderly or other services
      console.log("Simulating transaction with calldata:", calldata);
    } catch (error) {
      console.error("Simulation failed:", error);
    } finally {
      setIsExecuting(false);
    }
  }, [contractConnection, selectedFunction]);

  // Get functions for display (considering facet selection)
  const getFilteredFunctions = useCallback(
    (type: "read" | "write") => {
      if (!contractConnection) return [];

      const baseFunctions =
        type === "read"
          ? contractConnection.readFunctions
          : contractConnection.writeFunctions;

      // If diamond and facet selected, filter by facet
      if (isDiamond && selectedFacet) {
        const facet = diamondFacets.find(
          (f) => f.address.toLowerCase() === selectedFacet.toLowerCase()
        );
        if (facet && facet.abi) {
          const facetInterface = new ethers.utils.Interface(facet.abi as any);
          const facetFunctions = Object.values(facetInterface.functions);
          return facetFunctions.filter((func) => {
            const isRead =
              func.stateMutability === "view" ||
              func.stateMutability === "pure";
            return type === "read" ? isRead : !isRead;
          });
        }
      }

      return baseFunctions;
    },
    [contractConnection, isDiamond, selectedFacet, diamondFacets]
  );

  // Search filtered functions
  const getSearchFilteredFunctions = useCallback(
    (type: "read" | "write") => {
      const functions = getFilteredFunctions(type);
      if (!functionSearch.trim()) return functions;

      const query = functionSearch.toLowerCase();
      return functions.filter(
        (func) =>
          func.name.toLowerCase().includes(query) ||
          func.format("minimal").toLowerCase().includes(query)
      );
    },
    [getFilteredFunctions, functionSearch]
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#fff",
        padding: "20px",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <h1 style={headerStyle}>New Simulation</h1>
        <p style={{ color: "#888", fontSize: "16px" }}>
          Configure and simulate blockchain transactions
        </p>
      </div>

      {/* Main Grid */}
      <div style={gridStyle}>
        {/* LEFT COLUMN - Contract */}
        <div style={cardStyle}>
          <h2 style={subHeaderStyle}>🔧 Contract</h2>

          {/* Contract Source Selection */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={selectionCardStyle(contractSource === "project")}
              onClick={() => setContractSource("project")}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "2px solid #007bff",
                    background:
                      contractSource === "project" ? "#007bff" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {contractSource === "project" && (
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#fff",
                      }}
                    />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: "500" }}>Select from Project</div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    Choose from saved contracts
                  </div>
                </div>
              </div>
            </div>

            <div
              style={selectionCardStyle(contractSource === "address")}
              onClick={() => setContractSource("address")}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "2px solid #007bff",
                    background:
                      contractSource === "address" ? "#007bff" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {contractSource === "address" && (
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#fff",
                      }}
                    />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: "500" }}>Contract Address</div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    Enter contract address directly
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contract Connection - only show for address mode */}
          {contractSource === "address" && (
            <div style={{ marginBottom: "24px" }}>
              <ContractConnector
                onContractConnected={handleContractConnected}
                onConnectionError={handleConnectionError}
                showAdvancedFeatures={true}
                supportedChains={SUPPORTED_CHAINS}
              />
            </div>
          )}

          {/* Project Selection - placeholder for future */}
          {contractSource === "project" && (
            <Card variant="glass" padding="md">
              <div
                style={{ textAlign: "center", padding: "20px", color: "#888" }}
              >
                <SettingsIcon
                  width={32}
                  height={32}
                  style={{ marginBottom: "12px", opacity: 0.5 }}
                />
                <p>Project contracts coming soon!</p>
                <p style={{ fontSize: "14px" }}>
                  Save and manage your favorite contracts
                </p>
              </div>
            </Card>
          )}

          {/* Diamond Facets */}
          {isDiamond && diamondFacets.length > 0 && (
            <div style={{ marginBottom: "24px" }}>
              <Card title="💎 Diamond Facets" variant="accent" padding="sm">
                <div
                  style={{
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Badge variant="info" size="sm">
                    {diamondFacets.length} facets
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFacetSidebar(!showFacetSidebar)}
                  >
                    {showFacetSidebar ? "Hide" : "Show"} Details
                  </Button>
                </div>

                {facetLoading && contractConnection && (
                  <div
                    style={{ padding: "8px", fontSize: "12px", color: "#888" }}
                  >
                    Loading facets... {facetProgress.current}/
                    {facetProgress.total}
                    {facetProgress.currentFacet &&
                      ` (${facetProgress.currentFacet})`}
                  </div>
                )}

                {showFacetSidebar && !facetLoading && (
                  <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                    {diamondFacets.map((facet, index) => (
                      <div
                        key={facet.address}
                        style={{
                          padding: "8px",
                          margin: "4px 0",
                          background:
                            selectedFacet === facet.address
                              ? "rgba(0, 123, 255, 0.2)"
                              : "rgba(255, 255, 255, 0.05)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                        onClick={() =>
                          setSelectedFacet(
                            selectedFacet === facet.address
                              ? null
                              : facet.address
                          )
                        }
                      >
                        <div style={{ fontWeight: "500" }}>
                          {facet.name || `Facet ${index + 1}`}
                        </div>
                        <div style={{ color: "#888", fontSize: "10px" }}>
                          {facet.address.slice(0, 8)}...
                          {facet.address.slice(-6)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - Function & Execution */}
        <div style={cardStyle}>
          <h2 style={subHeaderStyle}>
            <SettingsIcon
              width={16}
              height={16}
              style={{ marginRight: "6px" }}
            />
            Function
          </h2>

          {/* Function Mode Selection */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={selectionCardStyle(functionMode === "function")}
              onClick={() => setFunctionMode("function")}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "2px solid #007bff",
                    background:
                      functionMode === "function" ? "#007bff" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {functionMode === "function" && (
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#fff",
                      }}
                    />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: "500" }}>Function</div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    Select from contract functions
                  </div>
                </div>
              </div>
            </div>

            <div
              style={selectionCardStyle(functionMode === "raw")}
              onClick={() => setFunctionMode("raw")}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "2px solid #007bff",
                    background:
                      functionMode === "raw" ? "#007bff" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {functionMode === "raw" && (
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#fff",
                      }}
                    />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: "500" }}>Raw Calldata</div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    Enter calldata directly
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Function Selection */}
          {functionMode === "function" && isConnected && contractConnection && (
            <div style={{ marginBottom: "24px" }}>
              {/* Function Search */}
              <div
                style={{ marginBottom: "16px", display: "flex", gap: "8px" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFunctionSearch(!showFunctionSearch)}
                  icon={<SearchIcon width={14} height={14} />}
                >
                  Search Functions
                </Button>
                {getFilteredFunctions("read").length +
                  getFilteredFunctions("write").length >
                  0 && (
                  <Badge variant="info" size="sm">
                    {getFilteredFunctions("read").length} read,{" "}
                    {getFilteredFunctions("write").length} write
                  </Badge>
                )}
              </div>

              {showFunctionSearch && (
                <div style={{ marginBottom: "16px" }}>
                  <input
                    type="text"
                    value={functionSearch}
                    onChange={(e) => setFunctionSearch(e.target.value)}
                    placeholder="Search functions..."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "rgba(255, 255, 255, 0.1)",
                      border: "1px solid #333",
                      borderRadius: "6px",
                      color: "#fff",
                      fontSize: "14px",
                    }}
                  />
                </div>
              )}

              {/* Read Functions */}
              {getSearchFilteredFunctions("read").length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <div
                    style={{
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <h4
                      style={{ margin: 0, fontSize: "14px", fontWeight: "500" }}
                    >
                      Read Functions
                    </h4>
                    <Badge variant="info" size="sm">
                      {getSearchFilteredFunctions("read").length}
                    </Badge>
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    {getSearchFilteredFunctions("read").map((func, index) => (
                      <button
                        key={`${func.name}_${index}`}
                        onClick={() => handleFunctionSelected(func, "read")}
                        style={{
                          padding: "8px 12px",
                          background:
                            selectedFunction?.name === func.name &&
                            selectedFunctionType === "read"
                              ? "rgba(0, 123, 255, 0.2)"
                              : "rgba(255, 255, 255, 0.05)",
                          border: "1px solid #333",
                          borderRadius: "6px",
                          color: "#fff",
                          fontSize: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "background 0.2s ease",
                        }}
                      >
                        <div style={{ fontWeight: "500" }}>{func.name}</div>
                        <div style={{ fontSize: "10px", color: "#888" }}>
                          {func.inputs.map((input) => input.type).join(", ") ||
                            "no params"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Write Functions */}
              {getSearchFilteredFunctions("write").length > 0 && (
                <div>
                  <div
                    style={{
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <h4
                      style={{ margin: 0, fontSize: "14px", fontWeight: "500" }}
                    >
                      Write Functions
                    </h4>
                    <Badge variant="warning" size="sm">
                      {getSearchFilteredFunctions("write").length}
                    </Badge>
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    {getSearchFilteredFunctions("write").map((func, index) => (
                      <button
                        key={`${func.name}_${index}`}
                        onClick={() => handleFunctionSelected(func, "write")}
                        style={{
                          padding: "8px 12px",
                          background:
                            selectedFunction?.name === func.name &&
                            selectedFunctionType === "write"
                              ? "rgba(255, 193, 7, 0.2)"
                              : "rgba(255, 255, 255, 0.05)",
                          border: "1px solid #333",
                          borderRadius: "6px",
                          color: "#fff",
                          fontSize: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "background 0.2s ease",
                        }}
                      >
                        <div style={{ fontWeight: "500" }}>{func.name}</div>
                        <div style={{ fontSize: "10px", color: "#888" }}>
                          {func.inputs.map((input) => input.type).join(", ") ||
                            "no params"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Raw Calldata Mode */}
          {functionMode === "raw" && (
            <div style={{ marginBottom: "24px" }}>
              <CalldataDecoder
                calldata={calldataToDecodeFromSim}
                onDecoded={handleCalldataDecoded}
                onError={handleDecodingError}
                showAdvancedOptions={true}
              />
            </div>
          )}

          {/* Function Execution */}
          {functionMode === "function" &&
            isConnected &&
            selectedFunction &&
            contractConnection && (
              <div style={{ marginBottom: "24px" }}>
                <FunctionCaller
                  contractInterface={contractConnection.interface}
                  contractAddress={contractConnection.address}
                  network={contractConnection.chain}
                  selectedFunction={selectedFunction}
                  onFunctionCalled={handleFunctionExecuted}
                  onCallError={handleExecutionError}
                  showGasEstimation={true}
                  showValueInput={true}
                />
              </div>
            )}

          {/* Transaction Parameters Section */}
          <div style={{ marginBottom: "24px" }}>
            <Card
              title="Transa⚡ ction Parameters"
              variant="glass"
              padding="sm"
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <label
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <input
                    type="checkbox"
                    checked={usePendingBlock}
                    onChange={(e) => setUsePendingBlock(e.target.checked)}
                  />
                  <span style={{ fontSize: "14px" }}>Use pending block</span>
                </label>

                <div style={{ fontSize: "12px", color: "#888" }}>
                  Access Lists: Coming soon
                </div>
              </div>
            </Card>
          </div>

          {/* Simulation Button */}
          <div style={{ marginTop: "24px" }}>
            <Button
              onClick={handleSimulateTransaction}
              loading={isExecuting}
              disabled={
                !isConnected || !selectedFunction || functionMode !== "function"
              }
              variant="primary"
              icon={<ZapIcon width={16} height={16} />}
              fullWidth
            >
              {isExecuting ? "Simulating..." : "Simulate Transaction"}
            </Button>
          </div>
        </div>
      </div>

      {/* Calldata Decoder Section - Full Width Below */}
      {showCalldataDecoder && (
        <div style={{ maxWidth: "1400px", margin: "24px auto 0" }}>
          <CalldataDecoder
            calldata={calldataToDecodeFromSim}
            onDecoded={handleCalldataDecoded}
            onError={handleDecodingError}
            showAdvancedOptions={true}
          />
        </div>
      )}
    </div>
  );
};

export default NewSimpleGridUI;
