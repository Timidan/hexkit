import React from "react";
import { EXTENDED_NETWORKS, type ExtendedChain } from "../shared/NetworkSelector";
import { SUPPORTED_CHAINS } from "../../utils/chains";
import type { Chain } from "../../types";

// ---- View mode type ----
export type SimulationViewMode = "builder" | "replay";

// ---- Canonical URL/storage intent parser ----
// Resolves the `?mode=live|simulation|replay` and `?replay=txhash` URL signals
// into the surfaces the Hub (live-vs-simulation) and Wagmi (builder-vs-replay)
// state machines consume. A `null` field means the URL carried no signal for
// that surface, in which case callers keep their existing runtime fallbacks
// (localStorage / clone / contractContext).
export interface BuilderIntent {
  mode: "live" | "simulation" | null;
  viewMode: "builder" | "replay" | null;
}

export function parseBuilderIntent(search: string): BuilderIntent {
  const params = new URLSearchParams(search);
  const requestedMode = params.get("mode");

  // Hub surface: live-vs-simulation. `replay` collapses to simulation.
  let mode: BuilderIntent["mode"] = null;
  if (requestedMode === "live") {
    mode = "live";
  } else if (requestedMode === "simulation" || requestedMode === "replay") {
    mode = "simulation";
  }

  // Wagmi surface: builder-vs-replay within simulation.
  let viewMode: BuilderIntent["viewMode"] = null;
  if (requestedMode === "replay" || params.get("replay") === "txhash") {
    viewMode = "replay";
  } else if (requestedMode === "simulation") {
    viewMode = "builder";
  }

  return { mode, viewMode };
}

// ---- Transaction preview data fetched before enabling replay ----
export interface TxPreviewData {
  from: string;
  to: string | null;
  value: string;
  data: string;
  blockNumber: number | null;
  nonce: number;
}

export type TxFetchStatus = "idle" | "fetching" | "found" | "not_found" | "error";

export interface ReplayIntentAudit {
  transactionHash: string;
  noAutoReplay: boolean;
  source: string;
  recordedAt: number;
}

// ---- Replay localStorage keys and event name ----
export const TXHASH_REPLAY_KEY = "web3-toolkit:txhash-replay";
export const TXHASH_REPLAY_EVENT = "web3-toolkit:txhash-replay-updated";
export const TXHASH_REPLAY_LAST_INTENT_KEY = "web3-toolkit:txhash-replay-last-intent";

export interface TxHashReplayData {
  transactionHash: string;
  networkId: number;
  networkName: string;
  forkBlockTag?: string;
  debugEnabled?: boolean;
  noAutoReplay?: boolean; // When true, prefill only - don't auto-run
  source?: string;
}

// ---- Flat design styles - matching SimpleGridUI's container structure ----
export const replayShellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0a0a0a",
  color: "#fff",
  padding: "20px",
};

export const replayGridContainerStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

export const replayGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "24px",
  width: "100%",
  maxWidth: "600px",
  margin: "0 auto",
  padding: 0,
};

// Match SimpleGridUI's contractCardStyle for consistent bordered sections
export const replayCardStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  padding: "24px",
  background: "transparent",
  border: "1px solid #444",
  borderRadius: "8px",
  boxShadow: "none",
};

export const replaySectionTitleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "#888",
  marginBottom: "16px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export const replaySectionStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

// ---- Utility functions ----
export const defaultReplayNetwork =
  EXTENDED_NETWORKS.find((network) => network.id === 1) ?? EXTENDED_NETWORKS[0];

// Helper to map ExtendedChain to Chain for the replay function
export const mapExtendedToChain = (network: ExtendedChain): Chain => {
  const supported = SUPPORTED_CHAINS.find((c) => c.id === network.id);
  if (supported) return supported;
  return {
    id: network.id,
    name: network.name,
    rpcUrl: network.rpcUrl ?? "",
    explorerUrl: network.blockExplorer,
    blockExplorer: network.blockExplorer,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  };
};
