import { ethers } from "ethers";
import type { UniversalDetectionResult } from "./types";

/** Universal ABI for comprehensive token type detection */
export const universalABI = [
  // ERC165 supportsInterface
  {
    inputs: [
      { internalType: "bytes4", name: "interfaceId", type: "bytes4" },
    ],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // Token metadata functions
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
  // Diamond standard functions
  {
    inputs: [
      { internalType: "address", name: "_facet", type: "address" },
    ],
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
        internalType: "struct IDiamondLoupe.Facet[]",
        name: "_facets",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
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

/** Interface IDs for all token standards (used by universal detection) */
export const interfaceIds = {
  ERC165: "0x01ffc9a7",
  ERC20: "0x36372b07",
  ERC721: "0x80ac58cd",
  ERC721Metadata: "0x5b5e139f",
  ERC721Enumerable: "0x780e9d63",
  ERC1155: "0xd9b67a26",
  ERC1155MetadataURI: "0x0e89341c",
  ERC777: "0x7f294c2d",
  ERC4626: "0x6a5275b1",
  ERC2981: "0x2a55205a",
};

/**
 * Comprehensive token type detection using universal ABI.
 * Includes: ERC165 probing, fallback ERC20 detection, metadata fetch,
 * diamond proxy probing, EIP-1967 proxy probing.
 */
export async function detectTokenTypeUniversal(
  contractAddress: string,
  provider: ethers.providers.Provider
): Promise<UniversalDetectionResult> {
  const universalContract = new ethers.Contract(
    contractAddress,
    universalABI,
    provider
  );

  let detectedType = "unknown";
  let confidence = 0;
  let detectionMethod = "none";
  let isDiamond = false;
  let tokenInfo: any = {};
  let error: string | undefined;

  try {
    // Step 1: Check if contract supports ERC165
    let supportsERC165 = false;
    try {
      supportsERC165 = await universalContract.supportsInterface(
        interfaceIds.ERC165
      );
    } catch {
      // ERC165 call failed, try fallback detection
    }

    if (!supportsERC165) {
      // Fallback ERC20 detection for older tokens like USDT
      try {
        const [name, symbol, decimals] = await Promise.all([
          universalContract.name().catch(() => undefined),
          universalContract.symbol().catch(() => undefined),
          universalContract.decimals().catch(() => undefined),
        ]);

        if (name && symbol && decimals !== undefined) {
          return {
            type: "ERC20",
            confidence: 0.8,
            detectionMethod: "fallback-erc20",
            isDiamond: false,
            tokenInfo: { name, symbol, decimals: Number(decimals) },
          };
        }
      } catch {
        // Fallback detection failed
      }

      return {
        type: "unknown",
        confidence: 0.1,
        detectionMethod: "no-erc165",
        isDiamond: false,
        error:
          "Contract does not support ERC165 and fallback detection failed",
      };
    }

    confidence = 0.5;
    detectionMethod = "erc165-supported";

    // Step 2: Test all token interfaces in priority order
    const interfaceTests = [
      { name: "ERC1155", id: interfaceIds.ERC1155, type: "ERC1155" },
      { name: "ERC721", id: interfaceIds.ERC721, type: "ERC721" },
      { name: "ERC20", id: interfaceIds.ERC20, type: "ERC20" },
      { name: "ERC777", id: interfaceIds.ERC777, type: "ERC777" },
      { name: "ERC4626", id: interfaceIds.ERC4626, type: "ERC4626" },
      { name: "ERC2981", id: interfaceIds.ERC2981, type: "ERC2981" },
    ];

    for (const interfaceTest of interfaceTests) {
      try {
        const isSupported = await universalContract.supportsInterface(
          interfaceTest.id
        );

        if (isSupported) {
          detectedType = interfaceTest.type;
          confidence = 0.95;
          detectionMethod = `erc165-${interfaceTest.name.toLowerCase()}`;
          break;
        }
      } catch {
        // Interface test failed, continue to next
      }
    }

    // Step 3: Fetch token metadata if token type detected
    if (detectedType !== "unknown") {
      try {
        const [name, symbol] = await Promise.all([
          universalContract.name().catch(() => undefined),
          universalContract.symbol().catch(() => undefined),
        ]);

        if (name) tokenInfo.name = name;
        if (symbol) tokenInfo.symbol = symbol;

        if (detectedType === "ERC20" || detectedType === "ERC777") {
          try {
            const decimals = await universalContract.decimals();
            tokenInfo.decimals = Number(decimals);
          } catch {
            tokenInfo.decimals = 18;
          }
        } else {
          tokenInfo.decimals = 0;
        }
      } catch {
        // Failed to fetch token metadata
      }
    }

    // Step 4: Check for Diamond standard
    try {
      const functionSelectors =
        await universalContract.facetFunctionSelectors(
          "0x0000000000000000000000000000000000000000"
        );
      if (
        Array.isArray(functionSelectors) &&
        functionSelectors.length > 0
      ) {
        isDiamond = true;
      } else {
        try {
          const facets = await universalContract.facets();
          if (Array.isArray(facets) && facets.length > 0) {
            isDiamond = true;
          }
        } catch (facetsError) {
          try {
            const facetAddresses =
              await universalContract.facetAddresses();
            if (
              Array.isArray(facetAddresses) &&
              facetAddresses.length > 0
            ) {
              isDiamond = true;
            }
          } catch {
            // Not a Diamond proxy
          }
        }
      }
    } catch {
      // Not a Diamond proxy
    }

    // Extra fallback for Diamonds: infer token type from facet selectors
    if (isDiamond && detectedType === "unknown") {
      try {
        const facetAddresses = await universalContract.facetAddresses();
        const allSelectors: string[] = [];
        for (const facetAddr of facetAddresses) {
          try {
            const sel =
              await universalContract.facetFunctionSelectors(facetAddr);
            if (Array.isArray(sel))
              allSelectors.push(
                ...sel.map((s: string) => s.toLowerCase())
              );
          } catch {}
        }

        const selectorSet = new Set(allSelectors);

        const has = (sig: string) => selectorSet.has(sig.toLowerCase());
        const ERC20 =
          has("0x70a08231") ||
          has("0xa9059cbb") ||
          has("0xdd62ed3e");

        const ERC721Core =
          has("0x6352211e") &&
          has("0x23b872dd");

        const ERC1155Core =
          has("0xf242432a") ||
          has("0x2eb2c2d6") ||
          has("0xe985e9c5");

        if (ERC721Core) {
          detectedType = "ERC721";
          confidence = Math.max(confidence, 0.9);
          detectionMethod = "diamond-selectors-erc721";
        } else if (ERC1155Core) {
          detectedType = "ERC1155";
          confidence = Math.max(confidence, 0.9);
          detectionMethod = "diamond-selectors-erc1155";
        } else if (ERC20) {
          detectedType = "ERC20";
          confidence = Math.max(confidence, 0.8);
          detectionMethod = "diamond-selectors-erc20";
        }
      } catch {
        // Diamond selector scan failed
      }
    }

    // Extra probe for EIP-1967 proxies
    if (detectedType === "unknown") {
      try {
        const implSlot =
          "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
        const raw = await provider.getStorageAt(
          contractAddress,
          implSlot
        );
        if (raw && raw !== "0x" && raw !== "0x00") {
          const addr = "0x" + raw.slice(26);
          if (ethers.utils.isAddress(addr)) {
            const impl = new ethers.Contract(
              addr,
              universalABI,
              provider
            );

            try {
              const implERC165 = await impl.supportsInterface(
                interfaceIds.ERC165
              );
              if (implERC165) {
                if (
                  await impl
                    .supportsInterface(interfaceIds.ERC1155)
                    .catch(() => false)
                ) {
                  detectedType = "ERC1155";
                  confidence = 0.95;
                  detectionMethod = "impl-erc165-erc1155";
                } else if (
                  await impl
                    .supportsInterface(interfaceIds.ERC721)
                    .catch(() => false)
                ) {
                  detectedType = "ERC721";
                  confidence = 0.95;
                  detectionMethod = "impl-erc165-erc721";
                } else if (
                  await impl
                    .supportsInterface(interfaceIds.ERC20)
                    .catch(() => false)
                ) {
                  detectedType = "ERC20";
                  confidence = 0.9;
                  detectionMethod = "impl-erc165-erc20";
                }
              }
            } catch {}

            if (detectedType === "unknown") {
              try {
                const [name, symbol] = await Promise.all([
                  impl.name().catch(() => undefined),
                  impl.symbol().catch(() => undefined),
                ]);
                if (name && symbol) {
                  detectedType = "ERC20";
                  tokenInfo.name = name;
                  tokenInfo.symbol = symbol;
                  detectionMethod = "impl-function-probe";
                  try {
                    const decimals = await impl.decimals();
                    if (decimals !== undefined) {
                      detectedType = "ERC20";
                      tokenInfo.decimals = Number(decimals);
                    }
                  } catch {}
                  try {
                    const ownerOf = await impl
                      .ownerOf(1)
                      .then(() => true)
                      .catch(() => false);
                    if (ownerOf) {
                      detectedType = "ERC721";
                      tokenInfo.decimals = 0;
                    }
                  } catch {}
                  confidence = 0.7;
                }
              } catch {}
            }
          }
        }
      } catch {
        // EIP-1967 probe skipped
      }
    }

    // Final result
    return {
      type: detectedType,
      confidence,
      detectionMethod,
      isDiamond,
      tokenInfo:
        Object.keys(tokenInfo).length > 0 ? tokenInfo : undefined,
      error,
    };
  } catch (universalError) {
    console.error(
      ` [UNIVERSAL] Universal detection failed:`,
      universalError
    );
    error = (universalError as Error)?.message;
    confidence = 0;
    return {
      type: "unknown",
      confidence,
      detectionMethod: "universal-error",
      isDiamond,
      tokenInfo: undefined,
      error,
    };
  }
}
