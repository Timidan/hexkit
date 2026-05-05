// Address-with-label primitive used by the Starknet sim tabs. Resolves
// in priority order: static label (KNOWN_CONTRACTS / KNOWN_CLASS_HASHES)
// → bridge `name()` resolver → falls through to the truncated hex.
//
// We intentionally do NOT trigger the bridge fetch when a static label
// is already present — the static tables are higher-confidence
// (they distinguish v0.3 vs v0.4 of an account contract, for example,
// in a way the on-chain `name()` view function never could).

import type { ReactNode } from "react";

import { useContractName } from "@/chains/starknet/contractNameClient";
import type { StarknetNetwork } from "@/config/networkConfig";

import { contractLabel, shortHex } from "./decoders";

export interface ContractAddressProps {
  /** 0x-prefixed felt. `null`/`undefined` renders an em dash. */
  addr: string | null | undefined;
  /** Already-resolved label from `buildAddressLabels(result)`. Treated
   *  as priority 1.5 — built from frame walks so it carries call-tree
   *  context (Account heuristic, etc) the static tables don't. */
  precomputedLabel?: string | null;
  /** Render hint — Voyager-ish "MyToken (0x6f8c…d3)". */
  variant?: "inline" | "stacked";
  /** Pluggable colour for the label text — defaults match the
   *  call tree's `text-success` for known contracts. */
  className?: string;
  /** Suffix slot — copy buttons / explorer links. The component
   *  still owns the address rendering itself. */
  trailing?: ReactNode;
  /** Hex prefix length for the truncated form. */
  head?: number;
  tail?: number;
  /** Network used for bridge-backed name resolution. */
  network?: StarknetNetwork;
}

export function ContractAddress({
  addr,
  precomputedLabel,
  variant = "inline",
  className,
  trailing,
  head = 10,
  tail = 6,
  network,
}: ContractAddressProps) {
  // Static and frame-walk labels both win over the runtime fetch. We
  // pass `null` to the hook in those cases so it short-circuits and
  // doesn't issue an HTTP request.
  const staticLabel = precomputedLabel ?? (addr ? contractLabel(addr) : null);
  const { name: resolvedName, loading } = useContractName(
    staticLabel ? null : addr ?? null,
    network,
  );
  const label = staticLabel ?? resolvedName;

  if (!addr) {
    return <span className="text-muted-foreground">—</span>;
  }

  const labelClass = className ?? "text-success";
  const hexClass = "font-mono text-muted-foreground text-[10px]";
  const truncated = shortHex(addr, head, tail);

  if (variant === "stacked") {
    return (
      <div className="leading-tight">
        {label ? (
          <div className={`${labelClass} text-xs`}>{label}</div>
        ) : null}
        <div className={`${hexClass} flex items-center gap-1`}>
          {truncated}
          {trailing}
        </div>
        {loading && !label ? (
          <div className="text-[9px] text-muted-foreground/70">resolving…</div>
        ) : null}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {label ? <span className={`${labelClass} text-xs`}>{label}</span> : null}
      <span className={hexClass}>{truncated}</span>
      {trailing}
      {loading && !label ? (
        <span
          className="text-[9px] text-muted-foreground/60"
          aria-hidden="true"
        >
          ·
        </span>
      ) : null}
    </span>
  );
}
