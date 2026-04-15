/**
 * DiamondPopup - Diamond contract popup wrapper.
 */
import React from "react";
import DiamondContractPopup from "../../DiamondContractPopup";
import { useGridContext } from "../GridContext";
import { getExplorerBaseUrlFromApiUrl } from "../../../utils/chains";

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
        getExplorerBaseUrlFromApiUrl(
          selectedNetwork?.explorers?.find(
            (e: { type?: string; url?: string }) => e.type === "blockscout"
          )?.url
        ) ||
        selectedNetwork?.blockExplorer ||
        selectedNetwork?.explorerUrl
      }
      chain={selectedNetwork || undefined}
    />
  );
}
