/**
 * GridLayout - JSX layout for SimpleGridUI.
 *
 * Thin assembler that composes layout section components.
 * Each section reads state from GridContext internally.
 */
import React from "react";
import { ethers } from "ethers";
import { Button } from "../ui/button";
import { UIIcons } from "../icons/IconMap";
import { InlineFacetLoader } from "../InlineFacetLoader";
import { abbreviateFacet } from "./utils";
import { useGridContext } from "./GridContext";

// Layout sections
import ContractColumn from "./layout/ContractColumn";
import FunctionTypeSection from "./layout/FunctionTypeSection";
import FunctionSearchSection from "./layout/FunctionSearchSection";
import FunctionSelectSection from "./layout/FunctionSelectSection";
import FunctionParamsSection from "./layout/FunctionParamsSection";
import CalldataSection from "./layout/CalldataSection";
import ExecutionSection from "./layout/ExecutionSection";
import FunctionResultSection from "./layout/FunctionResultSection";
import OverridesSidebar from "./layout/OverridesSidebar";
import DiamondPopup from "./layout/DiamondPopup";

type FacetDetailStatus = "pending" | "fetching" | "success" | "error";
type FacetProgressDetail = {
  index: number;
  address: string;
  status: FacetDetailStatus;
};

export default function GridLayout(): React.ReactElement {
  const ctx: any = useGridContext();
  const {
    gridContainerStyle,
    gridStyle,
    contractCardStyle,
    isDiamond,
    selectedNetwork,
    contractAddress,
    functionMode,
    diamondFacets,
    setDiamondFacets,
    setShowFacetSidebar,
    setReadFunctions,
    setWriteFunctions,
    facetLoading,
    facetProgress,
    facetProgressDetails,
    setFacetLoading,
    setFacetProgress,
    setFacetProgressDetails,
    showFacetDetails,
    setShowFacetDetails,
    setSearchProgress,
    facetStatusColors,
    facetStatusLabels,
    showSuccess,
    showError,
  } = ctx;

  // Derived facet detail arrays for the loading progress display
  const completedFacetDetails = (facetProgressDetails || []).filter(
    (detail: FacetProgressDetail) => detail.status === "success"
  );
  const displayedCompletedFacetDetails = completedFacetDetails.slice(-3);
  const currentFacetDetail =
    (facetProgressDetails || []).find((detail: FacetProgressDetail) => detail.status === "fetching") ||
    (facetProgress?.index > 0 && facetProgress.index - 1 < (facetProgressDetails || []).length
      ? (facetProgressDetails || [])[facetProgress.index - 1]
      : undefined);
  const upcomingFacetDetails = (facetProgressDetails || [])
    .filter((detail: FacetProgressDetail) => detail.status === "pending")
    .slice(0, 2);

  return (
    <div
      style={{
        color: "#fff",
        position: "relative",
      }}
    >
      {/* Main Grid */}
      <div style={gridContainerStyle}>
        <div style={gridStyle}>
        {/* LEFT COLUMN - Contract */}
        <div style={contractCardStyle}>
          <ContractColumn />

          {/* Function Controls Block */}
          <FunctionTypeSection>
            {functionMode === "function" && (
              <>
                <FunctionSearchSection />
                <FunctionSelectSection />
                <FunctionParamsSection />
                <CalldataSection />
                <ExecutionSection />
              </>
            )}

            {functionMode === "raw" && (
              <FunctionResultSection />
            )}
          </FunctionTypeSection>

          {/* Diamond Facet Loader */}
          {isDiamond && selectedNetwork && (
            <InlineFacetLoader
              chain={selectedNetwork}
              diamondAddress={contractAddress}
              onFacetsLoaded={(facets) => {
                setDiamondFacets(facets);
                setShowFacetSidebar(true);

                // Update function lists with all facet functions
                const readMap = new Map<
                  string,
                  ethers.utils.FunctionFragment
                >();
                const writeMap = new Map<
                  string,
                  ethers.utils.FunctionFragment
                >();

                const registerFunction = (
                  fragment: ethers.utils.FunctionFragment,
                  includeRead: boolean,
                  includeWrite: boolean
                ) => {
                  const key = fragment.format(
                    ethers.utils.FormatTypes.full
                  );
                  if (includeRead && !readMap.has(key)) {
                    readMap.set(key, fragment);
                  }
                  if (includeWrite && !writeMap.has(key)) {
                    writeMap.set(key, fragment);
                  }
                };

                facets.forEach((facet) => {
                  const rawAbi = (() => {
                    if (!facet.abi) return [];
                    if (Array.isArray(facet.abi)) return facet.abi;
                    try {
                      return JSON.parse(facet.abi as string);
                    } catch {
                      return [];
                    }
                  })();

                  const registerFacetItem = (item: any) => {
                    if (!item || item.type !== "function") return;
                    try {
                      const fragment = ethers.utils.FunctionFragment.from(
                        item
                      );
                      const mutability = fragment.stateMutability;
                      const isRead =
                        mutability === "view" || mutability === "pure";
                      const includeRead = isRead;
                      const includeWrite = !isRead;
                      registerFunction(fragment, includeRead, includeWrite);
                    } catch {
                      // Skip unparseable function fragments
                    }
                  };

                  rawAbi.forEach(registerFacetItem);

                  if (rawAbi.length === 0 && facet.functions) {
                    const combinedFunctions = [
                      ...(Array.isArray(facet.functions.read)
                        ? facet.functions.read
                        : []),
                      ...(Array.isArray(facet.functions.write)
                        ? facet.functions.write
                        : []),
                    ];
                    combinedFunctions.forEach(registerFacetItem);
                  }
                });

                setReadFunctions(Array.from(readMap.values()));
                setWriteFunctions(Array.from(writeMap.values()));
              }}
              hideUI
              onProgressChange={(p) => {
                setFacetProgress(p);
                setFacetProgressDetails((prev: FacetProgressDetail[]) => {
                  let next = prev;
                  if (prev.length === 0 || prev.length !== p.total) {
                    next = Array.from({ length: p.total }, (_, idx) => ({
                      index: idx + 1,
                      address:
                        idx + 1 === p.index && p.currentFacet
                          ? p.currentFacet
                          : prev[idx]?.address || "",
                      status: "pending" as FacetDetailStatus,
                    }));
                  } else {
                    next = prev.map((entry: FacetProgressDetail) => ({ ...entry }));
                  }

                  const idx = p.index - 1;
                  if (idx >= 0 && idx < next.length) {
                    const status: FacetDetailStatus =
                      p.status === "fetching" ? "fetching" : p.status;
                    next[idx] = {
                      ...next[idx],
                      address: p.currentFacet || next[idx].address,
                      status,
                    };
                  }

                  for (let i = 0; i < p.current && i < next.length; i += 1) {
                    if (
                      next[i].status === "pending" ||
                      next[i].status === "fetching"
                    ) {
                      next[i] = { ...next[i], status: "success" };
                    }
                  }

                  return next;
                });
                // Update search progress to show diamond facet loading
                if (p?.currentFacet) {
                  setSearchProgress({
                    source: "Diamond Facets",
                    status: p.status === "error" ? "error" : "searching",
                    message: `Loading facet ${p.index}/${p.total}: ${p.currentFacet}`,
                  });
                }
              }}
              onLoadingChange={(l) => {
                setFacetLoading(l);
                if (l) {
                  setFacetProgressDetails([]);
                  setShowFacetDetails(false);
                }
                if (!l) {
                  // Diamond facet loading completed
                  setSearchProgress({
                    source: "Diamond Facets",
                    status: "found",
                    message: "All facets loaded successfully",
                  });
                }
              }}
            />
          )}

          {/* Diamond Facets controls removed to reuse the existing universal function UI */}

          {/* Facet loading progress (slim) */}
          {isDiamond && facetLoading && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px 10px",
                background: "#1c1c1c",
                border: "1px solid #333",
                borderRadius: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "6px",
                }}
              >
                <div style={{ flexGrow: 1 }}>
                  <div style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "6px" }}>
                    Processing facet
                    <strong style={{ color: "#38bdf8", marginLeft: "6px" }}>
                      {facetProgress.index}/{facetProgress.total}
                    </strong>
                    {facetProgress.currentFacet && (
                      <span style={{ marginLeft: "6px", color: "#cbd5f5" }}>
                        ({abbreviateFacet(facetProgress.currentFacet)})
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {displayedCompletedFacetDetails.map((detail: FacetProgressDetail) => (
                      <span
                        key={`done-${detail.index}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 8px",
                          borderRadius: "0px",
                          fontSize: "12px",
                          background: "rgba(34,197,94,0.15)",
                          color: "#4ade80",
                        }}
                      >
                         {abbreviateFacet(detail.address)}
                      </span>
                    ))}
                    {currentFacetDetail && (
                      <span
                        key={`current-${currentFacetDetail.index}`}
                        className="shimmer-loading"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 8px",
                          borderRadius: "0px",
                          fontSize: "12px",
                          background: "linear-gradient(90deg, rgba(96,165,250,0.18) 0%, rgba(96,165,250,0.35) 50%, rgba(96,165,250,0.18) 100%)",
                          backgroundSize: "200% 100%",
                          color: "#60a5fa",
                        }}
                      >
                        <span aria-hidden="true">{UIIcons.loading}</span>
                        {abbreviateFacet(currentFacetDetail.address)}
                      </span>
                    )}
                    {upcomingFacetDetails.map((detail: FacetProgressDetail) => (
                      <span
                        key={`upcoming-${detail.index}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 8px",
                          borderRadius: "0px",
                          fontSize: "12px",
                          background: "rgba(148,163,184,0.12)",
                          color: "#cbd5f5",
                        }}
                      >
                        {"-> "}{abbreviateFacet(detail.address)}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    Completed {facetProgress.current} / {facetProgress.total}
                  </div>
                  {facetProgress.total > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowFacetDetails((prev: boolean) => !prev)}
                      style={{
                        marginTop: "6px",
                        fontSize: "12px",
                        color: "#a855f7",
                        background: "transparent",
                        border: "1px solid rgba(168,85,247,0.4)",
                        borderRadius: "4px",
                        padding: "2px 6px",
                        cursor: "pointer",
                      }}
                    >
                      {showFacetDetails ? "Hide details" : "Show details"}
                    </Button>
                  )}
                </div>
              </div>
              {showFacetDetails && facetProgressDetails.length > 0 && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    maxHeight: "160px",
                    overflowY: "auto",
                  }}
                >
                  {facetProgressDetails.map((detail: FacetProgressDetail) => (
                      <div
                        key={detail.index}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "12px",
                          color: facetStatusColors[detail.status],
                          marginBottom: "4px",
                          fontFamily: "monospace",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: facetStatusColors[detail.status],
                          }}
                        />
                        <span style={{ flexShrink: 0, minWidth: "72px" }}>
                          Facet {detail.index}:
                        </span>
                        <span style={{ flexGrow: 1 }}>
                          {detail.address || "Pending"}
                        </span>
                        <span style={{ color: "#9ca3af", fontSize: "11px" }}>
                          {facetStatusLabels[detail.status]}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column - Simulation Overrides */}
        <OverridesSidebar />
      </div>
    </div>

    {/* Diamond Contract Popup */}
    <DiamondPopup />
  </div>
  );
}
