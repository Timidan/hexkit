declare const hexBrand: unique symbol;
declare const addressBrand: unique symbol;
declare const selectorBrand: unique symbol;
declare const calldataBrand: unique symbol;
declare const abiBrand: unique symbol;
declare const chainIdBrand: unique symbol;

export type Hex = `0x${string}` & { readonly [hexBrand]: "EvmHex" };
export type Address = Hex & { readonly [addressBrand]: "EvmAddress" };
export type Selector = Hex & { readonly [selectorBrand]: "EvmSelector4Byte" };
export type Calldata = Hex & { readonly [calldataBrand]: "EvmCalldata" };
export type Abi = readonly unknown[] & { readonly [abiBrand]: "EvmAbi" };
export type EvmChainId = number & { readonly [chainIdBrand]: "EvmChainId" };

const HEX_RE = /^0x[0-9a-fA-F]*$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SELECTOR_RE = /^0x[0-9a-fA-F]{8}$/;

export function isHex(input: unknown): input is Hex {
  return typeof input === "string" && HEX_RE.test(input);
}

export function isAddress(input: unknown): input is Address {
  return typeof input === "string" && ADDRESS_RE.test(input);
}

export function isSelector(input: unknown): input is Selector {
  return typeof input === "string" && SELECTOR_RE.test(input);
}

export function parseHex(input: string): Hex {
  if (!HEX_RE.test(input)) throw new Error(`Invalid EVM hex: ${input}`);
  return input as Hex;
}

export function parseAddress(input: string): Address {
  if (!ADDRESS_RE.test(input)) throw new Error(`Invalid EVM address: ${input}`);
  return input as unknown as Address;
}

export function parseSelector(input: string): Selector {
  if (!SELECTOR_RE.test(input)) throw new Error(`Invalid EVM 4-byte selector: ${input}`);
  return input as unknown as Selector;
}

export function parseCalldata(input: string): Calldata {
  return parseHex(input) as unknown as Calldata;
}

export function parseAbi(input: readonly unknown[]): Abi {
  return input as Abi;
}

export function parseEvmChainId(input: number): EvmChainId {
  if (!Number.isInteger(input) || input <= 0) throw new Error(`Invalid EVM chain ID: ${input}`);
  return input as EvmChainId;
}

export type EvmChainKey = `evm:${number}`;

export function toEvmChainKey(chainId: number): EvmChainKey {
  return `evm:${chainId}` as EvmChainKey;
}
