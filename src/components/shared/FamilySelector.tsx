import React from "react";
import { useNavigate } from "react-router-dom";
import type { ChainFamily } from "../../chains/types";
import { FAMILY_PREFIXES } from "../../routes/familyRoutes";
import { isFamilySupported } from "../../chains/adapters";
import { useActiveChainFamily } from "../../hooks/useActiveChainFamily";
import { CHAIN_MARKS, CHAIN_LABELS } from "./ChainMarks";
import { cn } from "@/lib/utils";

const FAMILY_ORDER: ChainFamily[] = ["evm", "starknet", "svm"];

export interface FamilySelectorProps {
  className?: string;
}

/**
 * Minimal family switcher used in the app chrome. Icon-only to keep the
 * top bar compact; hover/title expose the full chain name. Families
 * without a live adapter still route to their shell so the "coming soon"
 * state is reachable.
 */
export const FamilySelector: React.FC<FamilySelectorProps> = ({ className }) => {
  const navigate = useNavigate();
  const active = useActiveChainFamily();

  return (
    <nav
      aria-label="Chain family"
      className={cn(
        "inline-flex items-center rounded-md border border-border/40 bg-muted/30 p-0.5",
        className,
      )}
    >
      {FAMILY_ORDER.map((family) => {
        const isActive = family === active;
        const supported = isFamilySupported(family);
        const Icon = CHAIN_MARKS[family];
        const label = CHAIN_LABELS[family];
        return (
          <button
            key={family}
            type="button"
            onClick={() => navigate(FAMILY_PREFIXES[family])}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              isActive
                ? "bg-foreground/10"
                : "opacity-55 hover:opacity-100 hover:bg-foreground/5",
              !supported && "grayscale",
            )}
            aria-label={supported ? label : `${label} (coming soon)`}
            title={supported ? label : `${label} (coming soon)`}
            aria-pressed={isActive}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </nav>
  );
};

export default FamilySelector;
