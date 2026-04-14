/**
 * Unified Chain Registry — single source of truth for all chain metadata.
 *
 * Every consumer (wagmi, networkConfigManager, explorer, LI.FI screens,
 * NetworkSelector) MUST derive its chain data from this registry.
 */

import type { Chain, ExplorerAPI } from "../types";

// ── Explorer API configs for chains that have them ──────────────────────────

const EXPLORER_APIS: Record<number, { explorerUrl: string; blockExplorer: string; apiUrl: string; explorers: ExplorerAPI[] }> = {
  1: {
    explorerUrl: "https://etherscan.io",
    blockExplorer: "https://etherscan.io",
    apiUrl: "https://api.etherscan.io/api",
    explorers: [
      { name: "Etherscan", url: "https://api.etherscan.io/api", type: "etherscan" },
      { name: "Blockscout", url: "https://eth.blockscout.com/api", type: "blockscout" },
    ],
  },
  8453: {
    explorerUrl: "https://basescan.org",
    blockExplorer: "https://basescan.org",
    apiUrl: "https://api.basescan.org/api",
    explorers: [
      { name: "BaseScan", url: "https://api.basescan.org/api", type: "etherscan" },
      { name: "Blockscout", url: "https://base.blockscout.com/api", type: "blockscout" },
    ],
  },
  137: {
    explorerUrl: "https://polygonscan.com",
    blockExplorer: "https://polygonscan.com",
    apiUrl: "https://api.polygonscan.com/api",
    explorers: [
      { name: "PolygonScan", url: "https://api.polygonscan.com/api", type: "etherscan" },
      { name: "Polygon Blockscout", url: "https://polygon.blockscout.com/api", type: "blockscout" },
    ],
  },
  42161: {
    explorerUrl: "https://arbiscan.io",
    blockExplorer: "https://arbiscan.io",
    apiUrl: "https://api.arbiscan.io/api",
    explorers: [
      { name: "Arbiscan", url: "https://api.arbiscan.io/api", type: "etherscan" },
      { name: "Arbitrum Blockscout", url: "https://arbitrum.blockscout.com/api", type: "blockscout" },
    ],
  },
  10: {
    explorerUrl: "https://optimistic.etherscan.io",
    blockExplorer: "https://optimistic.etherscan.io",
    apiUrl: "https://api-optimistic.etherscan.io/api",
    explorers: [
      { name: "Optimistic Etherscan", url: "https://api-optimistic.etherscan.io/api", type: "etherscan" },
    ],
  },
  56: {
    explorerUrl: "https://bscscan.com",
    blockExplorer: "https://bscscan.com",
    apiUrl: "https://api.bscscan.com/api",
    explorers: [
      { name: "BSCScan", url: "https://api.bscscan.com/api", type: "etherscan" },
    ],
  },
  43114: {
    explorerUrl: "https://snowtrace.io",
    blockExplorer: "https://snowtrace.io",
    apiUrl: "https://api.snowtrace.io/api",
    explorers: [
      { name: "Snowtrace", url: "https://api.snowtrace.io/api", type: "etherscan" },
    ],
  },
  100: {
    explorerUrl: "https://gnosisscan.io",
    blockExplorer: "https://gnosisscan.io",
    apiUrl: "https://api.gnosisscan.io/api",
    explorers: [
      { name: "GnosisScan", url: "https://api.gnosisscan.io/api", type: "etherscan" },
      { name: "Gnosis Blockscout", url: "https://gnosis.blockscout.com/api", type: "blockscout" },
    ],
  },
  1135: {
    explorerUrl: "https://blockscout.lisk.com",
    blockExplorer: "https://blockscout.lisk.com",
    apiUrl: "https://blockscout.lisk.com/api",
    explorers: [
      { name: "Blockscout", url: "https://blockscout.lisk.com/api", type: "blockscout" },
    ],
  },
  534352: {
    explorerUrl: "https://scrollscan.com",
    blockExplorer: "https://scrollscan.com",
    apiUrl: "https://api.scrollscan.com/api",
    explorers: [
      { name: "Scrollscan", url: "https://api.scrollscan.com/api", type: "etherscan" },
      { name: "Scroll Blockscout", url: "https://scroll.blockscout.com/api", type: "blockscout" },
    ],
  },
  59144: {
    explorerUrl: "https://lineascan.build",
    blockExplorer: "https://lineascan.build",
    apiUrl: "https://api.lineascan.build/api",
    explorers: [
      { name: "Lineascan", url: "https://api.lineascan.build/api", type: "etherscan" },
      { name: "Linea Blockscout", url: "https://linea.blockscout.com/api", type: "blockscout" },
    ],
  },
  5000: {
    explorerUrl: "https://mantlescan.xyz",
    blockExplorer: "https://mantlescan.xyz",
    apiUrl: "https://api.mantlescan.xyz/api",
    explorers: [
      { name: "Mantlescan", url: "https://api.mantlescan.xyz/api", type: "etherscan" },
      { name: "Mantle Blockscout", url: "https://explorer.mantle.xyz/api", type: "blockscout" },
    ],
  },
  324: {
    explorerUrl: "https://explorer.zksync.io",
    blockExplorer: "https://explorer.zksync.io",
    apiUrl: "https://block-explorer-api.mainnet.zksync.io/api",
    explorers: [
      { name: "zkSync Explorer", url: "https://block-explorer-api.mainnet.zksync.io/api", type: "blockscout" },
    ],
  },
  81457: {
    explorerUrl: "https://blastscan.io",
    blockExplorer: "https://blastscan.io",
    apiUrl: "https://api.blastscan.io/api",
    explorers: [
      { name: "Blastscan", url: "https://api.blastscan.io/api", type: "etherscan" },
    ],
  },
  42220: {
    explorerUrl: "https://celoscan.io",
    blockExplorer: "https://celoscan.io",
    apiUrl: "https://api.celoscan.io/api",
    explorers: [
      { name: "Celoscan", url: "https://api.celoscan.io/api", type: "etherscan" },
    ],
  },
  80094: {
    explorerUrl: "https://berascan.com",
    blockExplorer: "https://berascan.com",
    apiUrl: "https://api.berascan.com/api",
    explorers: [
      { name: "Berascan", url: "https://api.berascan.com/api", type: "etherscan" },
    ],
  },
  146: {
    explorerUrl: "https://sonicscan.org",
    blockExplorer: "https://sonicscan.org",
    apiUrl: "https://api.sonicscan.org/api",
    explorers: [
      { name: "Sonicscan", url: "https://api.sonicscan.org/api", type: "etherscan" },
    ],
  },
  25: {
    explorerUrl: "https://cronoscan.com",
    blockExplorer: "https://cronoscan.com",
    apiUrl: "https://api.cronoscan.com/api",
    explorers: [
      { name: "Cronoscan", url: "https://api.cronoscan.com/api", type: "etherscan" },
    ],
  },
  252: {
    explorerUrl: "https://fraxscan.com",
    blockExplorer: "https://fraxscan.com",
    apiUrl: "https://api.fraxscan.com/api",
    explorers: [
      { name: "Fraxscan", url: "https://api.fraxscan.com/api", type: "etherscan" },
    ],
  },
  204: {
    explorerUrl: "https://opbnbscan.com",
    blockExplorer: "https://opbnbscan.com",
    apiUrl: "https://api-opbnb.bscscan.com/api",
    explorers: [
      { name: "opBNB BSCScan", url: "https://api-opbnb.bscscan.com/api", type: "etherscan" },
    ],
  },
  1284: {
    explorerUrl: "https://moonbeam.moonscan.io",
    blockExplorer: "https://moonbeam.moonscan.io",
    apiUrl: "https://api-moonbeam.moonscan.io/api",
    explorers: [
      { name: "Moonscan", url: "https://api-moonbeam.moonscan.io/api", type: "etherscan" },
    ],
  },
  167000: {
    explorerUrl: "https://taikoscan.io",
    blockExplorer: "https://taikoscan.io",
    apiUrl: "https://api.taikoscan.io/api",
    explorers: [
      { name: "Taikoscan", url: "https://api.taikoscan.io/api", type: "etherscan" },
    ],
  },
  34443: {
    explorerUrl: "https://explorer.mode.network",
    blockExplorer: "https://explorer.mode.network",
    apiUrl: "https://explorer.mode.network/api",
    explorers: [
      { name: "Mode Blockscout", url: "https://explorer.mode.network/api", type: "blockscout" },
    ],
  },
  130: {
    explorerUrl: "https://uniscan.xyz",
    blockExplorer: "https://uniscan.xyz",
    apiUrl: "https://unichain.blockscout.com/api",
    explorers: [
      { name: "Unichain Blockscout", url: "https://unichain.blockscout.com/api", type: "blockscout" },
    ],
  },
  1868: {
    explorerUrl: "https://soneium.blockscout.com",
    blockExplorer: "https://soneium.blockscout.com",
    apiUrl: "https://soneium.blockscout.com/api",
    explorers: [
      { name: "Soneium Blockscout", url: "https://soneium.blockscout.com/api", type: "blockscout" },
    ],
  },
  4326: {
    explorerUrl: "https://megaeth.blockscout.com",
    blockExplorer: "https://megaeth.blockscout.com",
    apiUrl: "https://megaeth.blockscout.com/api",
    explorers: [
      { name: "MegaETH Blockscout", url: "https://megaeth.blockscout.com/api", type: "blockscout" },
    ],
  },
  33139: {
    explorerUrl: "https://apescan.io",
    blockExplorer: "https://apescan.io",
    apiUrl: "https://api.apescan.io/api",
    explorers: [
      { name: "Apescan", url: "https://api.apescan.io/api", type: "etherscan" },
    ],
  },
  2741: {
    explorerUrl: "https://abscan.org",
    blockExplorer: "https://abscan.org",
    apiUrl: "https://api.abscan.org/api",
    explorers: [
      { name: "Abscan", url: "https://api.abscan.org/api", type: "etherscan" },
    ],
  },

  // ── Testnets ──
  11155111: {
    explorerUrl: "https://sepolia.etherscan.io",
    blockExplorer: "https://sepolia.etherscan.io",
    apiUrl: "https://api-sepolia.etherscan.io/api",
    explorers: [
      { name: "Etherscan", url: "https://api-sepolia.etherscan.io/api", type: "etherscan" },
      { name: "Blockscout", url: "https://eth-sepolia.blockscout.com/api", type: "blockscout" },
    ],
  },
  84532: {
    explorerUrl: "https://sepolia.basescan.org",
    blockExplorer: "https://sepolia.basescan.org",
    apiUrl: "https://api-sepolia.basescan.org/api",
    explorers: [
      { name: "Base Sepolia BaseScan", url: "https://api-sepolia.basescan.org/api", type: "etherscan" },
      { name: "Base Sepolia Blockscout", url: "https://base-sepolia.blockscout.com/api", type: "blockscout" },
    ],
  },
  17000: {
    explorerUrl: "https://holesky.etherscan.io",
    blockExplorer: "https://holesky.etherscan.io",
    apiUrl: "https://api-holesky.etherscan.io/api",
    explorers: [
      { name: "Holesky Etherscan", url: "https://api-holesky.etherscan.io/api", type: "etherscan" },
    ],
  },
  4202: {
    explorerUrl: "https://sepolia-blockscout.lisk.com",
    blockExplorer: "https://sepolia-blockscout.lisk.com",
    apiUrl: "https://sepolia-blockscout.lisk.com/api",
    explorers: [
      { name: "Blockscout", url: "https://sepolia-blockscout.lisk.com/api", type: "blockscout" },
    ],
  },
  80002: {
    explorerUrl: "https://amoy.polygonscan.com",
    blockExplorer: "https://amoy.polygonscan.com",
    apiUrl: "https://api-amoy.polygonscan.com/api",
    explorers: [
      { name: "PolygonScan Amoy", url: "https://api-amoy.polygonscan.com/api", type: "etherscan" },
    ],
  },
  421614: {
    explorerUrl: "https://sepolia.arbiscan.io",
    blockExplorer: "https://sepolia.arbiscan.io",
    apiUrl: "https://api-sepolia.arbiscan.io/api",
    explorers: [
      { name: "Arbiscan Sepolia", url: "https://api-sepolia.arbiscan.io/api", type: "etherscan" },
    ],
  },
  11155420: {
    explorerUrl: "https://sepolia-optimism.etherscan.io",
    blockExplorer: "https://sepolia-optimism.etherscan.io",
    apiUrl: "https://api-sepolia-optimism.etherscan.io/api",
    explorers: [
      { name: "Optimism Sepolia Etherscan", url: "https://api-sepolia-optimism.etherscan.io/api", type: "etherscan" },
    ],
  },
  97: {
    explorerUrl: "https://testnet.bscscan.com",
    blockExplorer: "https://testnet.bscscan.com",
    apiUrl: "https://api-testnet.bscscan.com/api",
    explorers: [
      { name: "BscScan Testnet", url: "https://api-testnet.bscscan.com/api", type: "etherscan" },
    ],
  },
};


// ── Public RPC URLs ──────────────────────────────────────────────────────────

const PUBLIC_RPCS: Record<number, string> = {
  // Existing curated RPCs
  1: "https://ethereum-rpc.publicnode.com",
  8453: "https://mainnet.base.org",
  137: "https://polygon.drpc.org",
  42161: "https://arbitrum.drpc.org",
  10: "https://mainnet.optimism.io",
  56: "https://bsc-mainnet.drpc.org",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  100: "https://rpc.gnosischain.com",
  1135: "https://rpc.api.lisk.com",

  // New LI.FI mainnets
  324: "https://mainnet.era.zksync.io",
  534352: "https://rpc.scroll.io",
  59144: "https://rpc.linea.build",
  5000: "https://rpc.mantle.xyz",
  81457: "https://rpc.blast.io",
  42220: "https://forno.celo.org",
  80094: "https://rpc.berachain.com",
  146: "https://rpc.soniclabs.com",
  25: "https://evm.cronos.org",
  252: "https://rpc.frax.com",
  204: "https://opbnb-mainnet-rpc.bnbchain.org",
  1284: "https://rpc.api.moonbeam.network",
  130: "https://mainnet.unichain.org",
  1329: "https://evm-rpc.sei-apis.com",
  167000: "https://rpc.mainnet.taiko.xyz",
  1868: "https://rpc.soneium.org",
  34443: "https://mainnet.mode.network",
  480: "https://worldchain-mainnet.g.alchemy.com/public",
  288: "https://mainnet.boba.network",
  1088: "https://andromeda.metis.io",
  122: "https://rpc.fuse.io",
  33139: "https://apechain.calderachain.xyz/http",
  1923: "https://swell-mainnet.alt.technology",
  2020: "https://api.roninchain.com/rpc",
  2741: "https://api.mainnet.abs.xyz",
  2818: "https://rpc-quicknode.morphl2.io",
  30: "https://public-node.rsk.co",
  13371: "https://rpc.immutable.com",
  14: "https://flare-api.flare.network/ext/C/rpc",
  232: "https://rpc.lens.xyz",
  50: "https://rpc.xdcscan.com",
  747: "https://mainnet.evm.nodes.onflow.org",
  88: "https://rpc.viction.xyz",
  8217: "https://public-en.node.kaia.io",
  40: "https://mainnet.telos.net/evm",
  60808: "https://rpc.gobob.xyz",
  57073: "https://rpc-gel.inkonchain.com",
  43111: "https://rpc.hemi.network/rpc",
  1625: "https://rpc.gravity.xyz",
  1480: "https://rpc.vana.org",
  21000000: "https://rpc.corn.fun",
  4326: "https://6342.rpc.thirdweb.com",
  50104: "https://rpc.sophon.xyz",
  9745: "https://rpc.plasma.build",
  988: "https://rpc.stable.xyz",
  98866: "https://rpc.plume.org",
  4217: "https://rpc.tempo.xyz",
  999: "https://rpc.hyperliquid.xyz/evm",
  1337: "https://rpc.hyperliquid.xyz",
  143: "https://rpc.monad.xyz",
  747474: "https://rpc.katana.farm",
  42793: "https://node.mainnet.etherlink.com",
  55244: "https://rpc.superposition.so",

  // Testnets
  11155111: "https://sepolia.drpc.org",
  84532: "https://sepolia.base.org",
  17000: "https://holesky.drpc.org",
  4202: "https://rpc.sepolia-api.lisk.com",
  80002: "https://polygon-amoy.gateway.tenderly.co",
  421614: "https://arbitrum-sepolia.drpc.org",
  11155420: "https://sepolia.optimism.io",
  97: "https://bsc-testnet.drpc.org",
};


// ── Chain definitions ────────────────────────────────────────────────────────

function makeChain(id: number, name: string, nativeCurrency: Chain["nativeCurrency"]): Chain {
  const rpcUrl = PUBLIC_RPCS[id] || "";
  const explorer = EXPLORER_APIS[id];
  return {
    id,
    name,
    rpcUrl,
    nativeCurrency,
    ...(explorer ?? {}),
  };
}

const eth18 = (name = "Ether", symbol = "ETH") => ({ name, symbol, decimals: 18 });

/**
 * CHAIN_REGISTRY — canonical list of all supported chains.
 * Ordered: mainnets first (sorted by chain ID), then testnets.
 */
export const CHAIN_REGISTRY: Chain[] = [
  // ── Mainnets ──
  makeChain(1, "Ethereum", eth18()),
  makeChain(10, "Optimism", eth18()),
  makeChain(14, "Flare", { name: "Flare", symbol: "FLR", decimals: 18 }),
  makeChain(25, "Cronos", { name: "CRO", symbol: "CRO", decimals: 18 }),
  makeChain(30, "Rootstock", { name: "Rootstock Smart Bitcoin", symbol: "RBTC", decimals: 18 }),
  makeChain(40, "Telos", { name: "TLOS", symbol: "TLOS", decimals: 18 }),
  makeChain(50, "XDC", { name: "XDC", symbol: "XDC", decimals: 18 }),
  makeChain(56, "BSC", { name: "BNB", symbol: "BNB", decimals: 18 }),
  makeChain(88, "Viction", { name: "Viction", symbol: "VIC", decimals: 18 }),
  makeChain(100, "Gnosis", { name: "xDai", symbol: "xDAI", decimals: 18 }),
  makeChain(122, "Fuse", { name: "FUSE", symbol: "FUSE", decimals: 18 }),
  makeChain(130, "Unichain", eth18()),
  makeChain(137, "Polygon", { name: "POL", symbol: "POL", decimals: 18 }),
  makeChain(143, "Monad", { name: "MON", symbol: "MON", decimals: 18 }),
  makeChain(146, "Sonic", { name: "S", symbol: "S", decimals: 18 }),
  makeChain(204, "opBNB", { name: "BNB", symbol: "BNB", decimals: 18 }),
  makeChain(232, "Lens", { name: "GHO", symbol: "GHO", decimals: 18 }),
  makeChain(252, "Fraxtal", { name: "FRAX", symbol: "FRAX", decimals: 18 }),
  makeChain(288, "Boba", eth18()),
  makeChain(324, "zkSync", eth18()),
  makeChain(480, "World Chain", eth18()),
  makeChain(534352, "Scroll", eth18()),
  makeChain(747, "Flow", { name: "FLOW", symbol: "FLOW", decimals: 18 }),
  makeChain(988, "Stable", { name: "USDT0", symbol: "USDT0", decimals: 18 }),
  makeChain(999, "HyperEVM", { name: "HYPE", symbol: "HYPE", decimals: 18 }),
  makeChain(1088, "Metis", { name: "METIS", symbol: "METIS", decimals: 18 }),
  makeChain(1135, "Lisk", eth18()),
  makeChain(1284, "Moonbeam", { name: "GLMR", symbol: "GLMR", decimals: 18 }),
  makeChain(1329, "Sei", { name: "SEI", symbol: "SEI", decimals: 18 }),
  makeChain(1337, "Hyperliquid", { name: "USDC", symbol: "USDC", decimals: 6 }),
  makeChain(1480, "Vana", { name: "VAN", symbol: "VAN", decimals: 18 }),
  makeChain(1625, "Gravity", { name: "G", symbol: "G", decimals: 18 }),
  makeChain(1868, "Soneium", eth18()),
  makeChain(1923, "Swellchain", eth18()),
  makeChain(2020, "Ronin", { name: "RON", symbol: "RON", decimals: 18 }),
  makeChain(2741, "Abstract", eth18()),
  makeChain(2818, "Morph", eth18()),
  makeChain(4217, "Tempo", { name: "PathUSD", symbol: "PathUSD", decimals: 6 }),
  makeChain(4326, "MegaETH", eth18()),
  makeChain(5000, "Mantle", { name: "MNT", symbol: "MNT", decimals: 18 }),
  makeChain(8217, "Kaia", { name: "KAIA", symbol: "KAIA", decimals: 18 }),
  makeChain(8453, "Base", eth18()),
  makeChain(9745, "Plasma", { name: "XPL", symbol: "XPL", decimals: 18 }),
  makeChain(13371, "Immutable zkEVM", { name: "IMX", symbol: "IMX", decimals: 18 }),
  makeChain(21000000, "Corn", { name: "BTCN", symbol: "BTCN", decimals: 18 }),
  makeChain(33139, "Apechain", { name: "APE", symbol: "APE", decimals: 18 }),
  makeChain(34443, "Mode", eth18()),
  makeChain(42161, "Arbitrum", eth18()),
  makeChain(42220, "Celo", { name: "CELO", symbol: "CELO", decimals: 18 }),
  makeChain(42793, "Etherlink", { name: "XTZ", symbol: "XTZ", decimals: 18 }),
  makeChain(43111, "Hemi", eth18()),
  makeChain(43114, "Avalanche", { name: "AVAX", symbol: "AVAX", decimals: 18 }),
  makeChain(50104, "Sophon", { name: "SOPH", symbol: "SOPH", decimals: 18 }),
  makeChain(55244, "Superposition", eth18()),
  makeChain(57073, "Ink", eth18()),
  makeChain(59144, "Linea", eth18()),
  makeChain(60808, "BOB", eth18()),
  makeChain(80094, "Berachain", { name: "BERA", symbol: "BERA", decimals: 18 }),
  makeChain(81457, "Blast", eth18()),
  makeChain(98866, "Plume", { name: "PLUME", symbol: "PLUME", decimals: 18 }),
  makeChain(167000, "Taiko", eth18()),
  makeChain(747474, "Katana", eth18()),

  // ── Testnets ──
  makeChain(11155111, "Ethereum Sepolia", { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }),
  makeChain(84532, "Base Sepolia", eth18()),
  makeChain(17000, "Holesky", eth18()),
  makeChain(4202, "Lisk Sepolia", { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }),
  makeChain(80002, "Polygon Amoy", { name: "MATIC", symbol: "MATIC", decimals: 18 }),
  makeChain(421614, "Arbitrum Sepolia", eth18()),
  makeChain(11155420, "Optimism Sepolia", eth18()),
  makeChain(97, "BNB Testnet", { name: "BNB", symbol: "tBNB", decimals: 18 }),
];

// ── Lookup helpers ───────────────────────────────────────────────────────────

const CHAIN_BY_ID = new Map(CHAIN_REGISTRY.map((c) => [c.id, c]));

export const getChainById = (id: number): Chain | undefined => CHAIN_BY_ID.get(id);

/** IDs of testnet chains */
const TESTNET_IDS = new Set([11155111, 84532, 17000, 4202, 80002, 421614, 11155420, 97]);

export const isTestnet = (chainId: number): boolean => TESTNET_IDS.has(chainId);

export const getMainnetChains = (): Chain[] => CHAIN_REGISTRY.filter((c) => !isTestnet(c.id));
export const getTestnetChains = (): Chain[] => CHAIN_REGISTRY.filter((c) => isTestnet(c.id));

/** Chains that have at least one explorer API configured */
export const getExplorerChains = (): Chain[] => CHAIN_REGISTRY.filter((c) => c.explorers && c.explorers.length > 0);

// ── Compatibility alias ──────────────────────────────────────────────────────

/** @deprecated Use CHAIN_REGISTRY directly or use selector helpers */
export const SUPPORTED_CHAINS = CHAIN_REGISTRY;

// ── Explorer URL helpers ─────────────────────────────────────────────────────

export const getExplorerBaseUrlFromApiUrl = (url?: string | null): string => {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname.startsWith("api.")) {
      parsed.hostname = parsed.hostname.slice(4);
    } else if (parsed.hostname.startsWith("api-")) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    parsed.pathname = parsed.pathname.replace(/\/api\/?$/, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.replace(/\/api\/?$/, "").replace(/\/$/, "");
  }
};

export const getExplorerUrl = (chainId: number, type: "tx" | "address" | "block", hash: string): string => {
  const chain = getChainById(chainId);
  if (!chain?.explorerUrl) return "";
  const baseUrl = chain.explorerUrl;
  switch (type) {
    case "tx":
      return `${baseUrl}/tx/${hash}`;
    case "address":
      return `${baseUrl}/address/${hash}`;
    case "block":
      return `${baseUrl}/block/${hash}`;
    default:
      return "";
  }
};

/** Expose public RPC map for providers module */
export const PUBLIC_RPC_MAP = PUBLIC_RPCS;
