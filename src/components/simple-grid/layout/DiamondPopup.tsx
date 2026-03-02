/**
 * DiamondPopup - Diamond contract popup wrapper.
 * Extracted from GridLayout.tsx lines 4259-4273.
 */
import React from "react";
import DiamondContractPopup from "../../DiamondContractPopup";
import { useGridContext } from "../GridContext";

export default function DiamondPopup(): React.ReactElement {
  const ctx: any = useGridContext();
  const {
    isDiamondPopupOpen,
    setIsDiamondPopupOpen,
    contractAddress,
    diamondFacets,
    selectedNetwork,
  } = ctx;

  return (
    <DiamondContractPopup
      isOpen={isDiamondPopupOpen}
      onClose={() => setIsDiamondPopupOpen(false)}
      contractAddress={contractAddress}
      facets={diamondFacets}
      networkName={selectedNetwork?.name || "Unknown Network"}
      blockExplorerUrl={
        selectedNetwork?.explorers
          ?.find((e: { type?: string; url?: string }) => e.type === "blockscout")
          ?.url?.replace("/api", "")
          ?.replace("/api/", "") || selectedNetwork?.blockExplorer
      }
      chain={selectedNetwork || undefined}
    />
  );
}
