import { ethers } from "ethers";

const address = process.argv[2] || "0xa99c4b08201f2913db8d28e71d020c4298f29dbf";
const chainArg = (process.argv[3] || "base").toLowerCase();
const apiKey = process.env.API_KEY || process.env.VITE_API_KEY || "";

const ethRpc = apiKey
  ? `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`
  : "https://eth.llamarpc.com";
const baseRpc = apiKey
  ? `https://base-mainnet.g.alchemy.com/v2/${apiKey}`
  : "https://mainnet.base.org";

const interfaceIds = {
  ERC165: "0x01ffc9a7",
  ERC20: "0x36372b07",
  ERC721: "0x80ac58cd",
  ERC1155: "0xd9b67a26",
};

const universalABI = [
  {
    inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "facetAddresses",
    outputs: [
      { internalType: "address[]", name: "_facetAddresses", type: "address[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

async function detect(provider, addr) {
  const contract = new ethers.Contract(addr, universalABI, provider);

  let type = "unknown";
  let method = "none";
  let isDiamond = false;

  try {
    const facets = await contract.facetAddresses();
    if (Array.isArray(facets) && facets.length >= 1) isDiamond = true;
  } catch {}

  let supports = true;
  try {
    await contract.supportsInterface(interfaceIds.ERC165);
  } catch {
    supports = false;
  }

  if (supports) {
    try {
      if (await contract.supportsInterface(interfaceIds.ERC1155)) {
        type = "ERC1155";
        method = "erc165-erc1155";
      } else if (await contract.supportsInterface(interfaceIds.ERC721)) {
        type = "ERC721";
        method = "erc165-erc721";
      } else if (await contract.supportsInterface(interfaceIds.ERC20)) {
        type = "ERC20";
        method = "erc165-erc20";
      }
    } catch {}
  }

  const out = {
    address: addr,
    rpc: provider.connection?.url,
    isDiamond,
    type,
    method,
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function main() {
  const isEth = ["eth", "ethereum", "mainnet", "1"].includes(chainArg);
  const rpc = isEth ? ethRpc : baseRpc;
  const network = isEth
    ? { name: "homestead", chainId: 1 }
    : { name: "base", chainId: 8453 };
  const provider = new ethers.providers.JsonRpcProvider(rpc, network);
  await detect(provider, address);
}

main().catch((e) => {
  console.error("Detector failed:", e?.message || e);
  process.exit(1);
});
