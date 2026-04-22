/**
 * FunctionSearchSection - Search popup + search results.
 */
import React from "react";
import { SearchIcon } from "../../icons/IconLibrary";
import type { DiamondFacet } from "../../../utils/diamondFacetFetcher";
import { useGridContext } from "../GridContext";

export default function FunctionSearchSection(): React.ReactElement | null {
  const ctx: any = useGridContext();
  const {
    showFunctionSearch,
    setShowFunctionSearch,
    functionSearch,
    setFunctionSearch,
    searchFilteredFunctions,
    isDiamond,
    diamondFacets,
    setSelectedFacet,
    setSelectedFunctionType,
    setSelectedFunction,
    handleFunctionSelect,
    filteredReadFunctions,
    filteredWriteFunctions,
  } = ctx;

  if (!showFunctionSearch) return null;

  return (
    <div
      style={{ position: "relative", marginBottom: "12px" }}
    >
      {/* Search Popup */}
      {showFunctionSearch && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 1000,
            }}
            onClick={() => {
              setShowFunctionSearch(false);
              setFunctionSearch("");
            }}
          />
          {/* Compact Search Popup */}
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              background: "#1a1a1a",
              border: "1px solid #444",
              borderRadius: "6px",
              padding: "12px",
              minWidth: "300px",
              maxWidth: "400px",
              maxHeight: "300px",
              zIndex: 1001,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
            }}
          >
            <input
              type="text"
              placeholder="Search all functions..."
              value={functionSearch}
              onChange={(e) =>
                setFunctionSearch(e.target.value)
              }
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "#0a0a0a",
                border: "1px solid #444",
                borderRadius: "4px",
                color: "#e5e7eb",
                fontSize: "13px",
                marginBottom: "8px",
              }}
              autoFocus
            />

            {/* Results */}
            <div
              style={{
                maxHeight: "200px",
                overflowY: "auto",
              }}
            >
              {searchFilteredFunctions.length > 0 ? (
                searchFilteredFunctions.map(
                  (func: any, index: number) => (
                    <div
                      key={`search-result-${index}`}
                      style={{
                        padding: "6px 8px",
                        background: "#2a2a2a",
                        border: "1px solid #333",
                        borderRadius: "3px",
                        marginBottom: "4px",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "#3a3a3a";
                        e.currentTarget.style.borderColor =
                          "#555";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "#2a2a2a";
                        e.currentTarget.style.borderColor =
                          "#333";
                      }}
                      onClick={() => {
                        // Set the function type based on the search result
                        setSelectedFunctionType(
                          func.functionType
                        );

                        // For diamond contracts, we need to find the right facet first
                        if (isDiamond) {
                          // Find which facet contains this function
                          let foundFacet: DiamondFacet | null =
                            null;
                          diamondFacets.forEach((facet: any) => {
                            if (Array.isArray(facet.abi)) {
                              const hasFunction = (
                                facet.abi as unknown[]
                              ).some((item) => {
                                const entry = item as {
                                  type?: string;
                                  name?: string;
                                  stateMutability?: string;
                                };
                                const isMatchingType =
                                  func.functionType ===
                                  "read"
                                    ? entry.stateMutability ===
                                        "view" ||
                                      entry.stateMutability ===
                                        "pure"
                                    : !(
                                        entry.stateMutability ===
                                          "view" ||
                                        entry.stateMutability ===
                                          "pure"
                                      );
                                return (
                                  entry?.type ===
                                    "function" &&
                                  entry?.name ===
                                    func.name &&
                                  isMatchingType
                                );
                              });
                              if (hasFunction) {
                                foundFacet = facet;
                              }
                            }
                          });

                          // Select the facet if found
                          if (foundFacet) {
                            setSelectedFacet(
                              (foundFacet as DiamondFacet)
                                .address
                            );
                          }
                        }

                        // Wait for state updates, then find the function in the correct list
                        // Find and select the function immediately
                        const currentFunctions =
                          func.functionType === "read"
                            ? filteredReadFunctions
                            : filteredWriteFunctions;
                        const funcIndex =
                          currentFunctions.findIndex(
                            (f: { name?: string }) => f.name === func.name
                          );
                        if (funcIndex >= 0) {
                          const functionKey = `${func.functionType}-${funcIndex}`;
                          // Set the dropdown value immediately
                          setSelectedFunction(functionKey);
                          handleFunctionSelect(functionKey);
                        }

                        // Close search panel after a short delay to ensure selection completes
                        setTimeout(() => {
                          setShowFunctionSearch(false);
                          setFunctionSearch("");
                        }, 50);
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "2px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: "500",
                            color: "#e5e7eb",
                            fontSize: "12px",
                          }}
                        >
                          {func.name}
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            padding: "1px 4px",
                            borderRadius: "2px",
                            background:
                              func.functionType === "read"
                                ? "#22c55e20"
                                : "#f59e0b20",
                            color:
                              func.functionType === "read"
                                ? "#22c55e"
                                : "#f59e0b",
                            border: `1px solid ${func.functionType === "read" ? "#22c55e40" : "#f59e0b40"}`,
                          }}
                        >
                          {func.functionType === "read"
                            ? "READ"
                            : "WRITE"}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#888",
                          fontFamily: "monospace",
                        }}
                      >
                        (
                        {func.inputs
                          ?.map(
                            (input: { type: string }) =>
                              input.type
                          )
                          .join(", ")}
                        )
                      </div>
                    </div>
                  )
                )
              ) : functionSearch ? (
                <div
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    color: "#888",
                    fontSize: "12px",
                  }}
                >
                  No functions found
                </div>
              ) : (
                <div
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    color: "#888",
                    fontSize: "12px",
                  }}
                >
                  Type to search across all facets...
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
