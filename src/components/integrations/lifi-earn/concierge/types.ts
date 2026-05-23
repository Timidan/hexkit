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
  executionMode: "composer-same" | "composer-cross" | "intent" | null;
  sourceTxHash: string | null;
  intentOrderId?: string;
  intentStatus?: string;
  depositTxHash?: string;
  destinationTxHash?: string;
  bridgeStatus: "PENDING" | "DONE" | "FAILED" | null;
  errorMessage: string | null;
  recoverable: boolean;
}

export type LegStatus =
  | "pending"
  | "quoting"
  | "ready"
  | "approving"
  | "executing"
  | "bridging"
  | "intent-open"
  | "intent-delivered"
  | "depositing"
  | "done"
  | "refunded"
  | "failed";

export type DepositExecutionPhase =
  | "same-chain"
  | "composer-bridge"
  | "composer-deposit"
  | "intent-open"
  | "intent-deposit";

export type DepositExecutionEvent =
  | {
      type: "tx-broadcast";
      phase: DepositExecutionPhase;
      txHash: string;
    }
  | {
      type: "intent-opened";
      phase: "intent-open";
      txHash: string;
      orderId: string;
    }
  | {
      type: "intent-status";
      phase: "intent-open";
      orderId?: string;
      status: string;
      destinationTxHash?: string;
    }
  | {
      type: "bridge-status";
      phase: "composer-bridge";
      status: string;
      txHash?: string;
      substatus?: string;
    }
  | {
      type: "delivered";
      phase: "composer-bridge" | "intent-open";
      txHash?: string;
      orderId?: string;
      amountRaw?: string;
      destinationTxHash?: string;
    }
  | {
      type: "confirmed";
      phase: "same-chain" | "composer-deposit" | "intent-deposit";
      txHash?: string;
    }
  | {
      type: "failed";
      phase: DepositExecutionPhase;
      message: string;
      recoverable?: boolean;
      txHash?: string;
      orderId?: string;
    };

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
