import type {
  DepositExecutionEvent,
  DepositExecutionPhase,
  Leg,
  LegStatus,
  SelectedSource,
} from "./types";
import type { EarnVault } from "../types";

export type LegAction =
  | { type: "BUILD_QUEUE"; sources: SelectedSource[]; destination: EarnVault }
  | {
      type: "BUILD_QUEUE_PER_ASSET";
      legs: Array<{ source: SelectedSource; destination: EarnVault }>;
    }
  | { type: "START" }
  | { type: "SET_STATUS"; id: string; status: LegStatus }
  | { type: "SET_TX_HASH"; id: string; txHash: string }
  | { type: "SET_BRIDGE_STATUS"; id: string; status: "PENDING" | "DONE" | "FAILED" }
  | { type: "SET_ERROR"; id: string; message: string }
  | { type: "EXECUTION_EVENT"; id: string; event: DepositExecutionEvent }
  | { type: "SET_RECOVERABLE"; id: string; recoverable: boolean }
  | { type: "NEXT" }
  | { type: "RESET" };

export interface LegState {
  legs: Leg[];
  currentIndex: number;
  started: boolean;
}

export const initialLegState: LegState = {
  legs: [],
  currentIndex: -1,
  started: false,
};

function legIdFor(src: SelectedSource): string {
  return `${src.asset.chainId}:${src.asset.token.address.toLowerCase()}`;
}

function buildLeg(source: SelectedSource, destination: EarnVault): Leg {
  return {
    id: legIdFor(source),
    source,
    destination,
    status: "pending",
    executionMode: null,
    sourceTxHash: null,
    bridgeStatus: null,
    errorMessage: null,
    recoverable: false,
  };
}

function executionModeForPhase(
  phase: DepositExecutionPhase,
): Leg["executionMode"] {
  if (phase === "same-chain") return "composer-same";
  if (phase === "composer-bridge" || phase === "composer-deposit") {
    return "composer-cross";
  }
  return "intent";
}

function normalizeBridgeStatus(status: string): Leg["bridgeStatus"] {
  const normalized = status.toUpperCase();
  if (normalized === "DONE" || normalized === "COMPLETED") return "DONE";
  if (
    normalized === "FAILED" ||
    normalized === "INVALID" ||
    normalized === "REFUNDED" ||
    normalized === "PARTIAL"
  ) {
    return "FAILED";
  }
  return "PENDING";
}

function isTerminal(status: LegStatus): boolean {
  return status === "done" || status === "failed" || status === "refunded";
}

function intentStatusToLegStatus(status: string, current: LegStatus): LegStatus {
  const normalized = status.toLowerCase();
  // Refunded is its own terminal status (positive outcome, no retry UI).
  if (normalized === "refunded") {
    return "refunded";
  }
  // Expired still maps to failed — recoverability is assigned downstream
  // so the refund button stays reachable.
  if (normalized === "failed" || normalized === "expired") {
    return "failed";
  }
  if (normalized === "delivered" || normalized === "settled") {
    return current === "depositing" || current === "done"
      ? current
      : "intent-delivered";
  }
  return isTerminal(current) || current === "depositing"
    ? current
    : "intent-open";
}

function applyExecutionEvent(leg: Leg, event: DepositExecutionEvent): Leg {
  const executionMode = executionModeForPhase(event.phase);

  switch (event.type) {
    case "tx-broadcast": {
      if (event.phase === "composer-deposit" || event.phase === "intent-deposit") {
        return {
          ...leg,
          executionMode,
          status: "depositing",
          depositTxHash: event.txHash,
          errorMessage: null,
          recoverable: false,
        };
      }
      if (event.phase === "composer-bridge") {
        return {
          ...leg,
          executionMode,
          status: "bridging",
          sourceTxHash: event.txHash,
          bridgeStatus: "PENDING",
          errorMessage: null,
          recoverable: false,
        };
      }
      if (event.phase === "intent-open") {
        return {
          ...leg,
          executionMode,
          status: "intent-open",
          sourceTxHash: event.txHash,
          errorMessage: null,
          recoverable: false,
        };
      }
      return {
        ...leg,
        executionMode,
        status: "executing",
        sourceTxHash: event.txHash,
        errorMessage: null,
        recoverable: false,
      };
    }
    case "intent-opened": {
      return {
        ...leg,
        executionMode,
        status: "intent-open",
        sourceTxHash: event.txHash,
        intentOrderId: event.orderId,
        intentStatus: "Open",
        errorMessage: null,
        recoverable: false,
      };
    }
    case "intent-status": {
      const status = intentStatusToLegStatus(event.status, leg.status);
      const normalized = event.status.toLowerCase();
      // Only Expired stays recoverable so the refund button remains reachable.
      const recoverable = status === "failed" && normalized === "expired";
      return {
        ...leg,
        executionMode,
        status,
        intentOrderId: event.orderId ?? leg.intentOrderId,
        intentStatus: event.status,
        destinationTxHash: event.destinationTxHash ?? leg.destinationTxHash,
        errorMessage:
          status === "failed"
            ? leg.errorMessage ?? `Intent ${event.status.toLowerCase()}`
            : leg.errorMessage,
        recoverable: status === "failed" ? recoverable : false,
      };
    }
    case "bridge-status": {
      const bridgeStatus = normalizeBridgeStatus(event.status);
      return {
        ...leg,
        executionMode,
        sourceTxHash: event.txHash ?? leg.sourceTxHash,
        bridgeStatus,
        status:
          bridgeStatus === "FAILED"
            ? "failed"
            : bridgeStatus === "DONE"
              ? isTerminal(leg.status)
                ? leg.status
                : "depositing"
              : isTerminal(leg.status)
                ? leg.status
                : "bridging",
        errorMessage:
          bridgeStatus === "FAILED"
            ? leg.errorMessage ?? `Bridge ${event.status.toLowerCase()}`
            : leg.errorMessage,
      };
    }
    case "delivered": {
      if (event.phase === "composer-bridge") {
        return {
          ...leg,
          executionMode,
          bridgeStatus: "DONE",
          destinationTxHash: event.destinationTxHash ?? leg.destinationTxHash,
          status: isTerminal(leg.status) ? leg.status : "depositing",
          errorMessage: null,
        };
      }
      return {
        ...leg,
        executionMode,
        intentOrderId: event.orderId ?? leg.intentOrderId,
        intentStatus: "Delivered",
        destinationTxHash: event.destinationTxHash ?? leg.destinationTxHash,
        status: isTerminal(leg.status) || leg.status === "depositing"
          ? leg.status
          : "intent-delivered",
        errorMessage: null,
      };
    }
    case "confirmed": {
      if (event.phase === "same-chain") {
        return {
          ...leg,
          executionMode,
          sourceTxHash: event.txHash ?? leg.sourceTxHash,
          status: "done",
          errorMessage: null,
          recoverable: false,
        };
      }
      return {
        ...leg,
        executionMode,
        depositTxHash: event.txHash ?? leg.depositTxHash,
        status: "done",
        errorMessage: null,
        recoverable: false,
      };
    }
    case "failed": {
      return {
        ...leg,
        executionMode,
        status: "failed",
        sourceTxHash:
          event.phase === "same-chain" ||
          event.phase === "composer-bridge" ||
          event.phase === "intent-open"
            ? event.txHash ?? leg.sourceTxHash
            : leg.sourceTxHash,
        depositTxHash:
          event.phase === "composer-deposit" || event.phase === "intent-deposit"
            ? event.txHash ?? leg.depositTxHash
            : leg.depositTxHash,
        intentOrderId: event.orderId ?? leg.intentOrderId,
        bridgeStatus:
          event.phase === "composer-bridge" ? "FAILED" : leg.bridgeStatus,
        errorMessage: event.message,
        recoverable: event.recoverable ?? false,
      };
    }
  }
}

export function legsReducer(state: LegState, action: LegAction): LegState {
  switch (action.type) {
    case "BUILD_QUEUE": {
      const legs: Leg[] = action.sources.map((src) =>
        buildLeg(src, action.destination)
      );
      return { legs, currentIndex: -1, started: false };
    }
    case "BUILD_QUEUE_PER_ASSET": {
      const legs: Leg[] = action.legs.map(({ source, destination }) =>
        buildLeg(source, destination)
      );
      return { legs, currentIndex: -1, started: false };
    }
    case "START": {
      if (state.legs.length === 0) return state;
      return { ...state, currentIndex: 0, started: true };
    }
    case "SET_STATUS": {
      return {
        ...state,
        legs: state.legs.map((l) =>
          l.id === action.id ? { ...l, status: action.status } : l
        ),
      };
    }
    case "SET_TX_HASH": {
      return {
        ...state,
        legs: state.legs.map((l) =>
          l.id === action.id ? { ...l, sourceTxHash: action.txHash } : l
        ),
      };
    }
    case "SET_BRIDGE_STATUS": {
      return {
        ...state,
        legs: state.legs.map((l) =>
          l.id === action.id
            ? {
                ...l,
                bridgeStatus: action.status,
                status:
                  action.status === "DONE"
                    ? "depositing"
                    : action.status === "FAILED"
                      ? "failed"
                      : l.status,
              }
            : l
        ),
      };
    }
    case "SET_ERROR": {
      return {
        ...state,
        legs: state.legs.map((l) =>
          l.id === action.id
            ? {
                ...l,
                status: "failed",
                errorMessage: action.message,
                recoverable: false,
              }
            : l
        ),
      };
    }
    case "EXECUTION_EVENT": {
      return {
        ...state,
        legs: state.legs.map((l) =>
          l.id === action.id ? applyExecutionEvent(l, action.event) : l
        ),
      };
    }
    case "SET_RECOVERABLE": {
      return {
        ...state,
        legs: state.legs.map((l) =>
          l.id === action.id ? { ...l, recoverable: action.recoverable } : l
        ),
      };
    }
    case "NEXT": {
      const nextIdx = state.legs.findIndex(
        (l, i) =>
          i > state.currentIndex &&
          (l.status === "pending" || l.status === "ready")
      );
      return { ...state, currentIndex: nextIdx };
    }
    case "RESET": {
      return initialLegState;
    }
  }
}

export function isCrossChain(leg: Leg): boolean {
  return leg.source.asset.chainId !== leg.destination.chainId;
}
