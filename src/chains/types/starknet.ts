declare const feltBrand: unique symbol;
declare const classHashBrand: unique symbol;
declare const entrypointBrand: unique symbol;
declare const starknetAddressBrand: unique symbol;

export type Felt = string & { readonly [feltBrand]: "StarknetFelt" };
export type ClassHash = Felt & { readonly [classHashBrand]: "StarknetClassHash" };
export type EntrypointSelector = Felt & { readonly [entrypointBrand]: "StarknetEntrypointSelector" };
export type StarknetAddress = Felt & { readonly [starknetAddressBrand]: "StarknetAddress" };
export type StarknetCalldata = readonly Felt[];

export type StarknetChainId =
  | "0x534e5f4d41494e"
  | "0x534e5f5345504f4c4941";

export const STARKNET_MAINNET_ID: StarknetChainId = "0x534e5f4d41494e";
export const STARKNET_SEPOLIA_ID: StarknetChainId = "0x534e5f5345504f4c4941";

const FELT_RE = /^0x[0-9a-fA-F]+$/;
const FELT_MAX = 2n ** 252n;

export function isFelt(input: unknown): input is Felt {
  if (typeof input !== "string" || !FELT_RE.test(input)) return false;
  try {
    return BigInt(input) < FELT_MAX;
  } catch {
    return false;
  }
}

export function parseFelt(input: string): Felt {
  if (!FELT_RE.test(input)) throw new Error(`Invalid Starknet felt: ${input}`);
  if (BigInt(input) >= FELT_MAX) throw new Error(`Starknet felt out of range: ${input}`);
  return input as Felt;
}

export function parseStarknetAddress(input: string): StarknetAddress {
  return parseFelt(input) as unknown as StarknetAddress;
}

export function parseClassHash(input: string): ClassHash {
  return parseFelt(input) as unknown as ClassHash;
}

export function parseEntrypointSelector(input: string): EntrypointSelector {
  return parseFelt(input) as unknown as EntrypointSelector;
}

export function parseStarknetCalldata(input: readonly string[]): StarknetCalldata {
  return input.map(parseFelt);
}

export type StarknetChainKey = `starknet:${StarknetChainId}`;

export function toStarknetChainKey(chainId: StarknetChainId): StarknetChainKey {
  return `starknet:${chainId}` as StarknetChainKey;
}
