export const MEZO_TESTNET_CHAIN_ID = 31611 as const;

export const MEZO_RPC_URL = "https://rpc.test.mezo.org" as const;

export const MEZO_FAUCET_URL = "https://faucet.test.mezo.org/" as const;

export const MEZO_BLOCKSCOUT_UI = "https://explorer.test.mezo.org" as const;

export const MEZO_BLOCKSCOUT_API = "https://api.explorer.test.mezo.org/api/v2" as const;

/**
 * Minimum BTC to open a trove at min net debt (1,800) + gas comp (200) under
 * MCR 110%, computed against the Day-0 BTC price ($77,365.83). The faucet
 * drips 0.05 BTC per claim — one Starter Stack with healthy margin.
 */
export const MEZO_MIN_BTC_FOR_TROVE = 0.028 as const;
