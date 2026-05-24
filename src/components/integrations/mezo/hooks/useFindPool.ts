import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { MEZO_ABIS } from "../abi";
import {
  MEZO_CONTRACTS,
  toMezoPoolTokenAddress,
} from "../../../../../data/mezoContracts";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Resolve the Mezo Pools pair address. When `stable` is omitted, both
 * variants are read so the UI can pick a default; when passed, `address`
 * follows that exact pool shape.
 */
export function useFindPool(
  tokenA?: Address,
  tokenB?: Address,
  stable?: boolean,
) {
  const poolTokenA = tokenA ? toMezoPoolTokenAddress(tokenA) : undefined;
  const poolTokenB = tokenB ? toMezoPoolTokenAddress(tokenB) : undefined;
  const enabled = canReadPair(poolTokenA, poolTokenB);
  const volatilePoolRead = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.PoolFactory,
    abi: MEZO_ABIS.PoolFactory,
    functionName: "getPool",
    args:
      enabled && poolTokenA && poolTokenB
        ? [poolTokenA, poolTokenB, false]
        : undefined,
    query: { enabled },
  });
  const stablePoolRead = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.PoolFactory,
    abi: MEZO_ABIS.PoolFactory,
    functionName: "getPool",
    args:
      enabled && poolTokenA && poolTokenB
        ? [poolTokenA, poolTokenB, true]
        : undefined,
    query: { enabled },
  });

  const volatilePool = normalizePoolAddress(volatilePoolRead.data);
  const stablePool = normalizePoolAddress(stablePoolRead.data);
  const defaultStable = !volatilePool && !!stablePool;
  const defaultPool = volatilePool ?? stablePool;
  const exactPool =
    stable === undefined ? defaultPool : stable ? stablePool : volatilePool;

  return {
    address: exactPool,
    pool: exactPool,
    defaultPool,
    stablePool,
    volatilePool,
    defaultStable,
    hasPool: !!exactPool,
    volatilePoolRead,
    stablePoolRead,
    isLoading: volatilePoolRead.isLoading || stablePoolRead.isLoading,
    error: volatilePoolRead.error ?? stablePoolRead.error,
  };
}

export function useReserves(
  tokenA?: Address,
  tokenB?: Address,
  stable?: boolean,
) {
  const poolTokenA = tokenA ? toMezoPoolTokenAddress(tokenA) : undefined;
  const poolTokenB = tokenB ? toMezoPoolTokenAddress(tokenB) : undefined;
  const poolEnabled =
    canReadPair(poolTokenA, poolTokenB) && stable !== undefined;
  const poolRead = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.PoolFactory,
    abi: MEZO_ABIS.PoolFactory,
    functionName: "getPool",
    args:
      poolEnabled && poolTokenA && poolTokenB && stable !== undefined
        ? [poolTokenA, poolTokenB, stable]
        : undefined,
    query: { enabled: poolEnabled },
  });
  const pool = normalizePoolAddress(poolRead.data);
  const hasPool = !!pool;

  const reservesRead = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: pool ?? ZERO_ADDR,
    abi: MEZO_ABIS.MezoPool,
    functionName: "getReserves",
    query: { enabled: hasPool },
  });
  const token0Read = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: pool ?? ZERO_ADDR,
    abi: MEZO_ABIS.MezoPool,
    functionName: "token0",
    query: { enabled: hasPool },
  });
  const token1Read = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: pool ?? ZERO_ADDR,
    abi: MEZO_ABIS.MezoPool,
    functionName: "token1",
    query: { enabled: hasPool },
  });

  const reserves = reservesRead.data as
    | readonly [bigint, bigint, bigint]
    | undefined;
  const token0 = normalizeAddress(token0Read.data);
  const token1 = normalizeAddress(token1Read.data);
  const token0IsA =
    poolTokenA && token0 ? sameAddress(token0, poolTokenA) : undefined;
  const reserveA =
    reserves && token0IsA !== undefined
      ? token0IsA
        ? reserves[0]
        : reserves[1]
      : undefined;
  const reserveB =
    reserves && token0IsA !== undefined
      ? token0IsA
        ? reserves[1]
        : reserves[0]
      : undefined;

  return {
    pool,
    hasPool,
    token0,
    token1,
    reserves,
    reserveA,
    reserveB,
    blockTimestampLast: reserves?.[2],
    poolRead,
    reservesRead,
    token0Read,
    token1Read,
    isLoading:
      poolRead.isLoading ||
      reservesRead.isLoading ||
      token0Read.isLoading ||
      token1Read.isLoading,
    error:
      poolRead.error ??
      reservesRead.error ??
      token0Read.error ??
      token1Read.error,
  };
}

function canReadPair(tokenA?: Address, tokenB?: Address): boolean {
  return !!(tokenA && tokenB && !sameAddress(tokenA, tokenB));
}

function normalizePoolAddress(value: unknown): Address | undefined {
  const addr = normalizeAddress(value);
  return addr && !sameAddress(addr, ZERO_ADDR) ? addr : undefined;
}

function normalizeAddress(value: unknown): Address | undefined {
  return typeof value === "string" ? (value as Address) : undefined;
}

function sameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
