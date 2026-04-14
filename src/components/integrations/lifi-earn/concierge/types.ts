import type { EarnVault, EarnToken } from "../types";

export interface IdleAsset {
  chainId: number;
  chainName: string;
  token: EarnToken;
  amountRaw: string;
  amountDecimal: string;
  amountUsd: number | null;
}

export interface SelectedSource {
  asset: IdleAsset;
  // Smallest units, <= asset.amountRaw.
  amountRaw: string;
}

export interface VaultRecommendation {
  forChainId: number;
  forTokenAddress: string;
  bestPick: RecommendationPick | null;
  safestPick: RecommendationPick | null;
  alternatives: RecommendationPick[];
  source: "ai" | "rules";
  topRationale: string;
}

export interface RecommendationPick {
  vaultSlug: string;
  vault: EarnVault;
  rationale: string;
}

export interface Leg {
  id: string;
  source: SelectedSource;
  destination: EarnVault;
  status: LegStatus;
  sourceTxHash: string | null;
  bridgeStatus: "PENDING" | "DONE" | "FAILED" | null;
  errorMessage: string | null;
}

export type LegStatus =
  | "pending"
  | "quoting"
  | "ready"
  | "approving"
  | "executing"
  | "bridging"
  | "done"
  | "failed";

export interface ConciergeConfig {
  maxCandidatesPerAsset: number;
  minTvlForSafe: number;
  perChainTimeoutMs: number;
}

export const DEFAULT_CONFIG: ConciergeConfig = {
  maxCandidatesPerAsset: 12,
  minTvlForSafe: 10_000_000,
  perChainTimeoutMs: 4000,
};
