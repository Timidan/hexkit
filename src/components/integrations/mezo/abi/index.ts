/**
 * Minimal ABI fragments covering every selector Mezo Lens encodes.
 *
 * Signatures sourced from:
 *   - MUSD source: github.com/mezo-org/musd/solidity/contracts/
 *   - Tigris source: github.com/mezo-org/tigris/solidity/contracts/ (archived)
 *   - Mezo docs: mezo.org/docs/developers/musd/
 *   - Day-0 smoke verification (scripts/mezo-day-0-smoke.sh)
 */

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const BORROWER_OPERATIONS_ABI = [
  {
    type: "function",
    name: "openTrove",
    stateMutability: "payable",
    inputs: [
      { name: "_debtAmount", type: "uint256" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "adjustTrove",
    stateMutability: "payable",
    inputs: [
      { name: "_collWithdrawal", type: "uint256" },
      { name: "_debtChange", type: "uint256" },
      { name: "_isDebtIncrease", type: "bool" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repayMUSD",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "closeTrove",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

// Troves struct order matches MUSD source.
const TROVE_MANAGER_ABI = [
  {
    type: "function",
    name: "Troves",
    stateMutability: "view",
    inputs: [{ name: "_borrower", type: "address" }],
    outputs: [
      { name: "coll", type: "uint256" },
      { name: "principal", type: "uint256" },
      { name: "interestOwed", type: "uint256" },
      { name: "stake", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "interestRate", type: "uint256" },
      { name: "lastInterestUpdateTime", type: "uint256" },
      { name: "maxBorrowingCapacity", type: "uint256" },
      { name: "arrayIndex", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getCurrentICR",
    stateMutability: "view",
    inputs: [
      { name: "_borrower", type: "address" },
      { name: "_price", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTroveOwnersCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTCR",
    stateMutability: "view",
    inputs: [{ name: "_price", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// fetchPrice is declared `nonpayable` on-chain (it updates a cached price)
// but `eth_call` returns the current value without persisting. Declared as
// `view` here so wagmi's `useReadContract` treats it as a read — the
// selector is identical either way.
const PRICE_FEED_ABI = [
  {
    type: "function",
    name: "fetchPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const HINT_HELPERS_ABI = [
  {
    type: "function",
    name: "getApproxHint",
    stateMutability: "view",
    inputs: [
      { name: "_CR", type: "uint256" },
      { name: "_numTrials", type: "uint256" },
      { name: "_inputRandomSeed", type: "uint256" },
    ],
    outputs: [
      { name: "hintAddress", type: "address" },
      { name: "diff", type: "uint256" },
      { name: "latestRandomSeed", type: "uint256" },
    ],
  },
] as const;

const SORTED_TROVES_ABI = [
  {
    type: "function",
    name: "findInsertPosition",
    stateMutability: "view",
    inputs: [
      { name: "_ICR", type: "uint256" },
      { name: "_prevId", type: "address" },
      { name: "_nextId", type: "address" },
    ],
    outputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
    ],
  },
  {
    type: "function",
    name: "getSize",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getFirst",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getLast",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// sMUSD has a non-standard interface; Day-0 smoke confirms the deposit
// signature. Fallback assumes a minimal `deposit(uint256)` shape.
const SMUSD_ABI = [
  ...ERC20_ABI,
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;

// veMEZO uses Tigris camelCase signatures (createLock, not Curve's create_lock).
const VOTING_ESCROW_ABI = [
  {
    type: "function",
    name: "createLock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "value", type: "uint256" },
      { name: "lockDuration", type: "uint256" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "increaseAmount",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "increaseUnlockTime",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "lockDuration", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "locked",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "int128" },
          { name: "end", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "balanceOfNFT",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const VOTER_ABI = [
  {
    type: "function",
    name: "gauges",
    stateMutability: "view",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "ve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const GAUGE_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getReward",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "earned",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "rewardToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "rewardRate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Mezo Pool — Velodrome fork.
const MEZO_POOL_ABI = [
  ...ERC20_ABI,
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_reserve0", type: "uint256" },
      { name: "_reserve1", type: "uint256" },
      { name: "_blockTimestampLast", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "stable",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const POOL_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

// Router — Velodrome fork.
const ROUTER_ROUTE_COMPONENTS = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "stable", type: "bool" },
  { name: "factory", type: "address" },
] as const;

const ROUTER_ABI = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: ROUTER_ROUTE_COMPONENTS,
      },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: ROUTER_ROUTE_COMPONENTS,
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactETHForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: ROUTER_ROUTE_COMPONENTS,
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForETH",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: ROUTER_ROUTE_COMPONENTS,
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "addLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
      { name: "amountADesired", type: "uint256" },
      { name: "amountBDesired", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "addLiquidityETH",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "stable", type: "bool" },
      { name: "amountTokenDesired", type: "uint256" },
      { name: "amountTokenMin", type: "uint256" },
      { name: "amountETHMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountToken", type: "uint256" },
      { name: "amountETH", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "removeLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
      { name: "liquidity", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
    ],
  },
] as const;

export const MEZO_ABIS = {
  MUSD: ERC20_ABI,
  MEZO: ERC20_ABI,
  sMUSD: SMUSD_ABI,
  BorrowerOperations: BORROWER_OPERATIONS_ABI,
  TroveManager: TROVE_MANAGER_ABI,
  PriceFeed: PRICE_FEED_ABI,
  HintHelpers: HINT_HELPERS_ABI,
  SortedTroves: SORTED_TROVES_ABI,
  VotingEscrow: VOTING_ESCROW_ABI,
  Voter: VOTER_ABI,
  Gauge: GAUGE_ABI,
  MezoPool: MEZO_POOL_ABI,
  PoolFactory: POOL_FACTORY_ABI,
  Router: ROUTER_ABI,
} as const;

export type MezoContractName = keyof typeof MEZO_ABIS;
