import React, { useState, useCallback, useEffect } from "react";
import {
  fetchDiamondFacets,
  getDiamondFacetAddresses,
  type DiamondFacet,
} from "../utils/diamondFacetFetcher";
import type { Chain } from "../types";

interface InlineFacetLoaderProps {
  chain: Chain;
  diamondAddress: string;
  onFacetsLoaded: (facets: DiamondFacet[]) => void;
  hideUI?: boolean;
  onProgressChange?: (progress: {
    current: number;
    total: number;
    currentFacet: string;
    status: "fetching" | "success" | "error";
    index: number;
  }) => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

interface FacetProgress {
  current: number;
  total: number;
  currentFacet: string;
  status: "fetching" | "success" | "error";
  index: number;
}

type FacetDetailStatus = "pending" | "fetching" | "success" | "error";

interface FacetDetailEntry {
  index: number;
  address: string;
  status: FacetDetailStatus;
}

export const InlineFacetLoader: React.FC<InlineFacetLoaderProps> = ({
  chain,
  diamondAddress,
  onFacetsLoaded,
  hideUI = false,
  onProgressChange,
  onLoadingChange,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<FacetProgress>({
    current: 0,
    total: 0,
    currentFacet: "",
    status: "fetching",
    index: 0,
  });
  const [facetDetails, setFacetDetails] = useState<FacetDetailEntry[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [facets, setFacets] = useState<DiamondFacet[]>([]);
  const [error, setError] = useState<string | null>(null);

  const detailStatusColors: Record<FacetDetailStatus, string> = {
    pending: "#6b7280",
    fetching: "#38bdf8",
    success: "#22c55e",
    error: "#ef4444",
  };

  const detailStatusLabels: Record<FacetDetailStatus, string> = {
    pending: "Pending",
    fetching: "Loading",
    success: "Ready",
    error: "Error",
  };
  const abbreviate = (address: string) =>
    address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  const loadFacets = useCallback(async () => {
    try {
      setIsLoading(true);
      onLoadingChange?.(true);
      setError(null);
      setFacets([]);
      setShowDetails(false);
      setFacetDetails([]);

      // Get facet addresses
      const facetAddresses = await getDiamondFacetAddresses(
        chain,
        diamondAddress
      );

      setProgress({
        current: 0,
        total: facetAddresses.length,
        currentFacet: "",
        status: "fetching",
        index: 0,
      });
      setFacetDetails(
        facetAddresses.map((address, idx) => ({
          index: idx + 1,
          address,
          status: "pending" as FacetDetailStatus,
        }))
      );

      if (facetAddresses.length === 0) {
        setError("No facets found for this Diamond contract");
        setIsLoading(false);
        onLoadingChange?.(false);
        return;
      }

      // Fetch facet ABIs with progress tracking
      const loadedFacets = await fetchDiamondFacets(
        chain,
        facetAddresses,
        (p) => {
          setProgress(p);
          setFacetDetails((prev) => {
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
              next = prev.map((entry) => ({ ...entry }));
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
          onProgressChange?.(p);
        }
      );

      setFacets(loadedFacets);
      onFacetsLoaded(loadedFacets);
      setIsLoading(false);
      onLoadingChange?.(false);
    } catch (error) {
      console.error("Diamond facet loading failed:", error);
      setError(
        `Failed to load facets: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  }, [
    chain,
    diamondAddress,
    onFacetsLoaded,
    onProgressChange,
    onLoadingChange,
  ]);

  const completedFacets = facetDetails.filter(
    (detail) => detail.status === "success"
  );
  const displayedCompleted = completedFacets.slice(-3);
  const currentFacetEntry =
    facetDetails.find((detail) => detail.status === "fetching") ||
    (progress.index > 0 && progress.index - 1 < facetDetails.length
      ? facetDetails[progress.index - 1]
      : undefined);
  const upcomingFacets = facetDetails
    .filter((detail) => detail.status === "pending")
    .slice(0, 2);

  // Auto-load facets when component mounts or inputs change
  useEffect(() => {
    // Only auto-load if we have a valid diamond address
    if (
      diamondAddress &&
      diamondAddress.startsWith("0x") &&
      diamondAddress.length === 42
    ) {
      void loadFacets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain.id, diamondAddress]);

  if (hideUI) {
    return null;
  }

  return (
    <div
      style={{
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "8px",
        padding: "16px",
        margin: "16px 0",
        backgroundColor: "rgba(255, 255, 255, 0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <h4
          style={{
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: "600",
            margin: 0,
          }}
        >
          Diamond Facets
        </h4>

        <div style={{ display: "flex", gap: "8px" }}>
          {facetDetails.length > 0 && (
            <button
              onClick={() => setShowDetails((prev) => !prev)}
              style={{
                backgroundColor: "transparent",
                color: "#a855f7",
                border: "1px solid rgba(168, 85, 247, 0.4)",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
          )}

          {!isLoading && facets.length === 0 && (
            <button
              onClick={loadFacets}
              style={{
                backgroundColor: "#6366f1",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "14px",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#5b5bd6";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#6366f1";
              }}
            >
              Load Facets
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            color: "#ef4444",
            fontSize: "14px",
            marginBottom: "16px",
            padding: "8px 12px",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            borderRadius: "6px",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          {error}
        </div>
      )}

      {isLoading && (
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div style={{ flexGrow: 1 }}>
              <div style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "8px" }}>
                Processing facet
                <strong style={{ color: "#38bdf8", marginLeft: "6px" }}>
                  {progress.index}/{progress.total}
                </strong>
                {progress.currentFacet && (
                  <span style={{ marginLeft: "6px", color: "#cbd5f5" }}>
                    ({abbreviate(progress.currentFacet)})
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {displayedCompleted.map((detail) => (
                  <span
                    key={`done-${detail.index}`}
                    className="facet-pill"
                    data-status="done"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 8px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      background: "rgba(34,197,94,0.15)",
                      color: "#4ade80",
                    }}
                  >
                    ✔ {abbreviate(detail.address)}
                  </span>
                ))}

                {currentFacetEntry && (
                  <span
                    key={`current-${currentFacetEntry.index}`}
                    className="facet-pill"
                    data-status="current"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 8px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      background: "rgba(96,165,250,0.18)",
                      color: "#60a5fa",
                    }}
                  >
                    ⏳ {abbreviate(currentFacetEntry.address)}
                  </span>
                )}

                {upcomingFacets.map((detail) => (
                  <span
                    key={`upcoming-${detail.index}`}
                    className="facet-pill"
                    data-status="upcoming"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 8px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      background: "rgba(148,163,184,0.12)",
                      color: "#cbd5f5",
                    }}
                  >
                    → {abbreviate(detail.address)}
                  </span>
                ))}
              </div>
            </div>

            <span
              style={{ color: "#ffffff", fontSize: "14px", fontWeight: "500" }}
            >
              Completed {progress.current} / {progress.total}
            </span>
          </div>
        </div>
      )}

      {showDetails && facetDetails.length > 0 && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            maxHeight: "180px",
            overflowY: "auto",
          }}
        >
          {facetDetails.map((detail) => {
            return (
              <div
                key={detail.index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  color: detailStatusColors[detail.status],
                  marginBottom: "6px",
                  fontFamily: "monospace",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: detailStatusColors[detail.status],
                  }}
                />
                <span style={{ flexShrink: 0, minWidth: "82px" }}>
                  Facet {detail.index}:
                </span>
                <span style={{ flexGrow: 1 }}>
                  {detail.address || "Pending"}
                </span>
                <span style={{ color: "#9ca3af", fontSize: "11px" }}>
                  {detailStatusLabels[detail.status]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
