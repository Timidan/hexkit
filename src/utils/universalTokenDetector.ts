import { ethers } from "ethers";

export type DetectedTokenType = "ERC20" | "ERC721" | "ERC1155" | "unknown";

export interface TokenDetectionResult {
  type: DetectedTokenType;
  isDiamond: boolean;
  method: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  confidence: number; // 0-100 confidence score
}

const interfaceIds = {
  ERC165: "0x01ffc9a7",
  ERC20: "0x36372b07",
  ERC721: "0x80ac58cd",
  ERC1155: "0xd9b67a26",
};

/**
 * Enhanced token detection with multiple fallback strategies
 * This replaces the original universalTokenDetector.ts with better fallback methods
 */
export async function detectTokenType(
  provider: ethers.providers.Provider,
  address: string
): Promise<TokenDetectionResult> {
  let type: DetectedTokenType = "unknown";
  let method = "none";
  let isDiamond = false;
  let name: string | undefined;
  let symbol: string | undefined;
  let decimals: number | undefined;
  let confidence = 0;

  // Step 1: Diamond detection (separate from token detection)
  try {
    const diamondABI = [
      {
        inputs: [],
        name: "facetAddresses",
        outputs: [
          {
            internalType: "address[]",
            name: "_facetAddresses",
            type: "address[]",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
    ];
    const diamondContract = new ethers.Contract(address, diamondABI, provider);
    const facetAddresses: string[] = await diamondContract.facetAddresses();
    if (Array.isArray(facetAddresses) && facetAddresses.length >= 1) {
      isDiamond = true;
    }
  } catch {
    /* noop */
  }

  // Fallback: try facets() if facetAddresses() failed to indicate diamond
  if (!isDiamond) {
    try {
      const loupeFacetsABI = [
        {
          inputs: [],
          name: "facets",
          outputs: [
            {
              components: [
                {
                  internalType: "address",
                  name: "facetAddress",
                  type: "address",
                },
                {
                  internalType: "bytes4[]",
                  name: "functionSelectors",
                  type: "bytes4[]",
                },
              ],
              internalType: "struct Facet[]",
              name: "facets_",
              type: "tuple[]",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
      ];
      const diamondContract2 = new ethers.Contract(
        address,
        loupeFacetsABI,
        provider
      );
      const facetsArr: Array<{
        facetAddress: string;
        functionSelectors: string[];
      }> = await diamondContract2.facets();
      if (Array.isArray(facetsArr) && facetsArr.length > 0) {
        const anyValid = facetsArr.some(
          (f) =>
            typeof f?.facetAddress === "string" &&
            f.facetAddress !== "0x0000000000000000000000000000000000000000"
        );
        if (anyValid) {
          isDiamond = true;
        }
      }
    } catch {
      /* noop */
    }
  }

  // Step 2: ERC165 detection (highest confidence)
  const erc165Result = await detectViaERC165(provider, address);
  if (erc165Result.type !== "unknown") {
    type = erc165Result.type;
    method = erc165Result.method;
    confidence = erc165Result.confidence;
  }

  // Step 3: Metadata probing (medium confidence) - This catches USDT and similar tokens
  if (type === "unknown") {
    const metadataResult = await detectViaMetadataProbing(provider, address);
    if (metadataResult.type !== "unknown") {
      type = metadataResult.type;
      method = metadataResult.method;
      confidence = metadataResult.confidence;
    }
  }

  // Step 4: Function signature analysis (lower confidence)
  if (type === "unknown") {
    let signatureResult = await detectViaFunctionSignatures(provider, address);
    if (signatureResult.type !== "unknown") {
      // Prefer ERC20 over ERC1155 if both heuristics could match
      if (signatureResult.type === "ERC1155") {
        // Double-check: if ERC20 metadata exists, prefer ERC20
        const md = await fetchTokenMetadata(provider, address, "ERC20");
        if (md.name || md.symbol || md.decimals !== undefined) {
          signatureResult = {
            type: "ERC20",
            method: "metadata-erc20-override",
            confidence: 65,
          };
        }
      }
      type = signatureResult.type;
      method = signatureResult.method;
      confidence = signatureResult.confidence;
    }
  }

  // Fetch metadata only if we detected a token type
  if (type !== "unknown") {
    const metadata = await fetchTokenMetadata(provider, address, type);
    name = metadata.name;
    symbol = metadata.symbol;
    decimals = metadata.decimals;
  }

  return { type, isDiamond, method, name, symbol, decimals, confidence };
}

/**
 * Method 1: ERC165 interface detection (highest confidence)
 */
async function detectViaERC165(
  provider: ethers.providers.Provider,
  address: string
): Promise<{
  type: DetectedTokenType;
  method: string;
  confidence: number;
}> {
  try {
    const erc165ABI = [
      {
        inputs: [
          { internalType: "bytes4", name: "interfaceId", type: "bytes4" },
        ],
        name: "supportsInterface",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
      },
    ];
    const contract = new ethers.Contract(address, erc165ABI, provider);

    // Check if contract supports ERC165
    const supportsERC165 = await contract.supportsInterface(
      interfaceIds.ERC165
    );
    if (!supportsERC165) {
      return { type: "unknown", method: "erc165-not-supported", confidence: 0 };
    }

    // Check token interfaces in order of specificity
    if (await contract.supportsInterface(interfaceIds.ERC1155)) {
      return { type: "ERC1155", method: "erc165-erc1155", confidence: 95 };
    }
    if (await contract.supportsInterface(interfaceIds.ERC721)) {
      return { type: "ERC721", method: "erc165-erc721", confidence: 95 };
    }
    if (await contract.supportsInterface(interfaceIds.ERC20)) {
      return { type: "ERC20", method: "erc165-erc20", confidence: 95 };
    }

    return {
      type: "unknown",
      method: "erc165-no-token-interface",
      confidence: 0,
    };
  } catch {
    return { type: "unknown", method: "erc165-error", confidence: 0 };
  }
}

/**
 * Method 2: Metadata probing (medium confidence) - This is the key method for USDT-like tokens
 */
async function detectViaMetadataProbing(
  provider: ethers.providers.Provider,
  address: string
): Promise<{
  type: DetectedTokenType;
  method: string;
  confidence: number;
}> {
  try {
    const metadataABI = [
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
        name: "totalSupply",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ];
    const contract = new ethers.Contract(address, metadataABI, provider);

    // Try to get name and symbol
    const name = await contract.name().catch(() => null);
    const symbol = await contract.symbol().catch(() => null);
    const decimals = await contract.decimals().catch(() => null);
    const totalSupply = await contract.totalSupply().catch(() => null);

    // If we have name and symbol, it's likely a token
    if (name && symbol) {
      // If it has decimals and totalSupply, it's likely ERC20
      if (decimals !== null && totalSupply !== null) {
        return { type: "ERC20", method: "metadata-erc20", confidence: 70 };
      }
      // If it has name/symbol but no decimals, it could be ERC721
      return { type: "ERC721", method: "metadata-erc721", confidence: 60 };
    }

    return { type: "unknown", method: "metadata-no-match", confidence: 0 };
  } catch {
    return { type: "unknown", method: "metadata-error", confidence: 0 };
  }
}

/**
 * Method 3: Function signature analysis (lower confidence)
 */
async function detectViaFunctionSignatures(
  provider: ethers.providers.Provider,
  address: string
): Promise<{
  type: DetectedTokenType;
  method: string;
  confidence: number;
}> {
  const testAddress = "0x0000000000000000000000000000000000000001"; // Non-zero address for testing

  try {
    // Make ERC1155 detection stricter: require both balanceOfBatch and safeBatchTransferFrom to succeed
    try {
      const erc1155ABI = [
        {
          inputs: [
            { internalType: "address[]", name: "accounts", type: "address[]" },
            { internalType: "uint256[]", name: "ids", type: "uint256[]" },
          ],
          name: "balanceOfBatch",
          outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
          stateMutability: "view",
          type: "function",
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256[]", name: "ids", type: "uint256[]" },
            { internalType: "uint256[]", name: "values", type: "uint256[]" },
            { internalType: "bytes", name: "data", type: "bytes" },
          ],
          name: "safeBatchTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ];
      const contract1155 = new ethers.Contract(address, erc1155ABI, provider);
      await contract1155.balanceOfBatch([testAddress], [1]);
      await contract1155.safeBatchTransferFrom(
        testAddress,
        testAddress,
        [1],
        [1],
        "0x"
      );
      return {
        type: "ERC1155",
        method: "signature-erc1155-strict",
        confidence: 85,
      };
    } catch {
      // Continue to other checks
    }

    // ERC721 detection - check for ownerOf
    try {
      const erc721ABI = [
        {
          inputs: [
            { internalType: "uint256", name: "tokenId", type: "uint256" },
          ],
          name: "ownerOf",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function",
        },
      ];
      const contract721 = new ethers.Contract(address, erc721ABI, provider);
      await contract721.ownerOf(1);
      return { type: "ERC721", method: "signature-ownerOf", confidence: 80 };
    } catch {
      // Continue to other checks
    }

    // ERC20 detection - check for transfer function
    try {
      const erc20ABI = [
        {
          inputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "amount", type: "uint256" },
          ],
          name: "transfer",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ];
      const contract20 = new ethers.Contract(address, erc20ABI, provider);
      await contract20.transfer(testAddress, 1);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("ERC20") || errorMessage.includes("transfer")) {
        return { type: "ERC20", method: "signature-transfer", confidence: 75 };
      }
    }

    return { type: "unknown", method: "signature-no-match", confidence: 0 };
  } catch {
    return { type: "unknown", method: "signature-error", confidence: 0 };
  }
}

/**
 * Fetch token metadata based on detected type
 */
async function fetchTokenMetadata(
  provider: ethers.providers.Provider,
  address: string,
  type: DetectedTokenType
): Promise<{
  name?: string;
  symbol?: string;
  decimals?: number;
}> {
  const result: { name?: string; symbol?: string; decimals?: number } = {};

  try {
    const metadataABI = [
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
    ];
    const contract = new ethers.Contract(address, metadataABI, provider);

    try {
      result.name = await contract.name();
    } catch {
      /* noop */
    }

    try {
      result.symbol = await contract.symbol();
    } catch {
      /* noop */
    }

    if (type === "ERC20") {
      try {
        result.decimals = Number(await contract.decimals());
      } catch {
        /* noop */
      }
    }

    return result;
  } catch {
    return result;
  }
}
