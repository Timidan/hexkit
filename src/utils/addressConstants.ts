export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const NATIVE_TOKEN_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const NATIVE_SENTINELS: ReadonlySet<string> = new Set([
  ZERO_ADDRESS,
  NATIVE_TOKEN_SENTINEL,
]);

export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const isNativeToken = (address: string | null | undefined): boolean => {
  if (!address) return false;
  return NATIVE_SENTINELS.has(address.toLowerCase());
};
