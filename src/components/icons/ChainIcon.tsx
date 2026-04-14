import React, { useEffect, useState } from "react";

/** Legacy key type — kept for backwards compatibility */
export type ChainKey =
  | "ETH"
  | "BASE"
  | "POLY"
  | "ARB"
  | "OP"
  | "BSC"
  | "GNO"
  | "LISK"
  | "AVAX";

interface ChainIconProps {
  /** Legacy chain key (ETH, BASE, etc.) */
  chain?: ChainKey;
  /** Chain ID — preferred, covers all 69 registry chains */
  chainId?: number;
  size?: number;
  rounded?: number;
}

const CHAIN_SLUG: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  14: "flare",
  25: "cronos",
  30: "rootstock",
  40: "telos",
  50: "xdc",
  56: "bsc",
  88: "viction",
  100: "gnosis",
  122: "fuse",
  130: "unichain",
  137: "polygon",
  143: "monad",
  146: "sonic",
  204: "op_bnb",
  232: "lens",
  252: "fraxtal",
  288: "boba",
  324: "zksync era",
  480: "world chain",
  534352: "scroll",
  747: "flow",
  988: "stable",
  999: "hyperevm",
  1088: "metis",
  1135: "lisk",
  1284: "moonbeam",
  1329: "sei",
  1337: "hyperliquid",
  1480: "vana",
  1625: "gravity",
  1868: "soneium",
  1923: "swell",
  2020: "ronin",
  2741: "abstract",
  2818: "morph",
  4217: "tempo",
  4326: "megaeth",
  5000: "mantle",
  8217: "kaia",
  8453: "base",
  9745: "plasma",
  13371: "immutable zkevm",
  21000000: "corn",
  33139: "apechain",
  34443: "mode",
  42161: "arbitrum",
  42220: "celo",
  42793: "etherlink",
  43111: "hemi",
  43114: "avalanche",
  50104: "sophon",
  55244: "superposition",
  57073: "ink",
  59144: "linea",
  60808: "bob",
  80094: "berachain",
  81457: "blast",
  98866: "plume",
  167000: "taiko",
  747474: "katana",
  // Testnets — use parent chain icon
  11155111: "ethereum",
  84532: "base",
  17000: "ethereum",
  4202: "lisk",
  80002: "polygon",
  421614: "arbitrum",
  11155420: "optimism",
  97: "bsc",
};

const KEY_TO_ID: Record<ChainKey, number> = {
  ETH: 1,
  BASE: 8453,
  POLY: 137,
  ARB: 42161,
  OP: 10,
  BSC: 56,
  GNO: 100,
  LISK: 1135,
  AVAX: 43114,
};

function getCdnUrl(slug: string): string {
  return `https://icons.llamao.fi/icons/chains/rsz_${slug}.jpg`;
}

const ChainIcon: React.FC<ChainIconProps> = ({
  chain,
  chainId,
  size = 24,
  rounded = 6,
}) => {
  const [imgError, setImgError] = useState(false);
  const r = Math.min(rounded, size / 2);

  const resolvedId = chainId ?? (chain ? KEY_TO_ID[chain] : undefined);
  const slug = resolvedId ? CHAIN_SLUG[resolvedId] : undefined;

  // Reset the error flag when the target chain changes — otherwise the same
  // ChainIcon instance (e.g. inside the network selector trigger) sticks on
  // the generic fallback for every subsequent chain after the first failure.
  useEffect(() => {
    setImgError(false);
  }, [slug]);

  if (slug && !imgError) {
    return (
      <img
        src={getCdnUrl(slug)}
        alt={slug}
        width={size}
        height={size}
        style={{ borderRadius: r, objectFit: "cover" }}
        onError={() => setImgError(true)}
        loading="lazy"
      />
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx={r} fill="#6B7280" />
      <circle cx="16" cy="16" r="8" stroke="white" strokeWidth="2" fill="none" />
      <circle cx="16" cy="16" r="3" fill="white" />
    </svg>
  );
};

export default ChainIcon;
