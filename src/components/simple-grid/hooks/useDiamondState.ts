/**
 * useDiamondState – manages diamond facet selection, sidebar, and loading. */
import { useState, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import type { DiamondFacet } from "../../../utils/diamondFacetFetcher";

export interface UseDiamondStateDeps {
  setSelectedFunction: (v: string | null) => void;
  setSelectedFunctionObj: (v: ethers.utils.FunctionFragment | null) => void;
}

type FacetDetailStatus = "pending" | "fetching" | "success" | "error";

export function useDiamondState(deps: UseDiamondStateDeps) {
  const { setSelectedFunction, setSelectedFunctionObj } = deps;

  const [selectedFacet, setSelectedFacet] = useState<string | null>(null);
  const [diamondFacets, setDiamondFacets] = useState<DiamondFacet[]>([]);
  const [showFacetSidebar, setShowFacetSidebar] = useState(false);
  const [facetLoading, setFacetLoading] = useState<boolean>(false);
  const [facetProgress, setFacetProgress] = useState<{
    current: number;
    total: number;
    currentFacet: string;
    status: "fetching" | "success" | "error";
    index: number;
  }>({ current: 0, total: 0, currentFacet: "", status: "fetching", index: 0 });
  const [facetProgressDetails, setFacetProgressDetails] = useState<
    Array<{ index: number; address: string; status: FacetDetailStatus }>
  >([]);
  const [showFacetDetails, setShowFacetDetails] = useState(false);
  const [isDiamondPopupOpen, setIsDiamondPopupOpen] = useState(false);

  const facetStatusColors: Record<FacetDetailStatus, string> = {
    pending: "#6b7280",
    fetching: "#38bdf8",
    success: "#22c55e",
    error: "#ef4444",
  };

  const facetStatusLabels: Record<FacetDetailStatus, string> = {
    pending: "Pending",
    fetching: "Loading",
    success: "Ready",
    error: "Error",
  };

  const facetSelectorToName = useMemo(() => {
    const map = new Map<string, string>();
    diamondFacets.forEach((facet) => {
      facet.selectors?.forEach((sel) => {
        map.set(sel.toLowerCase(), facet.name || facet.address);
      });
    });
    return map;
  }, [diamondFacets]);

  // Handlers
  const handleFacetSelect = useCallback((facetAddress: string) => {
    setSelectedFacet(facetAddress);
  }, []);

  const handleSidebarFunctionSelect = useCallback(
    (facetAddress: string, functionName: string, functionType: "read" | "write") => {
      try {
        const facet = diamondFacets.find((f) => f.address.toLowerCase() === facetAddress.toLowerCase());
        if (!facet || !facet.functions) return;
        const funcs = functionType === "read" ? facet.functions.read || [] : facet.functions.write || [];
        const target = funcs.find((fn: any) => fn?.name === functionName);
        if (!target) return;
        setSelectedFacet(facetAddress);
        setSelectedFunction(functionName);
        setSelectedFunctionObj(target as unknown as ethers.utils.FunctionFragment);
      } catch {
        // Sidebar function select failed
      }
    },
    [diamondFacets, setSelectedFunction, setSelectedFunctionObj]
  );

  return {
    selectedFacet, setSelectedFacet,
    diamondFacets, setDiamondFacets,
    showFacetSidebar, setShowFacetSidebar,
    facetLoading, setFacetLoading,
    facetProgress, setFacetProgress,
    facetProgressDetails, setFacetProgressDetails,
    showFacetDetails, setShowFacetDetails,
    isDiamondPopupOpen, setIsDiamondPopupOpen,
    facetStatusColors, facetStatusLabels,
    facetSelectorToName,
    handleFacetSelect,
    handleSidebarFunctionSelect,
  };
}
