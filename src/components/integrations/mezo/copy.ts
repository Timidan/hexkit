/**
 * User-facing copy for Mezo Lens. Keep builder jargon out — no
 * "eth_simulateV1", "state override", "ABI", "decoder", etc.
 */
export const MEZO_LENS_COPY = {
  pageTitle: "Mezo Lens",
  pageSubtitle:
    "Put your BTC, MUSD, and MEZO to work on Mezo — preview every step before you sign.",
  integrationPillLabel: "Mezo Lens",
  integrationPillDescription:
    "Borrow, save, lock — six purpose-built Mezo actions with full position preview.",

  // Empty / error states
  emptyStateConnectWallet: "Connect your wallet to see your Mezo positions.",
  emptyStateWrongChain: "Switch to Mezo Testnet to continue.",
  emptyStateInsufficientBtc:
    "You need at least 0.028 BTC for a minimum trove. Claim from the faucet.",
  emptyStateRpcUnreachable: "Mezo testnet is unreachable. Retry in a moment.",

  // CTAs
  switchToMezoCta: "Switch to Mezo Testnet",
  openFaucetCta: "Open faucet",
  buildStackCta: "Build Stack",
  previewCta: "Preview",
  executeCta: "Execute",
  retryCta: "Retry",
  resetCta: "Reset",

  // Tabs
  tabs: {
    stack: {
      label: "Stack",
      title: "Composed Stack",
      subtitle: "Borrow MUSD against BTC, save it, lock MEZO — one composed flow.",
    },
    borrow: {
      label: "Borrow",
      title: "Trove",
      subtitle: "Open, adjust, repay, or close your CDP against BTC collateral.",
    },
    swap: {
      label: "Swap",
      title: "Swap",
      subtitle:
        "Swap BTC, MUSD, and MEZO through a single Mezo Router pool with quoted output before signing.",
    },
    save: {
      label: "Save",
      title: "MUSD Savings",
      subtitle: "Earn yield on MUSD via sMUSD. Optional gauge stake for emissions.",
    },
    liquidity: {
      label: "Liquidity",
      title: "Liquidity",
      subtitle:
        "Provide paired assets to a Mezo pool and preview reserves plus LP-token balance changes before signing.",
    },
    lock: {
      label: "Lock",
      title: "Lock MEZO",
      subtitle: "Lock MEZO into veMEZO as a governance position.",
    },
  },

  // PositionsSidebar
  positionsSidebar: {
    walletHeader: "Wallet",
    troveHeader: "Trove",
    troveEmpty: "No trove yet",
    troveLiquidationPrefix: "Liquidates @ $",
    savingsHeader: "MUSD Savings",
    savingsEmpty: "No sMUSD yet",
    veMezoHeader: "veMEZO",
    veMezoEmpty: "No active lock",
  },

  // Honesty footer
  honestyFooter:
    "Mezo Lens reads what the chain says. Testnet gauge emissions report rewardRate=0 — we display that directly. Canonical MUSD only (0x1189…3eB); duplicate 0x637e22A1… is detected and warned.",

  // Warnings
  warnings: {
    canonicalMusdOnly: "Canonical MUSD only — duplicate 0x637e22A1… detected and ignored.",
    dormantEmissions:
      "Testnet gauge emissions are dormant (rewardRate=0). The honest yield shown is direct sMUSD only.",
    icrTooLow: "Collateral ratio below safety margin (150%).",
    icrAtLiquidationRisk: "Collateral ratio close to liquidation threshold.",
    belowMinDebt: "Debt below MIN_NET_DEBT (1,800 MUSD).",
    lockTooShort: "Lock duration shorter than 4 weeks — minimum voting power.",
  },
} as const;
