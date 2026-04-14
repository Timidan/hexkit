import { ethers } from "ethers";

// Standard event topic hashes for token transfers
export const TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");
export const TRANSFER_SINGLE_TOPIC = ethers.utils.id("TransferSingle(address,address,address,uint256,uint256)");
export const TRANSFER_BATCH_TOPIC = ethers.utils.id("TransferBatch(address,address,address,uint256[],uint256[])");

// Standard ABIs for decoding
const ERC20_TRANSFER_ABI = ["event Transfer(address indexed from, address indexed to, uint256 value)"];
const ERC721_TRANSFER_ABI = ["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"];
const ERC1155_SINGLE_ABI = ["event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)"];
const ERC1155_BATCH_ABI = ["event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)"];

export type TokenType = "ERC-20" | "ERC-721" | "ERC-1155";

export interface TokenMovement {
  tokenType: TokenType;
  tokenAddress: string;
  tokenSymbol?: string;
  tokenName?: string;
  decimals?: number;
  from: string;
  to: string;
  amount: string;
  tokenId?: string;
  formattedAmount?: string;
}

export interface BalanceChange {
  address: string;
  label?: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenType: TokenType;
  delta: string;
  rawDelta: bigint;
  formattedDelta: string;
  tokenId?: string;
  /** USD price per token (from DeFiLlama) */
  priceUsd?: number;
  /** USD value of the balance change */
  valueUsd?: number;
}

export interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
}

export interface TokenPrice {
  price: number;
  confidence: number;
  timestamp: number;
}

// Chain ID to Trust Wallet blockchain name mapping
const CHAIN_ID_TO_TW: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  56: "smartchain",
  137: "polygon",
  250: "fantom",
  42161: "arbitrum",
  43114: "avalanchec",
  8453: "base",
  324: "zksync",
};

// Chain ID to Zapper chain name (for icon fallbacks)
const CHAIN_ID_TO_ZAPPER: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  56: "binance-smart-chain",
  137: "polygon",
  250: "fantom",
  42161: "arbitrum",
  43114: "avalanche",
  8453: "base",
  324: "zksync",
  5000: "mantle",
  59144: "linea",
  534352: "scroll",
  1101: "polygon-zkevm",
};

/**
 * Get token icon URL
 * Uses 1inch for Ethereum (supports lowercase), Trust Wallet for other chains
 * @param tokenAddress Token contract address
 * @param chainId Chain ID (defaults to 1 for Ethereum)
 */
export function getTokenIconUrl(tokenAddress: string, chainId: number = 1): string {
  const addr = tokenAddress.toLowerCase();

  // For Ethereum mainnet, use 1inch direct URL (avoids redirect)
  if (chainId === 1) {
    return `https://tokens-data.1inch.io/images/${addr}.png`;
  }

  // For other chains, try to use Trust Wallet with checksummed address
  const twChain = CHAIN_ID_TO_TW[chainId];
  if (twChain) {
    // Try to checksum the address using ethers
    try {
      const checksummed = ethers.utils.getAddress(addr);
      return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${twChain}/assets/${checksummed}/logo.png`;
    } catch {
      // If checksum fails, return a generic icon URL
    }
  }

  // Fallback to 1inch (may not have all tokens but worth trying)
  return `https://tokens-data.1inch.io/images/${addr}.png`;
}

/**
 * Get ordered list of icon URLs to try for a token.
 * Use with cascading onError to find the first working source.
 */
export function getTokenIconUrls(tokenAddress: string, chainId: number = 1): string[] {
  const addr = tokenAddress.toLowerCase();
  const urls: string[] = [];

  // 1. Zapper (good coverage of DeFi/vault tokens)
  const zapperChain = CHAIN_ID_TO_ZAPPER[chainId];
  if (zapperChain) {
    urls.push(`https://storage.googleapis.com/zapper-fi-assets/tokens/${zapperChain}/${addr}.png`);
  }

  // 2. 1inch (good for mainnet)
  urls.push(`https://tokens-data.1inch.io/images/${addr}.png`);

  // 3. Trust Wallet (checksummed)
  const twChain = CHAIN_ID_TO_TW[chainId];
  if (twChain) {
    try {
      const checksummed = ethers.utils.getAddress(addr);
      urls.push(`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${twChain}/assets/${checksummed}/logo.png`);
    } catch { /* skip */ }
  }

  return urls;
}

// Chain ID to DeFiLlama chain name mapping
const CHAIN_ID_TO_LLAMA: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  56: "bsc",
  137: "polygon",
  250: "fantom",
  42161: "arbitrum",
  43114: "avax",
  8453: "base",
  324: "zksync",
  59144: "linea",
  534352: "scroll",
};

// Price cache with TTL (5 minutes)
const MAX_TOKEN_CACHE_SIZE = 500;
const priceCache = new Map<string, { price: TokenPrice; fetchedAt: number }>();
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch token price from DeFiLlama
 * @param tokenAddress Token contract address
 * @param chainId Chain ID (defaults to 1 for Ethereum)
 */
export async function fetchTokenPrice(
  tokenAddress: string,
  chainId: number = 1
): Promise<TokenPrice | null> {
  const chainName = CHAIN_ID_TO_LLAMA[chainId];
  if (!chainName) {
    console.warn(`Unknown chain ID ${chainId} for DeFiLlama price lookup`);
    return null;
  }

  const cacheKey = `${chainName}:${tokenAddress.toLowerCase()}`;

  // Check cache
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL) {
    return cached.price;
  }

  try {
    const response = await fetch(
      `https://coins.llama.fi/prices/current/${chainName}:${tokenAddress}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const coinKey = `${chainName}:${tokenAddress.toLowerCase()}`;
    const coinData = data.coins?.[coinKey];

    if (!coinData?.price) {
      return null;
    }

    const price: TokenPrice = {
      price: coinData.price,
      confidence: coinData.confidence ?? 1,
      timestamp: coinData.timestamp ?? Date.now() / 1000,
    };

    // Cache the result
    priceCache.set(cacheKey, { price, fetchedAt: Date.now() });
    if (priceCache.size > MAX_TOKEN_CACHE_SIZE) {
      const first = priceCache.keys().next().value;
      if (first) priceCache.delete(first);
    }

    return price;
  } catch (e) {
    console.warn(`Failed to fetch price for ${tokenAddress}:`, e);
    return null;
  }
}

/**
 * Fetch prices for multiple tokens in a single request
 * @param tokens Array of { address, chainId } objects
 */
export async function fetchTokenPrices(
  tokens: Array<{ address: string; chainId?: number }>
): Promise<Map<string, TokenPrice>> {
  const results = new Map<string, TokenPrice>();

  // Build coin identifiers for DeFiLlama
  const coinIds: string[] = [];
  const addressToKey = new Map<string, string>();

  for (const { address, chainId = 1 } of tokens) {
    const chainName = CHAIN_ID_TO_LLAMA[chainId];
    if (!chainName) continue;

    const cacheKey = `${chainName}:${address.toLowerCase()}`;

    // Check cache first
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL) {
      results.set(address.toLowerCase(), cached.price);
      continue;
    }

    coinIds.push(cacheKey);
    addressToKey.set(cacheKey, address.toLowerCase());
  }

  // If all were cached, return early
  if (coinIds.length === 0) {
    return results;
  }

  try {
    const response = await fetch(
      `https://coins.llama.fi/prices/current/${coinIds.join(",")}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      return results;
    }

    const data = await response.json();

    for (const [coinKey, coinData] of Object.entries(data.coins || {})) {
      const addr = addressToKey.get(coinKey.toLowerCase());
      if (!addr || !(coinData as any)?.price) continue;

      const price: TokenPrice = {
        price: (coinData as any).price,
        confidence: (coinData as any).confidence ?? 1,
        timestamp: (coinData as any).timestamp ?? Date.now() / 1000,
      };

      results.set(addr, price);
      priceCache.set(coinKey.toLowerCase(), { price, fetchedAt: Date.now() });
    }
    if (priceCache.size > MAX_TOKEN_CACHE_SIZE) {
      const keysToDelete = [...priceCache.keys()].slice(0, priceCache.size - MAX_TOKEN_CACHE_SIZE);
      keysToDelete.forEach(k => priceCache.delete(k));
    }
  } catch (e) {
    console.warn("Failed to fetch batch prices:", e);
  }

  return results;
}

// Cache for token metadata to avoid repeated calls
const tokenMetadataCache = new Map<string, TokenMetadata>();

// Minimal ERC20 ABI for metadata
const ERC20_METADATA_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
];

/**
 * Fetch token metadata (symbol, name, decimals) for an ERC-20 token
 */
export async function fetchTokenMetadata(
  tokenAddress: string,
  provider?: ethers.providers.Provider
): Promise<TokenMetadata | null> {
  const cacheKey = tokenAddress.toLowerCase();
  if (tokenMetadataCache.has(cacheKey)) {
    return tokenMetadataCache.get(cacheKey)!;
  }

  // Default fallback metadata
  const fallback: TokenMetadata = {
    symbol: tokenAddress.slice(0, 6) + "...",
    name: "Unknown Token",
    decimals: 18,
  };

  if (!provider) {
    return fallback;
  }

  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_METADATA_ABI, provider);
    const [symbol, name, decimals] = await Promise.all([
      contract.symbol().catch(() => null),
      contract.name().catch(() => fallback.name),
      contract.decimals().catch(() => 18),
    ]);

    // If symbol() failed (returned null) or looks like an address, don't
    // cache — a subsequent call with a better provider might succeed.
    if (!symbol || symbol.startsWith("0x")) {
      return fallback;
    }

    const metadata: TokenMetadata = { symbol, name, decimals };
    tokenMetadataCache.set(cacheKey, metadata);
    if (tokenMetadataCache.size > MAX_TOKEN_CACHE_SIZE) {
      const first = tokenMetadataCache.keys().next().value;
      if (first) tokenMetadataCache.delete(first);
    }
    return metadata;
  } catch (e) {
    console.warn(`Failed to fetch metadata for ${tokenAddress}:`, e);
    return fallback;
  }
}

/**
 * Set token metadata in cache (for pre-known tokens)
 */
export function setTokenMetadataCache(tokenAddress: string, metadata: TokenMetadata) {
  tokenMetadataCache.set(tokenAddress.toLowerCase(), metadata);
}

/**
 * Synchronous lookup against the pre-seeded metadata cache. Returns `null` if
 * nothing is known — callers should fall back to their own sources rather
 * than triggering an RPC round-trip inside a render path.
 */
export function getCachedTokenMetadata(tokenAddress: string): TokenMetadata | null {
  return tokenMetadataCache.get(tokenAddress.toLowerCase()) ?? null;
}

// Pre-cache common tokens (Ethereum Mainnet)
setTokenMetadataCache("0xdAC17F958D2ee523a2206206994597C13D831ec7", { symbol: "USDT", name: "Tether USD", decimals: 6 });
setTokenMetadataCache("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", { symbol: "USDC", name: "USD Coin", decimals: 6 });
setTokenMetadataCache("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", { symbol: "WETH", name: "Wrapped Ether", decimals: 18 });
setTokenMetadataCache("0x6B175474E89094C44Da98b954EecdeCB5AC5DA6D", { symbol: "DAI", name: "Dai Stablecoin", decimals: 18 });
setTokenMetadataCache("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", { symbol: "UNI", name: "Uniswap", decimals: 18 });
setTokenMetadataCache("0x514910771AF9Ca656af840dff83E8264EcF986CA", { symbol: "LINK", name: "Chainlink", decimals: 18 });
setTokenMetadataCache("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", { symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8 });
setTokenMetadataCache("0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", { symbol: "AAVE", name: "Aave", decimals: 18 });
setTokenMetadataCache("0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", { symbol: "SHIB", name: "Shiba Inu", decimals: 18 });
setTokenMetadataCache("0x6982508145454Ce325dDbE47a25d4ec3d2311933", { symbol: "PEPE", name: "Pepe", decimals: 18 });

// Base
setTokenMetadataCache("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", { symbol: "USDC", name: "USD Coin", decimals: 6 });
setTokenMetadataCache("0x4200000000000000000000000000000000000006", { symbol: "WETH", name: "Wrapped Ether", decimals: 18 });

// Arbitrum
setTokenMetadataCache("0xaf88d065e77c8cC2239327C5EDb3A432268e5831", { symbol: "USDC", name: "USD Coin", decimals: 6 });
setTokenMetadataCache("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", { symbol: "USDT", name: "Tether USD", decimals: 6 });
setTokenMetadataCache("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", { symbol: "WETH", name: "Wrapped Ether", decimals: 18 });

/**
 * Parse a log event to detect token transfers
 */
export function parseTokenTransfer(
  log: { address: string; topics: string[]; data: string },
): TokenMovement | null {
  if (!log.topics || log.topics.length === 0) return null;

  const topic0 = log.topics[0]?.toLowerCase();
  const tokenAddress = log.address;

  try {
    // ERC-20 or ERC-721 Transfer
    if (topic0 === TRANSFER_TOPIC.toLowerCase()) {
      // ERC-721 has 4 topics (including topic0), ERC-20 has 3
      const isERC721 = log.topics.length === 4;

      if (isERC721) {
        // ERC-721: Transfer(from, to, tokenId) - all indexed
        const iface = new ethers.utils.Interface(ERC721_TRANSFER_ABI);
        const decoded = iface.parseLog(log);
        return {
          tokenType: "ERC-721",
          tokenAddress,
          from: decoded.args.from,
          to: decoded.args.to,
          amount: "1",
          tokenId: decoded.args.tokenId.toString(),
        };
      } else {
        // ERC-20: Transfer(from, to, value) - from, to indexed, value in data
        const iface = new ethers.utils.Interface(ERC20_TRANSFER_ABI);
        const decoded = iface.parseLog(log);
        return {
          tokenType: "ERC-20",
          tokenAddress,
          from: decoded.args.from,
          to: decoded.args.to,
          amount: decoded.args.value.toString(),
        };
      }
    }

    // ERC-1155 TransferSingle
    if (topic0 === TRANSFER_SINGLE_TOPIC.toLowerCase()) {
      const iface = new ethers.utils.Interface(ERC1155_SINGLE_ABI);
      const decoded = iface.parseLog(log);
      return {
        tokenType: "ERC-1155",
        tokenAddress,
        from: decoded.args.from,
        to: decoded.args.to,
        amount: decoded.args.value.toString(),
        tokenId: decoded.args.id.toString(),
      };
    }

    // ERC-1155 TransferBatch - returns multiple movements
    if (topic0 === TRANSFER_BATCH_TOPIC.toLowerCase()) {
      const iface = new ethers.utils.Interface(ERC1155_BATCH_ABI);
      const decoded = iface.parseLog(log);
      // Cast args to any to access array fields safely
      const args = decoded.args as any;
      const ids = args.ids;
      const values = args.values;
      // For simplicity, return the first transfer; caller should handle batch separately
      if (ids && ids.length > 0) {
        return {
          tokenType: "ERC-1155",
          tokenAddress,
          from: args.from,
          to: args.to,
          amount: String(values[0]),
          tokenId: String(ids[0]),
        };
      }
    }
  } catch (e) {
    // Failed to decode - not a valid token transfer
    return null;
  }

  return null;
}

/**
 * Parse all ERC-1155 batch transfers into individual movements
 */
export function parseERC1155Batch(
  log: { address: string; topics: string[]; data: string }
): TokenMovement[] {
  const topic0 = log.topics[0]?.toLowerCase();
  if (topic0 !== TRANSFER_BATCH_TOPIC.toLowerCase()) return [];

  try {
    const iface = new ethers.utils.Interface(ERC1155_BATCH_ABI);
    const decoded = iface.parseLog(log);
    const movements: TokenMovement[] = [];
    
    // Cast args to any to access array fields safely
    const args = decoded.args as any;
    const ids = args.ids;
    const values = args.values;

    for (let i = 0; i < ids.length; i++) {
      movements.push({
        tokenType: "ERC-1155",
        tokenAddress: log.address,
        from: args.from,
        to: args.to,
        amount: String(values[i]),
        tokenId: String(ids[i]),
      });
    }

    return movements;
  } catch {
    return [];
  }
}

/**
 * Options for extracting token movements
 */
export interface ExtractTokenMovementsOptions {
  /**
   * Map of implementation/facet address → proxy address
   * Used to resolve the correct token address when events come from proxy implementations
   */
  implementationToProxy?: Map<string, string>;
  /**
   * Map of address → token symbol (for pre-resolved symbols)
   */
  addressToSymbol?: Map<string, string>;
}

/**
 * Extract all token movements from trace events/logs
 * @param events Array of event logs from trace
 * @param options Optional configuration for address resolution
 */
export function extractTokenMovements(
  events: Array<{ address?: string; topics?: string[]; data?: string; decoded?: any }>,
  options?: ExtractTokenMovementsOptions
): TokenMovement[] {
  const movements: TokenMovement[] = [];
  const { implementationToProxy, addressToSymbol } = options || {};

  for (const event of events) {
    if (!event.address || !event.topics || !event.data) continue;

    // Resolve the token address - if this is an implementation/facet, use the proxy instead
    let tokenAddress = event.address;
    const lowerAddr = tokenAddress.toLowerCase();

    if (implementationToProxy) {
      const proxyAddr = implementationToProxy.get(lowerAddr);
      if (proxyAddr) {
        tokenAddress = proxyAddr;
      }
    }

    const log = {
      address: tokenAddress,
      topics: event.topics,
      data: event.data,
    };

    // Check for batch transfers first
    if (log.topics[0]?.toLowerCase() === TRANSFER_BATCH_TOPIC.toLowerCase()) {
      const batchMovements = parseERC1155Batch(log);
      // Add pre-resolved symbol if available
      for (const m of batchMovements) {
        if (addressToSymbol) {
          const symbol = addressToSymbol.get(m.tokenAddress.toLowerCase());
          if (symbol) m.tokenSymbol = symbol;
        }
        movements.push(m);
      }
    } else {
      const movement = parseTokenTransfer(log);
      if (movement) {
        // Add pre-resolved symbol if available
        if (addressToSymbol) {
          const symbol = addressToSymbol.get(movement.tokenAddress.toLowerCase());
          if (symbol) movement.tokenSymbol = symbol;
        }
        movements.push(movement);
      }
    }
  }

  return movements;
}

/**
 * Convert raw movements into per-address balance changes
 */
export function aggregateBalanceChanges(
  movements: TokenMovement[],
  senderAddress?: string
): BalanceChange[] {
  // Map: address -> tokenKey -> delta
  // For ERC-721/ERC-1155, tokenKey includes tokenId since each tokenId is a distinct token
  // For ERC-20, tokenKey is just the token address
  const balances = new Map<string, Map<string, { delta: bigint; tokenType: TokenType; tokenId?: string; tokenSymbol?: string; tokenAddress: string }>>();

  for (const m of movements) {
    // Skip movements with invalid/missing data
    if (!m.from || !m.to || !m.tokenAddress || m.amount === undefined || m.amount === null) {
      continue;
    }
    const fromKey = m.from.toLowerCase();
    const toKey = m.to.toLowerCase();
    const tokenAddressLower = m.tokenAddress.toLowerCase();
    // Handle potential string "undefined" or empty string
    const amountStr = String(m.amount || "0");
    const amount = BigInt(amountStr === "undefined" || amountStr === "" ? "0" : amountStr);

    // For NFTs (ERC-721 and ERC-1155), each tokenId is a separate token
    // Include tokenId in the key to track them separately
    const isNft = m.tokenType === "ERC-721" || m.tokenType === "ERC-1155";
    const tokenKey = isNft && m.tokenId
      ? `${tokenAddressLower}:${m.tokenId}`
      : tokenAddressLower;

    // Subtract from sender (outgoing)
    if (!balances.has(fromKey)) balances.set(fromKey, new Map());
    const fromTokenMap = balances.get(fromKey)!;
    const fromExisting = fromTokenMap.get(tokenKey) || { delta: 0n, tokenType: m.tokenType, tokenId: m.tokenId, tokenSymbol: m.tokenSymbol, tokenAddress: tokenAddressLower };
    fromExisting.delta -= amount;
    // Keep best symbol (prefer non-truncated)
    if (m.tokenSymbol && !m.tokenSymbol.startsWith("0x")) fromExisting.tokenSymbol = m.tokenSymbol;
    fromTokenMap.set(tokenKey, fromExisting);

    // Add to receiver (incoming)
    if (!balances.has(toKey)) balances.set(toKey, new Map());
    const toTokenMap = balances.get(toKey)!;
    const toExisting = toTokenMap.get(tokenKey) || { delta: 0n, tokenType: m.tokenType, tokenId: m.tokenId, tokenSymbol: m.tokenSymbol, tokenAddress: tokenAddressLower };
    toExisting.delta += amount;
    // Keep best symbol (prefer non-truncated)
    if (m.tokenSymbol && !m.tokenSymbol.startsWith("0x")) toExisting.tokenSymbol = m.tokenSymbol;
    toTokenMap.set(tokenKey, toExisting);
  }

  // Convert to array
  const changes: BalanceChange[] = [];
  const senderLower = senderAddress?.toLowerCase();

  balances.forEach((tokenMap, address) => {
    tokenMap.forEach((info, _tokenKey) => {
      // Grouped balance view should show effective deltas only.
      if (info.delta === 0n) return;

      // Use the actual token address stored in info (tokenKey may include tokenId for NFTs)
      const tokenAddress = info.tokenAddress;
      // Get cached metadata — ignore entries whose symbol looks like a
      // truncated address (these are stale failures from earlier RPC calls).
      const metadata = tokenMetadataCache.get(tokenAddress);
      const cachedSymbol = metadata?.symbol && !metadata.symbol.startsWith("0x") ? metadata.symbol : null;
      const symbol = cachedSymbol || info.tokenSymbol || tokenAddress.slice(0, 8) + "...";

      // ERC-721 tokens are indivisible (no decimals), ERC-1155 typically uses whole numbers too
      // Only ERC-20 tokens have meaningful decimals
      const decimals = info.tokenType === "ERC-20" ? (metadata?.decimals ?? 18) : 0;

      // Format the delta
      const isNegative = info.delta < 0n;
      const absValue = isNegative ? -info.delta : info.delta;
      const formatted = ethers.utils.formatUnits(absValue, decimals);
      const sign = isNegative ? "-" : "+";

      // Determine label
      let label: string | undefined;
      if (senderLower && address === senderLower) {
        label = "Sender";
      }

      changes.push({
        address,
        label,
        tokenAddress,
        tokenSymbol: symbol,
        tokenType: info.tokenType,
        delta: `${sign}${formatted}`,
        rawDelta: info.delta,
        formattedDelta: formatted,
        tokenId: info.tokenId,
      });
    });
  });

  // Sort: outgoing (negative delta) first, then incoming; within each group sender first, then alphabetical
  changes.sort((a, b) => {
    const aOut = a.rawDelta < 0n ? 0 : 1;
    const bOut = b.rawDelta < 0n ? 0 : 1;
    if (aOut !== bOut) return aOut - bOut;
    if (a.label === "Sender" && b.label !== "Sender") return -1;
    if (b.label === "Sender" && a.label !== "Sender") return 1;
    return a.address.localeCompare(b.address);
  });

  return changes;
}

/**
 * Group balance changes by token type
 */
export function groupByTokenType(changes: BalanceChange[]): Record<TokenType, BalanceChange[]> {
  const groups: Record<TokenType, BalanceChange[]> = {
    "ERC-20": [],
    "ERC-721": [],
    "ERC-1155": [],
  };

  for (const change of changes) {
    groups[change.tokenType].push(change);
  }

  return groups;
}
