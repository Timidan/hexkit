import { ShieldWarning, X } from "@phosphor-icons/react";
import { Button } from "../../ui/button";

interface Props {
  onDismiss: () => void;
}

export function HeuristicLayoutBanner({ onDismiss }: Props) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 border border-orange-500/40 bg-orange-500/5 rounded-md text-xs text-orange-200">
      <ShieldWarning className="w-3.5 h-3.5 mt-0.5 text-orange-400 shrink-0" />
      <div className="flex-1 space-y-1">
        <div className="font-medium">Heuristic layout — no verified source</div>
        <div className="text-muted-foreground">
          This contract has no source on Sourcify. Slot labels and types shown
          below were synthesized from Heimdall decompilation. Fields may be
          mislabeled, and struct packing is not resolved. Treat values as
          evidence, not ground truth.
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Dismiss heuristic layout warning"
        className="h-5 w-5 p-0 shrink-0"
        onClick={onDismiss}
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}
