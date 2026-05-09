import React from "react";
import { Lightning } from "@phosphor-icons/react";
import { useEarnAdapter } from "../context/EarnAdapterContext";
import { adapterFamilyLabel } from "../adapter/types";

export const UnsupportedFamilyCard: React.FC = () => {
  const { family, unsupportedReason } = useEarnAdapter();

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/40 bg-muted/40">
        <Lightning size={18} className="text-muted-foreground" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {adapterFamilyLabel(family)}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-foreground">
        LI.FI Earn not available here
      </h2>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        {unsupportedReason ??
          `${adapterFamilyLabel(family)} vaults are not supported yet.`}
      </p>
      <p className="mt-6 text-xs text-muted-foreground/70">
        EVM vaults continue to work on the <code>/evm</code> route.
      </p>
    </div>
  );
};

export default UnsupportedFamilyCard;
