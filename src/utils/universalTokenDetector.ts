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

  // Step 2: ERC165 detection (highest confidence) - FAST PATH
  const erc165Result = await detectViaERC165(provider, address);
  if (erc165Result.type !== "unknown") {
    // ERC165 is highly reliable - return immediately with metadata if available quickly
    const result: TokenDetectionResult = {
      type: erc165Result.type,
      isDiamond,
      method: erc165Result.method,
      confidence: erc165Result.confidence,
    };

    // Fetch metadata with a short timeout — don't block detection on metadata
    try {
      const metadata = await Promise.race([
        fetchTokenMetadataFast(provider, address, erc165Result.type),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (metadata) {
        if (metadata.name) result.name = metadata.name;
        if (metadata.symbol) result.symbol = metadata.symbol;
        if (metadata.decimals !== undefined) result.decimals = metadata.decimals;
      }
    } catch {
      /* ignore metadata errors */
    }

    return result;
  }

  // Step 3: For Diamonds, check facet selectors next (before metadata probing)
  // This is faster than metadata probing for diamond contracts
  if (isDiamond) {
    const diamondResult = await detectViaDiamondSelectors(provider, address);
    if (diamondResult.type !== "unknown") {
      const metadata = await fetchTokenMetadata(provider, address, diamondResult.type);
      const result: TokenDetectionResult = {
        type: diamondResult.type,
        isDiamond,
        method: diamondResult.method,
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        confidence: diamondResult.confidence,
      };
      return result;
    }
  }

  // Step 4: Metadata probing (medium confidence) - This catches USDT and similar tokens
  const metadataResult = await detectViaMetadataProbing(provider, address);
  if (metadataResult.type !== "unknown") {
    // Metadata probing already tried to get name/symbol, fetch again for consistency
    const metadata = await fetchTokenMetadata(provider, address, metadataResult.type);
    const result: TokenDetectionResult = {
      type: metadataResult.type,
      isDiamond,
      method: metadataResult.method,
      name: metadata.name,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      confidence: metadataResult.confidence,
    };
    return result;
  }

  // Step 5: Function signature analysis (lower confidence) - Last resort
  let signatureResult = await detectViaFunctionSignatures(provider, address);
  if (signatureResult.type !== "unknown") {
    // Prefer ERC20 over ERC1155 if both heuristics could match
    if (signatureResult.type === "ERC1155") {
      const md = await fetchTokenMetadata(provider, address, "ERC20");
      if (md.name || md.symbol || md.decimals !== undefined) {
        signatureResult = {
          type: "ERC20",
          method: "metadata-erc20-override",
          confidence: 65,
        };
      }
    }
    const metadata = await fetchTokenMetadata(provider, address, signatureResult.type);
    const result: TokenDetectionResult = {
      type: signatureResult.type,
      isDiamond,
      method: signatureResult.method,
      name: metadata.name,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      confidence: signatureResult.confidence,
    };
    return result;
  }

  // No token type detected
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
    // Standard ABI for ERC20 metadata
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

    // Some older contracts (like USDT) use uint256 for decimals instead of uint8
    const altDecimalsABI = [
      {
        inputs: [],
        name: "decimals",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ];

    const contract = new ethers.Contract(address, metadataABI, provider);

    // Try to get name and symbol
    const name = await contract.name().catch(() => null);
    const symbol = await contract.symbol().catch(() => null);

    // Try standard decimals first, then alternate ABI for older contracts like USDT
    let decimals = await contract.decimals().catch(() => null);
    if (decimals === null) {
      // Try with uint256 return type (USDT compatibility)
      const altContract = new ethers.Contract(address, altDecimalsABI, provider);
      decimals = await altContract.decimals().catch(() => null);
    }

    const totalSupply = await contract.totalSupply().catch(() => null);

    // If we have name and symbol, it's likely a token
    if (name && symbol) {
      // If it has decimals OR totalSupply, it's almost certainly ERC20
      // ERC721 tokens don't have decimals() or totalSupply() that returns a fungible balance
      if (decimals !== null || totalSupply !== null) {
        return { type: "ERC20", method: "metadata-erc20", confidence: 70 };
      }

      // No decimals or totalSupply - check for ownerOf to confirm ERC721 before defaulting
      // This prevents misclassifying ERC20 tokens as ERC721
      try {
        const erc721CheckABI = [
          {
            inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
            name: "ownerOf",
            outputs: [{ internalType: "address", name: "", type: "address" }],
            stateMutability: "view",
            type: "function",
          },
        ];
        const erc721Contract = new ethers.Contract(address, erc721CheckABI, provider);
        // Try calling ownerOf with tokenId 1 - will throw if not ERC721
        await erc721Contract.ownerOf(1);
        return { type: "ERC721", method: "metadata-erc721-confirmed", confidence: 70 };
      } catch {
        // ownerOf failed - likely not ERC721, but we have name/symbol
        // Default to ERC20 as it's more common for tokens with name/symbol but no decimals
        return { type: "ERC20", method: "metadata-erc20-fallback", confidence: 50 };
      }
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
 * Method 4: Diamond facet selector analysis
 * Scans all facet selectors to infer token type
 */
async function detectViaDiamondSelectors(
  provider: ethers.providers.Provider,
  address: string
): Promise<{
  type: DetectedTokenType;
  method: string;
  confidence: number;
}> {
  try {
    // Diamond Loupe ABI for getting facet selectors
    const loupeABI = [
      {
        inputs: [],
        name: "facetAddresses",
        outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [{ internalType: "address", name: "_facet", type: "address" }],
        name: "facetFunctionSelectors",
        outputs: [{ internalType: "bytes4[]", name: "", type: "bytes4[]" }],
        stateMutability: "view",
        type: "function",
      },
    ];

    const contract = new ethers.Contract(address, loupeABI, provider);
    const facetAddresses: string[] = await contract.facetAddresses();

    // Collect all selectors from all facets
    const allSelectors: string[] = [];
    for (const facetAddr of facetAddresses) {
      try {
        const selectors = await contract.facetFunctionSelectors(facetAddr);
        if (Array.isArray(selectors)) {
          allSelectors.push(...selectors.map((s: string) => s.toLowerCase()));
        }
      } catch {
        // Skip this facet
      }
    }

    const selectorSet = new Set(allSelectors);
    const has = (sig: string) => selectorSet.has(sig.toLowerCase());

    // Common function selectors
    // ERC20 selectors
    const hasERC20 =
      has("0x70a08231") || // balanceOf(address)
      has("0xa9059cbb") || // transfer(address,uint256)
      has("0xdd62ed3e"); // allowance(address,address)

    // ERC721 selectors - require BOTH ownerOf and transferFrom
    const hasERC721 =
      has("0x6352211e") && // ownerOf(uint256)
      has("0x23b872dd"); // transferFrom(address,address,uint256)

    // ERC1155 selectors
    const hasERC1155 =
      has("0xf242432a") || // safeTransferFrom(address,address,uint256,uint256,bytes)
      has("0x2eb2c2d6") || // safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)
      has("0xe985e9c5"); // isApprovedForAll(address,address)

    // Detection priority: ERC721 > ERC1155 > ERC20
    // ERC721 is more specific (requires both ownerOf AND transferFrom)
    if (hasERC721) {
      return { type: "ERC721", method: "diamond-selectors-erc721", confidence: 90 };
    }
    if (hasERC1155) {
      return { type: "ERC1155", method: "diamond-selectors-erc1155", confidence: 90 };
    }
    if (hasERC20) {
      return { type: "ERC20", method: "diamond-selectors-erc20", confidence: 80 };
    }

    return { type: "unknown", method: "diamond-selectors-no-match", confidence: 0 };
  } catch {
    return { type: "unknown", method: "diamond-selectors-error", confidence: 0 };
  }
}

/**
 * Fetch token metadata based on detected type
 */
/**
 * Fast parallel metadata fetcher - all calls run simultaneously with 3s timeout
 */
async function fetchTokenMetadataFast(
  provider: ethers.providers.Provider,
  address: string,
  type: DetectedTokenType
): Promise<{
  name?: string;
  symbol?: string;
  decimals?: number;
}> {
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

  const timeout = <T>(ms: number): Promise<T | undefined> =>
    new Promise((resolve) => setTimeout(() => resolve(undefined), ms));

  // Run all calls in parallel with 3s timeout each
  const [nameResult, symbolResult, decimalsResult] = await Promise.allSettled([
    Promise.race([contract.name(), timeout<string>(3000)]),
    Promise.race([contract.symbol(), timeout<string>(3000)]),
    type === "ERC20"
      ? Promise.race([contract.decimals(), timeout<number>(3000)])
      : Promise.resolve(undefined),
  ]);

  return {
    name: nameResult.status === "fulfilled" ? nameResult.value : undefined,
    symbol: symbolResult.status === "fulfilled" ? symbolResult.value : undefined,
    decimals: decimalsResult.status === "fulfilled" && decimalsResult.value !== undefined
      ? Number(decimalsResult.value)
      : undefined,
  };
}

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
