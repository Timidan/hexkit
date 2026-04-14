import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { VaultList } from "../VaultList";
import type { EarnVault } from "../types";

interface DestinationPickerProps {
  destination: EarnVault | null;
  onPick: (vault: EarnVault) => void;
  // Browse-all dialog must be restricted to the consolidate-mode destination
  // chain once one is chosen, or picks silently bypass the restriction.
  lockedChainId?: number;
}

export function DestinationPicker({
  destination,
  onPick,
  lockedChainId,
}: DestinationPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/30 p-3">
      <div className="flex-1 text-xs">
        <div className="uppercase text-muted-foreground text-[10px]">Destination vault</div>
        {destination ? (
          <div className="mt-0.5 font-medium">
            {destination.name ?? destination.slug}
            <span className="ml-1 text-[10px] text-muted-foreground">
              · {destination.protocol.name} · chain {destination.chainId}
            </span>
          </div>
        ) : (
          <div className="mt-0.5 text-muted-foreground">
            Pick from a recommendation above, or browse all vaults.
          </div>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-[10px]">
            Browse all
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Pick destination vault</DialogTitle>
            <DialogDescription className="sr-only">
              Browse and select a destination vault for your deposit.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto overflow-x-visible -mx-1 px-1">
            <VaultList
              compact
              lockedChainId={lockedChainId}
              onSelectVault={(v) => {
                onPick(v);
                setOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
