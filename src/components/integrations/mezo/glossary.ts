/**
 * Tooltip definitions for <Term> and SideRailNav. 1–3 sentences each;
 * audience is a DeFi user who doesn't know Liquity vocab.
 */
export const MEZO_GLOSSARY = {
  stack: {
    title: "Composed Stack",
    body:
      "One atomic flow that opens a BTC-backed trove, mints MUSD, parks part of it in sMUSD for yield, and locks MEZO for veMEZO voting power — every step previewed before you sign.",
  },
  borrow: {
    title: "Borrow (Trove)",
    body:
      "Open a Liquity-style CDP — deposit BTC, mint MUSD against it. Liquidates if collateral ratio drops below 110%.",
  },
  swap: {
    title: "Swap",
    body:
      "Trade any Mezo Pools pair, or redeem MUSD for BTC at face value. Ships in v2.",
  },
  save: {
    title: "Save (sMUSD)",
    body:
      "Deposit MUSD into the sMUSD vault for direct yield. Gauge-staked emissions arrive in v2.",
  },
  liquidity: {
    title: "Liquidity + Stake",
    body:
      "Provide liquidity to any Mezo pool, optionally stake the LP for emissions. Ships in v2.",
  },
  lock: {
    title: "Lock (veMEZO)",
    body:
      "Lock MEZO into veMEZO as a non-transferable governance NFT. Voting power decays linearly toward zero at unlock.",
  },

  btc: {
    title: "BTC (native)",
    body:
      "Bitcoin, native gas/collateral asset on Mezo testnet. Faucet drips ≈ 0.05 BTC per claim.",
  },
  musd: {
    title: "MUSD",
    body:
      "Mezo's collateral-backed stablecoin minted against BTC via openTrove. Canonical address: 0x1189…3eB.",
  },
  smusd: {
    title: "sMUSD",
    body:
      "Yield-bearing wrapper for MUSD — deposit MUSD, receive sMUSD that accrues protocol fees.",
  },
  mezo: {
    title: "MEZO",
    body:
      "Mezo governance token. Lock it as veMEZO to gain voting power over emissions and pool weights.",
  },
  vemezo: {
    title: "veMEZO",
    body:
      "Non-transferable governance NFT minted by locking MEZO. Voting weight = lockedAmount × (duration / maxDuration), decays linearly.",
  },

  trove: {
    title: "Trove",
    body:
      "Liquity-style CDP — your BTC-collateralized debt position. Each user has at most one trove per market.",
  },
  icr: {
    title: "ICR — Individual Collateral Ratio",
    body:
      "Trove collateral value ÷ debt, expressed as a percentage. Falls below 110% and your trove gets liquidated.",
  },
  ltv: {
    title: "LTV — Loan-to-Value",
    body:
      "Debt ÷ collateral value, expressed as a percentage. Inverse of ICR — higher LTV means more risk.",
  },
  liquidation: {
    title: "Liquidation price",
    body:
      "BTC/USD level at which your trove's ICR drops to 110% and the protocol seizes collateral to repay your debt. If BTC trades below this, you lose collateral.",
  },
  troveDebt: {
    title: "Total trove debt",
    body:
      "MUSD you owe the protocol — net borrow plus 200 MUSD gas compensation (refunded on clean close). Liquidation seizes collateral to repay this.",
  },
  gasComp: {
    title: "Gas compensation",
    body:
      "200 MUSD is added to your debt as a liquidation incentive. Refunded if you close the trove cleanly.",
  },
  minDebt: {
    title: "Minimum net debt",
    body:
      "Mezo enforces a 1,800 MUSD floor on borrowable amounts. Total mint = 1,800 net + 200 gas compensation = 2,000 minimum.",
  },
  gauge: {
    title: "Gauge",
    body:
      "Per-pool emissions distributor. veMEZO holders vote on weights to direct MEZO emissions. Currently dormant on testnet (rewardRate=0).",
  },
  voteWeight: {
    title: "Vote weight",
    body:
      "lockedMEZO × (lockDuration / maxLockDuration). Decays linearly with time, hits zero at unlock.",
  },
  preview: {
    title: "Bundle preview",
    body:
      "Mezo Lens calls eth_simulateV1 with your wallet's state, returning exactly what would happen if you signed. No on-chain side effects.",
  },
  atomicBundle: {
    title: "Atomic bundle",
    body:
      "All legs simulate together with shared state — later legs see the effects of earlier ones, just like a real Multicall transaction.",
  },
} as const;

export type GlossaryKey = keyof typeof MEZO_GLOSSARY;
