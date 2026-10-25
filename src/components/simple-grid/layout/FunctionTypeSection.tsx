/**
 * FunctionTypeSection - Diamond facet controls, function mode selection, and function type tabs.
 */
import React from "react";
import {
  GemIcon,
  DiamondExplodeIcon,
  AlertTriangleIcon,
} from "../../icons/IconLibrary";
import { FunctionModeToggle, FunctionTypeTabs } from "../../FunctionControls";
import { Label } from "../../ui/label";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { useGridContext } from "../GridContext";
import { getExplorerBaseUrlFromApiUrl } from "../../../utils/chains";

type ExplorerLink = {
  name?: string;
  href: string;
};

export default function FunctionTypeSection({ children }: { children?: React.ReactNode }): React.ReactElement | null {
  const ctx: any = useGridContext();
  const {
    readFunctions,
    writeFunctions,
    isDiamond,
    diamondFacets,
    functionMode,
    setFunctionMode,
    generatedCallData,
    selectedFacet,
    setSelectedFacet,
    selectedNetwork,
    setIsDiamondPopupOpen,
    setDiamondFacets,
    selectedFunctionType,
    setSelectedFunctionType,
    filteredReadFunctions,
    filteredWriteFunctions,
    contractAddress,
  } = ctx;

  const selectedFacetExplorerUrl =
    getExplorerBaseUrlFromApiUrl(
      selectedNetwork?.explorers?.find(
        (e: { type?: string; url?: string }) => e.type === "blockscout"
      )?.url
    ) ||
    selectedNetwork?.blockExplorer ||
    selectedNetwork?.explorerUrl;

  const explorerLinks =
    selectedNetwork?.explorers
      ?.map((explorer: { name?: string; url?: string }) => ({
        name: explorer.name,
        href: getExplorerBaseUrlFromApiUrl(explorer.url),
      }))
      .filter(
        (explorer: { name?: string; href: string }): explorer is ExplorerLink =>
          Boolean(explorer.href)
      ) || [];

  if (
    !(
      readFunctions.length > 0 ||
      writeFunctions.length > 0 ||
      (isDiamond && diamondFacets.length > 0) ||
      functionMode === "raw" ||
      (generatedCallData && generatedCallData !== "0x")
    )
  ) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: "16px",
        paddingTop: "16px",
        borderTop: "1px solid #333",
      }}
    >
      {/* Diamond Facet Controls - only shown for diamond contracts */}
      {isDiamond && diamondFacets.length > 0 && (
        <div
          style={{
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <Select
            value={selectedFacet || ""}
            onValueChange={(v) => setSelectedFacet(v === "__none__" ? "" : v)}
          >
            <SelectTrigger
              className="h-auto"
              style={{
                padding: "6px 8px",
                border: "1px solid #444",
                borderRadius: "6px",
                background: "#151515",
                color: "#ddd",
                fontSize: "13px",
              }}
            >
              <SelectValue placeholder="Select Facet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select Facet</SelectItem>
              {diamondFacets.map((facet: any) => (
                <SelectItem key={facet.address} value={facet.address}>
                  {facet.name ||
                    `Facet ${facet.address.slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Enhanced Explorer links */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              marginTop: "8px",
              flexWrap: "wrap",
            }}
          >
            <Button
              type="button"
              variant="icon-borderless"
              size="icon-inline"
              onClick={() => setIsDiamondPopupOpen(true)}
              title="Inspect diamond"
              style={{
                background: "transparent",
                border: "none",
                color: "#3b82f6",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "6px",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "rgba(59, 130, 246, 0.1)";
                e.currentTarget.style.color = "#2563eb";
                e.currentTarget.style.transform = "scale(1.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#3b82f6";
                e.currentTarget.style.transform = "scale(1)";
              }}
              aria-label="Inspect diamond"
            >
              <DiamondExplodeIcon width={18} height={18} />
            </Button>

            {selectedFacet && (
              <a
                href={`${selectedFacetExplorerUrl}/address/${selectedFacet}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: "12px",
                  color: "#10b981",
                  textDecoration: "none",
                  padding: "4px 8px",
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                 Selected Facet
              </a>
            )}

            {/* Multiple explorer options */}
            {explorerLinks.length > 1 && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#888",
                    display: "flex",
                    gap: "4px",
                  }}
                >
                  |
                  {explorerLinks.map(
                    (explorer: ExplorerLink, index: number) => (
                      <a
                        key={index}
                        href={`${explorer.href}/address/${selectedFacet || contractAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "#6b7280",
                          textDecoration: "underline",
                          fontSize: "11px",
                        }}
                      >
                        {explorer.name}
                      </a>
                    )
                  )}
                </div>
              )}
          </div>

          {/* Unverified Facet ABI Paste */}
          {selectedFacet &&
            (() => {
              const facet = diamondFacets.find(
                (f: any) =>
                  f.address.toLowerCase() ===
                  selectedFacet.toLowerCase()
              );
              return facet && !facet.isVerified ? (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    background: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: "6px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#fbbf24",
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <AlertTriangleIcon
                      width={16}
                      height={16}
                      style={{ marginRight: "6px" }}
                    />
                    Unverified Facet - Paste ABI Below
                  </div>
                  <textarea
                    placeholder="Paste the facet ABI JSON here..."
                    style={{
                      width: "100%",
                      height: "80px",
                      background: "#1a1a1a",
                      border: "1px solid #444",
                      borderRadius: "4px",
                      color: "#e5e7eb",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      padding: "8px",
                      resize: "vertical",
                    }}
                    onChange={(e) => {
                      try {
                        const abiJson = JSON.parse(
                          e.target.value
                        );
                        if (Array.isArray(abiJson)) {
                          // Update the facet with the pasted ABI
                          setDiamondFacets((prev: any[]) =>
                            prev.map((f: any) =>
                              f.address.toLowerCase() ===
                              selectedFacet.toLowerCase()
                                ? {
                                    ...f,
                                    abi: abiJson,
                                    isVerified: true,
                                    source: "Manual Paste",
                                  }
                                : f
                            )
                          );
                        }
                      } catch (error) {
                        // Invalid JSON, ignore
                      }
                    }}
                  />
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#888",
                      marginTop: "4px",
                    }}
                  >
                     Paste valid ABI JSON to enable function
                    calls
                  </div>
                </div>
              ) : null;
            })()}
        </div>
      )}

      {/* Function Mode Selection */}
      <FunctionModeToggle
        value={functionMode}
        onChange={setFunctionMode}
        functionHint="Select from ABI"
        rawLabel="Raw input data"
        rawHint="Direct calldata"
      />

      {functionMode === "function" && (
        <div className="mb-3">
          <Label className="text-xs text-muted-foreground mb-1.5 block">
            Function Type
          </Label>
          <FunctionTypeTabs
            value={selectedFunctionType}
            onChange={setSelectedFunctionType}
            readCount={filteredReadFunctions.length}
            writeCount={filteredWriteFunctions.length}
          />
        </div>
      )}

      {children}
    </div>
  );
}
