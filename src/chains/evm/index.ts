// EVM family barrel. The family-import boundary (enforced by
// scripts/check-family-imports.mjs) is: files under `src/chains/evm/*`
// may import viem/wagmi/ethers/RainbowKit; generic code consumes this
// barrel instead.
export * from "./rpc";
export * from "./explorer";
export * from "./wallet";
export * from "./simulation";

export { evmAdapter } from "../adapters/evmAdapter";
