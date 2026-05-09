import type { ChainFamily } from "../types";
import type { AdapterRegistry, ChainAdapter } from "./types";
import { evmAdapter } from "./evmAdapter";

// Generic code treats a null adapter as "family not ready" — hide tools,
// render a placeholder shell.
const REGISTRY: AdapterRegistry = {
  evm: evmAdapter,
  starknet: null,
  svm: null,
};

export function getAdapter(family: ChainFamily): ChainAdapter | null {
  return REGISTRY[family];
}

export function isFamilySupported(family: ChainFamily): boolean {
  return REGISTRY[family] !== null;
}

export { evmAdapter };
export type { ChainAdapter } from "./types";
