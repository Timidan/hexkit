import { CHAIN_REGISTRY } from "../../../utils/chains";
import type { EarnToken } from "./types";

/**
 * Curated high-liquidity receive tokens per chain. Mirrored from
 * DepositFlow's common-token picker so withdraw routing stays constrained to
 * known Composer/Intent-friendly assets instead of arbitrary user input.
 */
export function getDestinationTokenOptions(chainId: number): EarnToken[] {
  const native = (symbol: string, decimals = 18): EarnToken => ({
    address: "0x0000000000000000000000000000000000000000",
    symbol,
    decimals,
    chainId,
  });

  const common: Record<number, EarnToken[]> = {
    1: [
      native("ETH"),
      { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6, chainId: 1 },
      { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6, chainId: 1 },
      { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18, chainId: 1 },
    ],
    137: [
      native("POL"),
      { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", symbol: "WPOL", decimals: 18, chainId: 137 },
      { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", decimals: 6, chainId: 137 },
      { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", symbol: "USDT", decimals: 6, chainId: 137 },
      { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", symbol: "WETH", decimals: 18, chainId: 137 },
    ],
    42161: [
      native("ETH"),
      { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6, chainId: 42161 },
      { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6, chainId: 42161 },
      { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", decimals: 18, chainId: 42161 },
    ],
    10: [
      native("ETH"),
      { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", decimals: 6, chainId: 10 },
      { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", symbol: "USDT", decimals: 6, chainId: 10 },
      { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, chainId: 10 },
    ],
    8453: [
      native("ETH"),
      { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6, chainId: 8453 },
      { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, chainId: 8453 },
    ],
    56: [
      native("BNB"),
      { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", decimals: 18, chainId: 56 },
      { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18, chainId: 56 },
      { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "WBNB", decimals: 18, chainId: 56 },
    ],
    43114: [
      native("AVAX"),
      { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", decimals: 6, chainId: 43114 },
      { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", symbol: "USDT", decimals: 6, chainId: 43114 },
    ],
    100: [
      native("xDAI", 18),
      { address: "0x6A023CCd1ff6F2045C3309768eAD9E68F978f6e1", symbol: "WETH", decimals: 18, chainId: 100 },
      { address: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83", symbol: "USDC", decimals: 6, chainId: 100 },
    ],
  };

  const chainMeta = CHAIN_REGISTRY.find((c) => c.id === chainId);
  const nativeSymbol = chainMeta?.nativeCurrency?.symbol ?? "ETH";
  const nativeDecimals = chainMeta?.nativeCurrency?.decimals ?? 18;
  return common[chainId] ?? [native(nativeSymbol, nativeDecimals)];
}

export function destinationTokenKey(token: EarnToken): string {
  return `${token.chainId ?? 0}:${token.address.toLowerCase()}`;
}

export function pickDefaultDestinationToken(args: {
  chainId: number;
  sourceSymbol: string;
  sameChainToken?: EarnToken;
}): EarnToken {
  if (args.sameChainToken && args.sameChainToken.chainId === args.chainId) {
    return args.sameChainToken;
  }

  const options = getDestinationTokenOptions(args.chainId);
  const source = args.sourceSymbol.toUpperCase();
  const ethLike = source === "ETH" || source === "WETH";
  if (ethLike) {
    // Prefer WETH specifically — "startsWith W" picks up WPOL/WBNB/etc. on
    // their native chains, which is the wrong asset for an ETH source.
    const weth = options.find((t) => t.symbol?.toUpperCase() === "WETH");
    if (weth) return weth;
  }

  return (
    options.find((t) => t.symbol?.toUpperCase() === source) ??
    options.find((t) => t.symbol?.toUpperCase() === "USDC") ??
    options[0]
  );
}
