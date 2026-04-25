/**
 * Global wallet picker rendered in the TopBar. Reads manager state only —
 * imports zero family SDKs. Clicking "Connect <family>" delegates to
 * `manager.connect(family)`, which activates that family's provider (lazy
 * mount) and asks its bridge to open the SDK-specific picker UI.
 */
import { useState, useRef, useEffect } from "react";
import { Wallet } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import {
  useWalletManager,
  type FamilyConnection,
} from "@/contexts/WalletManager";
import type { ChainFamily } from "@/chains/types";
import { CHAIN_MARKS } from "../shared/ChainMarks";
import { cn } from "@/lib/utils";

// Picker uses short "EVM" rather than "Ethereum" to keep rows compact.
const FAMILY_LABELS: Record<ChainFamily, string> = {
  evm: "EVM",
  starknet: "Starknet",
  svm: "Solana",
};

const FAMILY_ORDER: ChainFamily[] = ["evm", "starknet", "svm"];

function truncate(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function connectedCount(
  connections: Record<ChainFamily, FamilyConnection | null>,
): number {
  return FAMILY_ORDER.reduce(
    (n, f) => n + (connections[f] ? 1 : 0),
    0,
  );
}

export function GlobalWalletPicker({ className }: { className?: string }) {
  const { connections, connect, disconnect } = useWalletManager();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const total = connectedCount(connections);

  return (
    <div ref={wrapRef} className={cn("relative inline-flex", className)}>
      <Button
        type="button"
        variant="icon-borderless"
        size="icon-inline"
        onClick={() => setOpen((v) => !v)}
        aria-label={total > 0 ? `${total} wallets connected` : "Connect wallet"}
        title={total > 0 ? `${total} wallet${total > 1 ? "s" : ""} connected` : "Connect wallet"}
        className="relative"
      >
        <Wallet size={18} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-emerald-500 text-[9px] leading-[14px] text-black font-semibold px-1">
            {total}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[60] mt-1.5 w-72 rounded-md border border-border/60 bg-popover p-2 shadow-lg"
        >
          <div className="mb-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Wallets
          </div>
          <ul className="flex flex-col gap-0.5">
            {FAMILY_ORDER.map((family) => {
              const conn = connections[family];
              const Icon = CHAIN_MARKS[family];
              return (
                <li
                  key={family}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-accent/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex shrink-0 items-center justify-center">
                      <Icon size={18} />
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium">
                        {FAMILY_LABELS[family]}
                      </span>
                      {conn ? (
                        <span className="truncate text-[11px] font-mono text-muted-foreground">
                          {truncate(conn.address)}
                          {conn.connectorName ? ` · ${conn.connectorName}` : ""}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          Not connected
                        </span>
                      )}
                    </div>
                  </div>
                  {conn ? (
                    <button
                      type="button"
                      onClick={() => disconnect(family)}
                      className="rounded border border-border/50 px-2 py-0.5 text-[11px] hover:bg-destructive/10 hover:text-destructive"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        connect(family);
                        setOpen(false);
                      }}
                      className="rounded border border-border/50 px-2 py-0.5 text-[11px] hover:bg-accent/60"
                    >
                      Connect
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-border/40 px-2 pt-1.5 text-[10px] text-muted-foreground">
            Connect multiple at once — tools use the matching chain's wallet.
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalWalletPicker;
