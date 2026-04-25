import type { EvmChainId, EvmChainKey } from "./evm";
import type { StarknetChainId, StarknetChainKey } from "./starknet";
import type { SvmChainKey, SvmCluster } from "./svm";
import { toEvmChainKey } from "./evm";
import { toStarknetChainKey } from "./starknet";
import { toSvmChainKey } from "./svm";

export * as Evm from "./evm";
export * as Starknet from "./starknet";
export * as Svm from "./svm";

export type ChainFamily = "evm" | "starknet" | "svm";

export type ChainKey = EvmChainKey | StarknetChainKey | SvmChainKey;

export interface BaseChainDescriptor {
  key: ChainKey;
  chainFamily: ChainFamily;
  name: string;
  shortName?: string;
  testnet?: boolean;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
}

export interface EvmChainDescriptor extends BaseChainDescriptor {
  chainFamily: "evm";
  key: EvmChainKey;
  chainId: EvmChainId;
}

export interface StarknetChainDescriptor extends BaseChainDescriptor {
  chainFamily: "starknet";
  key: StarknetChainKey;
  chainId: StarknetChainId;
}

export interface SvmChainDescriptor extends BaseChainDescriptor {
  chainFamily: "svm";
  key: SvmChainKey;
  cluster: SvmCluster;
}

export type ChainDescriptor =
  | EvmChainDescriptor
  | StarknetChainDescriptor
  | SvmChainDescriptor;

export function isEvmChain(chain: ChainDescriptor): chain is EvmChainDescriptor {
  return chain.chainFamily === "evm";
}

export function isStarknetChain(chain: ChainDescriptor): chain is StarknetChainDescriptor {
  return chain.chainFamily === "starknet";
}

export function isSvmChain(chain: ChainDescriptor): chain is SvmChainDescriptor {
  return chain.chainFamily === "svm";
}

export function parseChainKey(input: string): ChainKey {
  if (!input.includes(":")) throw new Error(`Invalid ChainKey: ${input}`);
  const [family] = input.split(":", 1);
  if (family !== "evm" && family !== "starknet" && family !== "svm") {
    throw new Error(`Unknown chain family in ChainKey: ${input}`);
  }
  return input as ChainKey;
}

export function chainKeyFamily(key: ChainKey): ChainFamily {
  return key.split(":", 1)[0] as ChainFamily;
}

export { toEvmChainKey, toStarknetChainKey, toSvmChainKey };
