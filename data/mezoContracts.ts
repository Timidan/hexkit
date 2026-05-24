import type { Address } from "viem";

/**
 * Mezo testnet contract registry (chain 31611).
 *
 * Addresses with `__DAY_0__` literal placeholders MUST be replaced before
 * the relevant Mezo Lens flow can execute on-chain. The simulation
 * infrastructure works even with placeholders — eth_simulateV1 will
 * surface the resulting reverts as "leg would fail" warnings.
 *
 * Sources:
 *   - Mezo Docs: https://mezo.org/docs/users/resources/contracts-reference/
 *   - Blockscout: https://api.explorer.test.mezo.org/api/v2/
 *   - Day-0 smoke probe: scripts/mezo-day-0-smoke.sh
 */

export const MEZO_TESTNET_CHAIN_ID = 31611 as const;

const PLACEHOLDER: Address = "0x0000000000000000000000000000000000000000";

export const MEZO_CONTRACTS = {
  // ── Tokens ──────────────────────────────────────────────────────────────

  /** Canonical MUSD (bound to BorrowerOperations). */
  MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as Address,

  /** Native BTC ERC-20 surface used by Mezo Pools; gas is still paid in BTC. */
  BTC: "0x7b7C000000000000000000000000000000000000" as Address,

  /** MEZO precompile — ERC-20 surface backed by the Cosmos SDK bank module. */
  MEZO: "0x7B7c000000000000000000000000000000000001" as Address,

  /** sMUSD savings vault — non-standard ERC-4626 interface; signature pulled at Day 0. */
  sMUSD: "0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16" as Address,

  // ── CDP stack (Liquity fork — verified live on testnet) ─────────────────

  BorrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5" as Address,
  TroveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0" as Address,
  StabilityPool: "0x1CCA7E410eE41739792eA0A24e00349Dd247680e" as Address,
  PriceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366" as Address,
  HintHelpers: "0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6" as Address,
  SortedTroves: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA" as Address,

  // ── Mezo Earn (Aerodrome ve(3,3) fork) ──────────────────────────────────

  /** veBTC — the base-weight ve token (locks BTC). Verified live. */
  veBTC: "0xB63fcCd03521Cf21907627bd7fA465C129479231" as Address,

  /**
   * veMEZO — governance ERC-721 NFT (locks MEZO).
   * Verified on Mezo testnet: `token()` returns the MEZO precompile,
   * `symbol()` and `name()` both decode to "veMEZO". Blockscout token page:
   * https://api.explorer.test.mezo.org/token/0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b
   */
  veMEZO: "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b" as Address,

  /** Voter — gauge directory + vote allocation. `Voter.ve` returns veBTC. */
  Voter: "0x72F8dd7F44fFa19E45955aa20A5486E8EB255738" as Address,

  // ── Mezo Pools (Velodrome fork) ─────────────────────────────────────────

  /** Pool factory — enumerable + token-pair lookup. */
  PoolFactory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A" as Address,

  /** Router — basic-pool Aerodrome-style router on Mezo testnet. */
  Router: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9" as Address,

  /** MUSD/BTC vAMM pool — confirmed via factory lookup. */
  MUSD_BTC_Pool: "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9" as Address,
} as const;

/**
 * Returns true if the given address is the zero-address sentinel (placeholder
 * for Day-0 resolution). UI surfaces should detect this and show "coming
 * after Day-0 smoke" copy instead of executing writes.
 */
export function isPlaceholderAddress(addr: Address): boolean {
  return addr.toLowerCase() === PLACEHOLDER.toLowerCase();
}

export function isNativeBtcAddress(addr: Address): boolean {
  const lower = addr.toLowerCase();
  return (
    lower === MEZO_CONTRACTS.BTC.toLowerCase() ||
    lower === PLACEHOLDER.toLowerCase()
  );
}

export function toMezoPoolTokenAddress(addr: Address): Address {
  return isNativeBtcAddress(addr) ? MEZO_CONTRACTS.BTC : addr;
}

/**
 * Non-canonical MUSD that other dApps may have deployed. We detect and warn
 * if the user has a balance here — only `MEZO_CONTRACTS.MUSD` is supported.
 */
export const KNOWN_WRONG_MUSD = "0x637e22A1EBbca50EA2d34027c238317fD10003eB" as Address;

// ── Useful constants ───────────────────────────────────────────────────────

export const MUSD_DECIMALS = 18 as const;
export const BTC_DECIMALS = 18 as const; // Mezo represents BTC at 18 decimals (1e18 wei = 1 BTC)
export const MEZO_DECIMALS = 18 as const;

/** Liquity-style minimum net debt — borrower-side floor; gas comp adds 200. */
export const MIN_NET_DEBT_MUSD = 1800n * 10n ** 18n;
export const MUSD_GAS_COMPENSATION = 200n * 10n ** 18n;

/** Minimum total debt = MIN_NET_DEBT + MUSD_GAS_COMPENSATION. */
export const MIN_TROVE_DEBT_MUSD = MIN_NET_DEBT_MUSD + MUSD_GAS_COMPENSATION;

/** Minimum Collateral Ratio in basis points (110% = 11000). */
export const MCR_BPS = 11000 as const;
