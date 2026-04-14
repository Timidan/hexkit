import { useReducer } from "react";
import { initialLegState, legsReducer } from "../executionMachine";

export function useExecutionLegs() {
  const [state, dispatch] = useReducer(legsReducer, initialLegState);
  return { state, dispatch };
}
