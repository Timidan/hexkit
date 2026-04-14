import type { Leg, LegStatus, SelectedSource } from "./types";
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

export function legsReducer(state: LegState, action: LegAction): LegState {
  switch (action.type) {
    case "BUILD_QUEUE": {
      const legs: Leg[] = action.sources.map((src) => ({
        id: legIdFor(src),
        source: src,
        destination: action.destination,
        status: "pending",
        sourceTxHash: null,
        bridgeStatus: null,
        errorMessage: null,
      }));
      return { legs, currentIndex: -1, started: false };
    }
    case "BUILD_QUEUE_PER_ASSET": {
      const legs: Leg[] = action.legs.map(({ source, destination }) => ({
        id: legIdFor(source),
        source,
        destination,
        status: "pending",
        sourceTxHash: null,
        bridgeStatus: null,
        errorMessage: null,
      }));
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
                    ? "done"
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
            ? { ...l, status: "failed", errorMessage: action.message }
            : l
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
