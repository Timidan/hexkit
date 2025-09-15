import { ethers } from "ethers";

export type DetectedTokenType = "ERC20" | "ERC721" | "ERC1155" | "unknown";

export interface TokenDetectionResult {
  type: DetectedTokenType;
  isDiamond: boolean;
  method: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

const interfaceIds = {
  ERC165: "0x01ffc9a7",
  ERC20: "0x36372b07",
  ERC721: "0x80ac58cd",
  ERC1155: "0xd9b67a26",
};

const universalABI = [
  // ERC165
  {
    inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // Token metadata
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
  // Diamond loupe
  {
    inputs: [],
    name: "facetAddresses",
    outputs: [
      { internalType: "address[]", name: "_facetAddresses", type: "address[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_facet", type: "address" }],
    name: "facetFunctionSelectors",
    outputs: [
      {
        internalType: "bytes4[]",
        name: "_functionSelectors",
        type: "bytes4[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "facets",
    outputs: [
      {
        components: [
          { internalType: "address", name: "facetAddress", type: "address" },
          {
            internalType: "bytes4[]",
            name: "functionSelectors",
            type: "bytes4[]",
          },
        ],
        internalType: "struct IDiamondLoupe.Facet[]",
        name: "_facets",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function detectTokenType(
  provider: ethers.providers.Provider,
  address: string
): Promise<TokenDetectionResult> {
  const contract = new ethers.Contract(address, universalABI, provider);

  let type: DetectedTokenType = "unknown";
  let method = "none";
  let isDiamond = false;
  let name: string | undefined;
  let symbol: string | undefined;
  let decimals: number | undefined;

  // Diamond detection (separate from token detection)
  try {
    const facetAddresses: string[] = await contract.facetAddresses();
    if (Array.isArray(facetAddresses) && facetAddresses.length >= 1) {
      isDiamond = true;
    }
  } catch {
    /* noop */
  }

  // Token detection via ERC165 only
  let supportsInterfaceAvailable = true;
  try {
    await contract.supportsInterface(interfaceIds.ERC165);
  } catch {
    supportsInterfaceAvailable = false;
  }

  if (supportsInterfaceAvailable) {
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
    } catch {
      /* ignore */
    }
  }

  // Token metadata queries only when a type is known
  if (type === "ERC20" || type === "ERC721" || type === "ERC1155") {
    try {
      name = await contract.name();
    } catch {
      /* noop */
    }
    try {
      symbol = await contract.symbol();
    } catch {
      /* noop */
    }
    if (type === "ERC20") {
      try {
        decimals = Number(await contract.decimals());
      } catch {
        /* noop */
      }
    }
  }

  return { type, isDiamond, method, name, symbol, decimals };
}
