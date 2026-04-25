export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
export const SAFE_SINGLETON_141 = '0x41675C099F32341bf84BFc5382aF534df5C7461a';
export const SAFE_L1_SINGLETON_130 = '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552';
export const SAFE_L2_SINGLETON_130 = '0x3E5c63644E683549055b9Be8653de26E0B4CD36E';
export const MULTISEND_CALL_ONLY_141 =
  '0x9641d764fc13c8B624c04430C7356C1C7C8102e2';
export const SEAPORT_16 = '0x0000000000000068F116a894984e2DB1123eB395';
export const UNISWAPX_V2_DUTCH_REACTOR =
  '0x00000011F84B9aa48e5f8aA8B9897600006289Be';
export const COW_GPV2_SETTLEMENT =
  '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';

export const SAFE_TX_TYPEHASH =
  '0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8';

export type CanonicalKind =
  | 'permit2'
  | 'safe'
  | 'seaport'
  | 'uniswapx'
  | 'cow';

const SETS: Record<CanonicalKind, ReadonlySet<string>> = {
  permit2: new Set([PERMIT2.toLowerCase()]),
  safe: new Set([
    SAFE_SINGLETON_141.toLowerCase(),
    SAFE_L1_SINGLETON_130.toLowerCase(),
    SAFE_L2_SINGLETON_130.toLowerCase(),
  ]),
  seaport: new Set([SEAPORT_16.toLowerCase()]),
  uniswapx: new Set([UNISWAPX_V2_DUTCH_REACTOR.toLowerCase()]),
  cow: new Set([COW_GPV2_SETTLEMENT.toLowerCase()]),
};

export function isCanonical(address: string, kind: CanonicalKind): boolean {
  if (!address) return false;
  return SETS[kind].has(address.toLowerCase());
}
