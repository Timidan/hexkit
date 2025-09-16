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
}

interface FacetProgress {
  current: number;
  total: number;
  currentFacet: string;
  status: "fetching" | "success" | "error";
}

export const InlineFacetLoader: React.FC<InlineFacetLoaderProps> = ({
  chain,
  diamondAddress,
  onFacetsLoaded,
  hideUI = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<FacetProgress>({
    current: 0,
    total: 0,
    currentFacet: "",
    status: "fetching",
  });
  const [facets, setFacets] = useState<DiamondFacet[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadFacets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setFacets([]);

      // Get facet addresses
      const facetAddresses = await getDiamondFacetAddresses(
        chain,
        diamondAddress
      );

      if (facetAddresses.length === 0) {
        setError("No facets found for this Diamond contract");
        setIsLoading(false);
        return;
      }

      // Fetch facet ABIs with progress tracking
      const loadedFacets = await fetchDiamondFacets(
        chain,
        facetAddresses,
        (progress) => {
          setProgress(progress);
        }
      );

      setFacets(loadedFacets);
      onFacetsLoaded(loadedFacets);
      setIsLoading(false);
    } catch (error) {
      console.error("Diamond facet loading failed:", error);
      setError(
        `Failed to load facets: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setIsLoading(false);
    }
  }, [chain, diamondAddress, onFacetsLoaded]);

  const progressPercentage =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

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
              marginBottom: "8px",
            }}
          >
            <span style={{ color: "#9ca3af", fontSize: "14px" }}>
              Loading facets...
            </span>
            <span
              style={{ color: "#ffffff", fontSize: "14px", fontWeight: "500" }}
            >
              {progress.current} / {progress.total}
            </span>
          </div>

          <div
            style={{
              width: "100%",
              height: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderRadius: "3px",
              overflow: "hidden",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, progressPercentage))}%`,
                height: "100%",
                backgroundColor: "#6366f1",
                borderRadius: "3px",
                transition: "width 0.3s ease",
              }}
            />
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#9ca3af",
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            {progress.currentFacet}
          </div>
        </div>
      )}
    </div>
  );
};
