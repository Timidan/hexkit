import React, { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  Settings,
  Play,
  XCircle,
  Search,
  Loader2,
  Gem,
} from "lucide-react";
import { ethers } from "ethers";
// import { whatsabi } from "@shazow/whatsabi";
import { SUPPORTED_CHAINS } from "../utils/chains";
import ChainIcon, { type ChainKey } from "./icons/ChainIcon";
import type { Chain, ABIFetchResult, ContractInfo } from "../types";
import { fetchContractInfoComprehensive } from "../utils/comprehensiveContractFetcher";
import { detectTokenType } from "../utils/universalTokenDetector";
import {
  SourcifyLogo,
  BlockscoutLogo,
  EtherscanLogo,
  ManualLogo,
} from "./SourceLogos";

// Extended ABI fetch result with contract name
interface ExtendedABIFetchResult extends ABIFetchResult {
  contractName?: string;
}

const SimpleGridUI: React.FC = () => {
  // Add CSS keyframes for spinning animation
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [contractSource, setContractSource] = useState<"project" | "address">(
    "project"
  );
  const [functionMode, setFunctionMode] = useState<"function" | "raw">(
    "function"
  );
  const [selectedFunctionType, setSelectedFunctionType] = useState<
    "read" | "write" | null
  >(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [generatedCallData, setGeneratedCallData] = useState<string>("0x");
  const [selectedFunctionObj, setSelectedFunctionObj] =
    useState<ethers.utils.FunctionFragment | null>(null);
  const [functionInputs, setFunctionInputs] = useState<{
    [key: string]: string;
  }>({});
  const [contractName, setContractName] = useState<string>("");
  const [tokenInfo, setTokenInfo] = useState<{
    symbol?: string;
    name?: string;
    decimals?: number;
    assetAddress?: string;
  } | null>(null);

  // Token detection state
  const [isERC20, setIsERC20] = useState(false);
  const [isERC721, setIsERC721] = useState(false);
  const [isERC1155, setIsERC1155] = useState(false);
  const [isERC777, setIsERC777] = useState(false);
  const [isERC4626, setIsERC4626] = useState(false);
  const [isERC2981, setIsERC2981] = useState(false);
  const [isDiamond, setIsDiamond] = useState(false);
  const [tokenDetection, setTokenDetection] = useState<{
    type: string;
    confidence: number;
    detectionMethod: string;
    isDiamond: boolean;
    tokenInfo?: { name?: string; symbol?: string; decimals?: number };
    error?: string;
  } | null>(null);

  const [isLoadingContractInfo, setIsLoadingContractInfo] = useState(false);
  const [usePendingBlock, setUsePendingBlock] = useState(true);
  const [abiSource, setAbiSource] = useState<
    "sourcify" | "blockscout" | "etherscan" | "manual" | null
  >(null);

  // Contract address and network state
  const [contractAddress, setContractAddress] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState<Chain | null>(
    SUPPORTED_CHAINS[0]
  );
  const [isLoadingABI, setIsLoadingABI] = useState(false);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [abiError, setAbiError] = useState<string | null>(null);
  const [readFunctions, setReadFunctions] = useState<
    ethers.utils.FunctionFragment[]
  >([]);
  const [writeFunctions, setWriteFunctions] = useState<
    ethers.utils.FunctionFragment[]
  >([]);

  // ABI fetching functions
  const fetchABIFromSourcery = async (
    address: string,
    chainId: number
  ): Promise<ExtendedABIFetchResult> => {
    try {
      // Use checksum address for Sourcify URL (required for proper matching)
      const checksumAddress = ethers.utils.getAddress(address);
      const url = `https://repo.sourcify.dev/contracts/full_match/${chainId}/${checksumAddress}/metadata.json`;
      console.log(`Fetching from Sourcify: ${url}`);

      const response = await fetch(url);
      console.log(`Sourcify response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`Sourcify data found for chain ${chainId}`);

        // Extract contract name from compilation target
        let contractName: string | undefined;
        const compilationTarget = data.settings?.compilationTarget;
        if (compilationTarget) {
          const targetKeys = Object.keys(compilationTarget);
          if (targetKeys.length > 0) {
            contractName = compilationTarget[targetKeys[0]];
            console.log(
              `🔍 [SimpleGridUI] Extracted contract name: ${contractName}`
            );
          }
        }

        return {
          success: true,
          abi: JSON.stringify(data.output.abi),
          contractName: contractName,
        };
      }
    } catch (fetchError) {
      console.log("Sourcify fetch failed:", fetchError);
    }
    return { success: false, error: "Not found on Sourcify" };
  };

  const fetchABIFromBlockscout = async (
    address: string,
    chain: Chain
  ): Promise<ExtendedABIFetchResult> => {
    try {
      const blockscoutExplorer = chain.explorers.find(
        (e) => e.type === "blockscout"
      );
      if (!blockscoutExplorer) {
        console.log(`No Blockscout API available for ${chain.name}`);
        return {
          success: false,
          error: "No Blockscout API available for this chain",
        };
      }

      const checksumAddress = ethers.utils.getAddress(address);
      const url = `${blockscoutExplorer.url}/v2/smart-contracts/${checksumAddress}`;
      console.log(`Fetching from Blockscout: ${url}`);

      const response = await fetch(url);
      console.log(`Blockscout response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`Blockscout response for ${chain.name}:`, data);
        if (data.abi && data.abi.length > 0) {
          // Extract contract name if available
          let contractName: string | undefined;
          if (data.name) {
            contractName = data.name;
            console.log(
              `🔍 [SimpleGridUI] Blockscout extracted contract name: ${contractName}`
            );
          }

          return {
            success: true,
            abi: JSON.stringify(data.abi),
            contractName: contractName,
          };
        } else {
          console.log(`No ABI found in Blockscout response for ${chain.name}`);
        }
      }
    } catch (fetchError) {
      console.log("Blockscout fetch failed:", fetchError);
    }
    return { success: false, error: "Not found on Blockscout" };
  };

  const fetchABIFromEtherscan = async (
    address: string,
    chain: Chain
  ): Promise<ExtendedABIFetchResult> => {
    try {
      const etherscanExplorer = chain.explorers.find(
        (e) => e.type === "etherscan"
      );
      if (!etherscanExplorer) {
        console.log(`No Etherscan API available for ${chain.name}`);
        return {
          success: false,
          error: "No Etherscan API available for this chain",
        };
      }

      const checksumAddress = ethers.utils.getAddress(address);
      const url = `${etherscanExplorer.url}?module=contract&action=getabi&address=${checksumAddress}`;
      console.log(`Fetching from Etherscan: ${url}`);

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log(`Etherscan response for ${chain.name}:`, data);
        if (data.status === "1" && data.result) {
          // Also try to get contract name from Etherscan
          let contractName: string | undefined;
          try {
            const nameUrl = `${etherscanExplorer.url}?module=contract&action=getsourcecode&address=${checksumAddress}`;
            const nameResponse = await fetch(nameUrl);
            if (nameResponse.ok) {
              const nameData = await nameResponse.json();
              if (
                nameData.status === "1" &&
                nameData.result &&
                nameData.result[0]
              ) {
                contractName = nameData.result[0].ContractName;
                console.log(
                  `🔍 [SimpleGridUI] Etherscan extracted contract name: ${contractName}`
                );
              }
            }
          } catch (nameError) {
            console.log(
              "Failed to fetch contract name from Etherscan:",
              nameError
            );
          }

          return {
            success: true,
            abi: data.result,
            contractName: contractName,
          };
        } else {
          console.log(
            `Etherscan error for ${chain.name}:`,
            data.message || data.result
          );
        }
      } else {
        console.log(`Etherscan fetch failed with status:`, response.status);
      }
    } catch (fetchError) {
      console.log("Etherscan fetch failed:", fetchError);
    }
    return { success: false, error: "Not found on Etherscan-compatible API" };
  };

  const fetchContractABI = async (
    address: string,
    chain: Chain
  ): Promise<void> => {
    if (!address || !ethers.utils.isAddress(address)) {
      setAbiError("Invalid contract address");
      return;
    }

    setIsLoadingABI(true);
    setAbiError(null);
    setContractInfo(null);
    setReadFunctions([]);
    setWriteFunctions([]);
    setAbiSource(null);

    // Try sources in order: Sourcify → Blockscout → Etherscan for all networks
    let result: ExtendedABIFetchResult;
    let source: string;

    console.log(
      "🔄 Starting ABI fetch with order: Sourcify → Blockscout → Etherscan"
    );

    // Always try Sourcify first for best contract name extraction
    result = await fetchABIFromSourcery(address, chain.id);
    source = "Sourcify";

    // Try Blockscout if Sourcify fails
    if (!result.success) {
      result = await fetchABIFromBlockscout(address, chain);
      source = "Blockscout";
    }

    // Try Etherscan if Blockscout fails
    if (!result.success) {
      result = await fetchABIFromEtherscan(address, chain);
      source = "Etherscan";
    }

    if (result.success && result.abi) {
      try {
        const parsedABI = JSON.parse(result.abi);
        const contractInfoObj: ContractInfo = {
          address,
          chain,
          abi: result.abi,
          verified: true,
        };

        setContractInfo(contractInfoObj);
        categorizeABIFunctions(parsedABI);
        console.log(`ABI fetched successfully from ${source}`);

        // Set ABI source
        if (
          source === "sourcify" ||
          source === "blockscout" ||
          source === "etherscan"
        ) {
          setAbiSource(source);
        }

        // Check if contract name was extracted from ABI fetch
        const extendedResult = result as ExtendedABIFetchResult;
        if (extendedResult.contractName) {
          console.log(
            `🎯 [SimpleGridUI] Setting contract name from fetch result: ${extendedResult.contractName}`
          );
          console.log(
            `🔍 [SimpleGridUI] Current contractName state BEFORE set: ${contractName}`
          );

          // Set the contract name and log immediately after
          setContractName(extendedResult.contractName);

          // Use setTimeout to log the state after the state update
          setTimeout(() => {
            console.log(
              `🔍 [SimpleGridUI] Contract name state AFTER set (async): ${contractName}`
            );
          }, 100);

          // Immediately update the contract info object with the correct name
          contractInfoObj.name = extendedResult.contractName;
          setContractInfo(contractInfoObj);

          // Set functions and call detectAndFetchTokenInfo with preservation flag
          setReadFunctions(
            parsedABI
              .filter((item: any) => item.type === "function")
              .filter(
                (func: any) =>
                  func.stateMutability === "view" ||
                  func.stateMutability === "pure"
              )
              .map((func: any) => func as ethers.utils.FunctionFragment)
          );

          setWriteFunctions(
            parsedABI
              .filter((item: any) => item.type === "function")
              .filter(
                (func: any) =>
                  func.stateMutability !== "view" &&
                  func.stateMutability !== "pure"
              )
              .map((func: any) => func as ethers.utils.FunctionFragment)
          );

          // Extract function names and event signatures for token detection
          const functionNames = parsedABI
            .filter((item: any) => item.type === "function")
            .map((item: any) => (item as ethers.utils.FunctionFragment).name);

          const eventSignatures = parsedABI
            .filter((item: any) => item.type === "event")
            .map((item: any) => {
              const event = item as ethers.utils.EventFragment;
              const inputs = event.inputs
                .map((input) => {
                  if (input.type === "tuple") {
                    return `(${input.components?.map((comp: ethers.utils.ParamType) => comp.type).join(",")})`;
                  }
                  return input.type;
                })
                .join(",");
              return `${event.name}(${inputs})`;
            });

          // Call detectAndFetchTokenInfo with preservation flag to avoid race condition
          await detectAndFetchTokenInfo(
            parsedABI,
            true,
            functionNames,
            eventSignatures
          ); // Preserve the Sourcify name
        } else {
          // No contract name from ABI fetch, proceed normally
          categorizeABIFunctions(parsedABI);
        }
      } catch (parseError) {
        console.error("ABI parsing error:", parseError);
        setAbiError("Failed to parse ABI JSON");
      }
    } else {
      setAbiError(
        "Contract ABI not found on any source (Sourcify → Blockscout → Etherscan)"
      );
    }

    // Always reset loading state after all processing is complete
    setIsLoadingABI(false);
  };

  const categorizeABIFunctions = (
    abi: ethers.utils.Fragment[],
    skipTokenInfoFetch: boolean = false
  ) => {
    const reads: ethers.utils.FunctionFragment[] = [];
    const writes: ethers.utils.FunctionFragment[] = [];

    abi.forEach((item) => {
      if (item.type === "function") {
        const funcFragment = item as ethers.utils.FunctionFragment;
        if (
          funcFragment.stateMutability === "view" ||
          funcFragment.stateMutability === "pure"
        ) {
          reads.push(funcFragment);
        } else {
          writes.push(funcFragment);
        }
      }
    });

    setReadFunctions(reads);
    setWriteFunctions(writes);

    // Check if it's a token contract and fetch basic info
    if (!skipTokenInfoFetch) {
      // Extract function names and event signatures for token detection
      const functionNames = abi
        .filter((item: any) => item.type === "function")
        .map((item: any) => (item as ethers.utils.FunctionFragment).name);

      const eventSignatures = abi
        .filter((item: any) => item.type === "event")
        .map((item: any) => {
          const event = item as ethers.utils.EventFragment;
          const inputs = event.inputs
            .map((input) => {
              if (input.type === "tuple") {
                return `(${input.components?.map((comp: ethers.utils.ParamType) => comp.type).join(",")})`;
              }
              return input.type;
            })
            .join(",");
          return `${event.name}(${inputs})`;
        });

      detectAndFetchTokenInfo(abi, false, functionNames, eventSignatures); // Don't preserve - this is a manual ABI input
    }
  };

  const detectAndFetchTokenInfo = async (
    abi: ethers.utils.Fragment[],
    preserveContractName: boolean = false,
    functionsParam: string[] = [],
    eventsParam: string[] = []
  ) => {
    console.log("=== detectAndFetchTokenInfo called ===");
    console.log("Contract address:", contractAddress);
    console.log("Selected network:", selectedNetwork?.name);
    console.log("ABI length:", abi.length);
    console.log(
      "🔍 [SimpleGridUI] Preserve contract name flag:",
      preserveContractName
    );
    console.log("🔍 [SimpleGridUI] Current contractName state:", contractName);

    if (!contractAddress || !selectedNetwork) {
      console.log("Missing contract address or network, setting default name");
      console.log(
        "🔍 [SimpleGridUI] Setting fallback name: Unknown Contract (missing address/network)"
      );
      setContractName("Unknown Contract");
      setTokenInfo(null);
      return;
    }

    setIsLoadingContractInfo(true);
    console.log("Starting contract info fetch...");

    try {
      console.log("Found function names:", functionsParam);
      console.log("Total functions in ABI:", functionsParam.length);
      console.log("Found event signatures:", eventsParam);
      console.log("Total events in ABI:", eventsParam.length);

      // Debug: Show full function signatures for analysis
      console.log("🔍 Full function signatures from ABI:");
      abi
        .filter((item: any) => item.type === "function")
        .forEach((func: any, index: number) => {
          const inputs =
            func.inputs?.map((input: any) => input.type).join(",") || "";
          console.log(`   ${index + 1}. ${func.name}(${inputs})`);
        });

      console.log("🔍 Full event signatures from ABI:");
      abi
        .filter((item: any) => item.type === "event")
        .forEach((event: any, index: number) => {
          const inputs =
            event.inputs?.map((input: any) => input.type).join(",") || "";
          console.log(`   ${index + 1}. ${event.name}(${inputs})`);
        });

      // ERC165 interface detection function with minimal ABI
      const detectTokenInterfaces = async (
        contractAddress: string,
        provider: ethers.providers.Provider
      ): Promise<string[]> => {
        // Minimal ABI for supportsInterface calls
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

        const interfaceIds = {
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

        const supportedInterfaces: string[] = [];

        // Create contract instance with minimal ABI for ERC165 detection
        const erc165Contract = new ethers.Contract(
          contractAddress,
          erc165ABI,
          provider
        );

        console.log("🔍 Testing ERC165 interface support...");

        try {
          // First check if contract supports ERC165 itself
          const supportsERC165 = await erc165Contract.supportsInterface(
            interfaceIds.ERC165
          );
          if (supportsERC165) {
            supportedInterfaces.push("ERC165");
            console.log("✅ Contract supports ERC165");

            // Check other interfaces in priority order, return first match
            const interfaceCheckOrder = [
              "ERC20", // Most common token type - highest priority
              "ERC721", // NFT type
              "ERC1155", // Multi-token standard
              "ERC777", // Advanced token standard
              "ERC4626", // Tokenized vaults
              "ERC2981", // Royalty standard
              "ERC721Metadata",
              "ERC721Enumerable",
              "ERC1155MetadataURI",
            ];

            console.log(
              `🔍 [ERC165] Checking interfaces for ${contractAddress} in priority order:`
            );

            for (const interfaceName of interfaceCheckOrder) {
              try {
                const interfaceId =
                  interfaceIds[interfaceName as keyof typeof interfaceIds];
                console.log(
                  `🔍 [ERC165] Testing ${interfaceName} (${interfaceId})...`
                );
                let isSupported = false;
                try {
                  isSupported =
                    await erc165Contract.supportsInterface(interfaceId);
                  console.log(
                    `🔍 [ERC165] ${interfaceName} support: ${isSupported}`
                  );
                } catch (error) {
                  console.log(
                    `🔍 [ERC165] ${interfaceName} supportsInterface call failed:`,
                    error
                  );
                  // For debugging, let's check if the contract exists and is responsive
                  try {
                    const code = await provider.getCode(contractAddress);
                    console.log(
                      `🔍 [ERC165] Contract code length: ${code.length} bytes`
                    );
                    if (code.length <= 2) {
                      console.log(
                        `🔍 [ERC165] Contract appears to be non-existent or empty!`
                      );
                    }
                  } catch (codeError) {
                    console.log(
                      `🔍 [ERC165] Failed to get contract code:`,
                      codeError
                    );
                  }
                }

                if (isSupported) {
                  supportedInterfaces.push(interfaceName);
                  console.log(
                    `✅ Contract supports ${interfaceName} - this will be the detected type`
                  );
                  // Return immediately with the first token interface found
                  return supportedInterfaces;
                }
              } catch (error) {
                console.log(
                  `❌ Interface check failed for ${interfaceName}:`,
                  error
                );
                // Continue to next interface if one fails
              }
            }
          } else {
            console.log("❌ Contract does not support ERC165");
          }
        } catch (error) {
          console.log(
            "❌ ERC165 detection failed - contract does not implement supportsInterface onchain"
          );
          // Return empty array to fall back to function-based detection
        }

        return supportedInterfaces;
      };

      // Universal ABI for comprehensive token type detection
      const universalABI = [
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

      // Interface IDs for all token standards
      const interfaceIds = {
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

      // Comprehensive token type detection using universal ABI
      const detectTokenTypeUniversal = async (
        contractAddress: string,
        provider: ethers.providers.Provider
      ): Promise<{
        type: string;
        confidence: number;
        detectionMethod: string;
        isDiamond: boolean;
        tokenInfo?: { name?: string; symbol?: string; decimals?: number };
        error?: string;
      }> => {
        console.log(
          `🔍 [UNIVERSAL] Starting universal token detection for ${contractAddress}...`
        );

        // Create contract instance with universal ABI
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
          // Step 1: Check if contract supports ERC165 (required for all token standards)
          console.log(`🔍 [UNIVERSAL] Testing ERC165 support...`);
          let supportsERC165 = false;
          try {
            supportsERC165 = await universalContract.supportsInterface(
              interfaceIds.ERC165
            );
          } catch (erc165Error) {
            console.log(
              `❌ [UNIVERSAL] ERC165 call failed, trying fallback detection...`,
              (erc165Error as Error)?.message
            );
          }

          if (!supportsERC165) {
            console.log(
              `❌ [UNIVERSAL] Contract does not support ERC165 - trying fallback detection...`
            );

            // For contracts that don't support ERC165, try to detect ERC20 tokens
            // This handles older tokens like USDT that don't implement ERC165
            try {
              const [name, symbol, decimals] = await Promise.all([
                universalContract.name().catch(() => undefined),
                universalContract.symbol().catch(() => undefined),
                universalContract.decimals().catch(() => undefined),
              ]);

              if (name && symbol && decimals !== undefined) {
                console.log(
                  `✅ [UNIVERSAL] Detected ERC20 token via fallback (no ERC165): ${name} (${symbol})`
                );
                return {
                  type: "ERC20",
                  confidence: 0.8,
                  detectionMethod: "fallback-erc20",
                  isDiamond: false,
                  tokenInfo: { name, symbol, decimals: Number(decimals) },
                };
              }
            } catch (fallbackError) {
              console.log(
                `❌ [UNIVERSAL] Fallback detection failed:`,
                (fallbackError as Error)?.message
              );
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

          console.log(`✅ [UNIVERSAL] Contract supports ERC165`);
          confidence = 0.5;
          detectionMethod = "erc165-supported";

          // Step 2: Test all token interfaces in priority order
          console.log(`🔍 [UNIVERSAL] Testing token interfaces...`);
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
              console.log(
                `🔍 [UNIVERSAL] ${interfaceTest.name} support: ${isSupported}`
              );

              if (isSupported) {
                detectedType = interfaceTest.type;
                confidence = 0.95;
                detectionMethod = `erc165-${interfaceTest.name.toLowerCase()}`;
                console.log(
                  `✅ [UNIVERSAL] Detected ${interfaceTest.type} token`
                );
                break;
              }
            } catch (interfaceError) {
              console.log(
                `❌ [UNIVERSAL] ${interfaceTest.name} test failed:`,
                interfaceError
              );
            }
          }

          // Step 3: Fetch token metadata if token type detected
          if (detectedType !== "unknown") {
            console.log(
              `🔍 [UNIVERSAL] Fetching token metadata for ${detectedType}...`
            );

            try {
              const [name, symbol] = await Promise.all([
                universalContract.name().catch(() => undefined),
                universalContract.symbol().catch(() => undefined),
              ]);

              if (name) tokenInfo.name = name;
              if (symbol) tokenInfo.symbol = symbol;

              console.log(
                `✅ [UNIVERSAL] Token metadata: ${name || "Unknown"} (${symbol || "Unknown"})`
              );

              // Fetch decimals for ERC20/ERC777 tokens
              if (detectedType === "ERC20" || detectedType === "ERC777") {
                try {
                  const decimals = await universalContract.decimals();
                  tokenInfo.decimals = Number(decimals);
                  console.log(`✅ [UNIVERSAL] Decimals: ${tokenInfo.decimals}`);
                } catch (decimalsError) {
                  console.log(
                    `❌ [UNIVERSAL] Failed to fetch decimals:`,
                    decimalsError
                  );
                  tokenInfo.decimals = 18; // Default for ERC20
                }
              } else {
                tokenInfo.decimals = 0; // Non-fungible tokens
              }
            } catch (metadataError) {
              console.log(
                `❌ [UNIVERSAL] Failed to fetch token metadata:`,
                metadataError
              );
            }
          }

          // Step 4: Check for Diamond standard (regardless of token type)
          console.log(`🔍 [UNIVERSAL] Testing Diamond standard...`);
          try {
            // Try multiple Diamond detection methods
            const functionSelectors =
              await universalContract.facetFunctionSelectors(
                "0x0000000000000000000000000000000000000000"
              );
            if (
              Array.isArray(functionSelectors) &&
              functionSelectors.length > 0
            ) {
              isDiamond = true;
              console.log(
                `✅ [UNIVERSAL] Diamond proxy detected via facetFunctionSelectors (${functionSelectors.length} selectors)`
              );
            } else {
              // Try facets function
              try {
                const facets = await universalContract.facets();
                if (Array.isArray(facets) && facets.length > 0) {
                  isDiamond = true;
                  console.log(
                    `✅ [UNIVERSAL] Diamond proxy detected via facets function (${facets.length} facets)`
                  );
                }
              } catch (facetsError) {
                // Try facetAddresses function
                try {
                  const facetAddresses =
                    await universalContract.facetAddresses();
                  if (
                    Array.isArray(facetAddresses) &&
                    facetAddresses.length > 0
                  ) {
                    isDiamond = true;
                    console.log(
                      `✅ [UNIVERSAL] Diamond proxy detected via facetAddresses (${facetAddresses.length} addresses)`
                    );
                  }
                } catch (addressesError) {
                  console.log(
                    `🔍 [UNIVERSAL] Not a Diamond proxy - all Diamond functions failed`
                  );
                }
              }
            }
          } catch (diamondError) {
            console.log(
              `🔍 [UNIVERSAL] Not a Diamond proxy:`,
              (diamondError as Error)?.message
            );
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

              // Common selectors
              const has = (sig: string) => selectorSet.has(sig.toLowerCase());
              const ERC20 =
                has("0x70a08231") /* balanceOf(address) */ ||
                has("0xa9059cbb") /* transfer(address,uint256) */ ||
                has("0xdd62ed3e"); /* allowance(address,address) */

              const ERC721Core =
                has("0x6352211e") /* ownerOf(uint256) */ &&
                has("0x23b872dd"); /* transferFrom(address,address,uint256) */

              const ERC1155Core =
                has(
                  "0xf242432a"
                ) /* safeTransferFrom(address,address,uint256,uint256,bytes) */ ||
                has(
                  "0x2eb2c2d6"
                ) /* safeBatchTransferFrom(address,address,uint256[],uint256[],bytes) */ ||
                has("0xe985e9c5"); /* isApprovedForAll(address,address) */

              if (ERC721Core) {
                detectedType = "ERC721";
                confidence = Math.max(confidence, 0.9);
                detectionMethod = "diamond-selectors-erc721";
                console.log("💎 Inferred ERC721 via diamond facet selectors");
              } else if (ERC1155Core) {
                detectedType = "ERC1155";
                confidence = Math.max(confidence, 0.9);
                detectionMethod = "diamond-selectors-erc1155";
                console.log("💎 Inferred ERC1155 via diamond facet selectors");
              } else if (ERC20) {
                detectedType = "ERC20";
                confidence = Math.max(confidence, 0.8);
                detectionMethod = "diamond-selectors-erc20";
                console.log("💎 Inferred ERC20 via diamond facet selectors");
              }
            } catch (diamondScanError) {
              console.log("💎 Diamond selector scan failed:", diamondScanError);
            }
          }

          // Extra probe for EIP-1967 proxies: read implementation and test there
          if (detectedType === "unknown") {
            try {
              // EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
              const implSlot =
                "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
              const raw = await provider.getStorageAt(
                contractAddress,
                implSlot
              );
              if (raw && raw !== "0x" && raw !== "0x00") {
                const addr = "0x" + raw.slice(26); // last 20 bytes
                if (ethers.utils.isAddress(addr)) {
                  console.log(
                    `🔍 [UNIVERSAL] EIP-1967 implementation: ${addr}`
                  );
                  const impl = new ethers.Contract(
                    addr,
                    universalABI,
                    provider
                  );

                  // Re-run ERC165 tests against implementation
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

                  // Function probe if still unknown
                  if (detectedType === "unknown") {
                    try {
                      const [name, symbol] = await Promise.all([
                        impl.name().catch(() => undefined),
                        impl.symbol().catch(() => undefined),
                      ]);
                      if (name && symbol) {
                        detectedType = "ERC20"; // could be ERC721/777; rely on decimals below
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
                        // Heuristic for ERC721: ownerOf selector presence
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
            } catch (e) {
              console.log(
                "❔ [UNIVERSAL] EIP-1967 probe skipped:",
                (e as Error)?.message
              );
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
            `❌ [UNIVERSAL] Universal detection failed:`,
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
      };

      // Diamond verification function
      const verifyDiamondStandard = async (
        contractAddress: string,
        provider: ethers.providers.Provider
      ) => {
        try {
          const diamondContract = new ethers.Contract(
            contractAddress,
            [
              "function facetAddresses() external view returns (address[] memory facetAddresses_)",
            ],
            provider
          );
          const facetAddresses = await diamondContract.facetAddresses();
          return Array.isArray(facetAddresses) && facetAddresses.length > 0;
        } catch {
          return false;
        }
      };

      // Enhanced token detection with multi-factor analysis
      const detectTokenType = async (
        functionsParam: string[],
        eventsParam: string[] = [],
        contract: ethers.Contract,
        contractAddress: string,
        provider: ethers.providers.Provider
      ): Promise<{
        type: string;
        confidence: number;
        interfaces: string[];
        detectionMethod: string;
        isDiamond?: boolean;
      }> => {
        console.log("🔍 [DETECT] Starting enhanced token detection...");

        // Step 1: Check for Diamond standard first (using minimal ABI approach)
        const isDiamond = await verifyDiamondStandard(
          contractAddress,
          provider
        );
        if (isDiamond) {
          console.log("💎 Diamond standard verified!");
        }

        // Step 2: Check ERC165 interfaces using minimal ABI approach
        const supportedInterfaces = await detectTokenInterfaces(
          contractAddress,
          provider
        );
        console.log("🔍 [DETECT] Supported interfaces:", supportedInterfaces);

        // Step 3: Determine token type based on supported interfaces
        let detectedType = "unknown";
        let confidence = 0;
        let detectionMethod = "none";

        // Priority-based interface detection - prioritize more specific types first
        if (supportedInterfaces.includes("ERC1155")) {
          detectedType = "ERC1155";
          confidence = 0.95;
          detectionMethod = "erc165-interface";
          console.log(
            "🎭 ERC1155 interface detected (prioritized over ERC721 for multi-interface contracts)"
          );
          if (isDiamond) {
            console.log(
              "💎 Multi-standard contract: ERC1155 + Diamond proxy detected"
            );
          }
        } else if (supportedInterfaces.includes("ERC721")) {
          detectedType = "ERC721";
          confidence = 0.95;
          detectionMethod = "erc165-interface";
          console.log("🎨 ERC721 interface detected");
          if (isDiamond) {
            console.log(
              "💎 Multi-standard contract: ERC721 + Diamond proxy detected"
            );
          }
        } else if (supportedInterfaces.includes("ERC20")) {
          detectedType = "ERC20";
          confidence = 0.95;
          detectionMethod = "erc165-interface";
          console.log("💰 ERC20 interface detected");
          if (isDiamond) {
            console.log(
              "💎 Multi-standard contract: ERC20 + Diamond proxy detected"
            );
          }
        } else if (supportedInterfaces.includes("ERC777")) {
          detectedType = "ERC777";
          confidence = 0.95;
          detectionMethod = "erc165-interface";
          console.log("⚡ ERC777 interface detected");
        } else if (supportedInterfaces.includes("ERC4626")) {
          detectedType = "ERC4626";
          confidence = 0.95;
          detectionMethod = "erc165-interface";
          console.log("🏦 ERC4626 interface detected");
        } else if (supportedInterfaces.includes("ERC2981")) {
          detectedType = "ERC2981";
          confidence = 0.8;
          detectionMethod = "erc165-interface";
          console.log("👑 ERC2981 interface detected");
        } else {
          // Fallback to function-based detection if no interfaces found
          console.log(
            "🔍 [DETECT] No ERC165 interfaces found, falling back to function detection..."
          );
          console.log(
            `🔍 [DETECT] Available functions for analysis:`,
            functionsParam.slice(0, 10)
          );

          // Enhanced ERC721 detection - check for core NFT functions with multiple patterns
          const hasOwnerOf = functionsParam.some(
            (func: string) =>
              func.includes("ownerOf(uint256)") ||
              func.includes("ownerOf(uint256,address)")
          );
          const hasTokenURI = functionsParam.some(
            (func: string) =>
              func.includes("tokenURI(uint256)") ||
              func.includes("tokenUrl(uint256)")
          );
          const hasBalanceOf = functionsParam.some(
            (func: string) =>
              func.includes("balanceOf(address)") ||
              func.includes("balanceOf(address,uint256)")
          );
          const hasTransferFrom = functionsParam.some((func: string) =>
            func.includes("transferFrom(address,address,uint256)")
          );

          // More flexible ERC721 detection - require ownerOf and at least 2 other core functions
          const hasERC721CoreFunctions =
            hasOwnerOf && hasTokenURI && (hasBalanceOf || hasTransferFrom);

          console.log(`🔍 [DETECT] ERC721 function analysis:`);
          console.log(`  - ownerOf: ${hasOwnerOf}`);
          console.log(`  - tokenURI: ${hasTokenURI}`);
          console.log(`  - balanceOf: ${hasBalanceOf}`);
          console.log(`  - transferFrom: ${hasTransferFrom}`);
          console.log(
            `  - Overall ERC721 detection: ${hasERC721CoreFunctions}`
          );

          const hasERC20CoreFunctions = functionsParam.some(
            (func: string) =>
              func.includes("balanceOf(address)") &&
              func.includes("transfer(address,uint256)") &&
              func.includes("allowance(address,address)")
          );

          const hasERC1155CoreFunctions = functionsParam.some(
            (func: string) =>
              func.includes("balanceOf(address,uint256)") &&
              func.includes(
                "safeTransferFrom(address,address,uint256,uint256,bytes)"
              )
          );

          // Additional check for ERC721 - look for common NFT patterns
          const hasNFTFunctions =
            hasOwnerOf &&
            functionsParam.some(
              (func: string) =>
                func.includes("approve(address,uint256)") ||
                func.includes("setApprovalForAll(address,bool)") ||
                func.includes("getApproved(uint256)")
            );

          // Prioritize direct function detection for contracts that don't implement ERC165
          if (hasERC721CoreFunctions || (hasOwnerOf && hasNFTFunctions)) {
            detectedType = "ERC721";
            confidence = hasERC721CoreFunctions ? 0.8 : 0.7;
            detectionMethod = "function-detection";
            console.log(
              `🎨 ERC721 detected via function presence (confidence: ${confidence})`
            );
          } else if (hasERC20CoreFunctions) {
            detectedType = "ERC20";
            confidence = 0.8;
            detectionMethod = "function-detection";
            console.log(
              "💰 ERC20 detected via core function presence (non-ERC165 contract)"
            );
          } else if (hasERC1155CoreFunctions) {
            detectedType = "ERC1155";
            confidence = 0.8;
            detectionMethod = "function-detection";
            console.log(
              "🎭 ERC1155 detected via core function presence (non-ERC165 contract)"
            );
          } else {
            // Check for Diamond/EIP-2535 proxy pattern
            const isDiamondProxy = functionsParam.some(
              (func: string) =>
                func.includes("facet") ||
                func.includes("diamond") ||
                func.includes("getDefaultFacetAddresses") ||
                func.includes("facets")
            );

            if (isDiamondProxy) {
              // For Diamond proxies, check if they have ERC1155 functions
              const hasERC1155Functions = functionsParam.some(
                (func: string) =>
                  func.includes(
                    "safeTransferFrom(address,address,uint256,uint256,bytes)"
                  ) ||
                  func.includes(
                    "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)"
                  ) ||
                  func.includes("balanceOfBatch(address[],uint256[])") ||
                  func.includes("uri(uint256)")
              );

              const hasERC721Functions = functionsParam.some(
                (func: string) =>
                  func.includes("tokenOfOwnerByIndex(address,uint256)") ||
                  func.includes("tokenByIndex(uint256)") ||
                  func.includes("ownerOf(uint256)")
              );

              const hasERC20Functions = functionsParam.some(
                (func: string) =>
                  func.includes("allowance(address,address)") ||
                  func.includes("decimals()")
              );

              if (hasERC1155Functions) {
                detectedType = "ERC1155";
                confidence = 0.9;
                detectionMethod = "diamond-erc1155";
                console.log(
                  "💎 Diamond proxy with ERC1155 functionality detected"
                );
              } else if (hasERC721Functions) {
                detectedType = "ERC721";
                confidence = 0.9;
                detectionMethod = "diamond-erc721";
                console.log(
                  "💎 Diamond proxy with ERC721 functionality detected"
                );
              } else if (hasERC20Functions) {
                detectedType = "ERC20";
                confidence = 0.9;
                detectionMethod = "diamond-erc20";
                console.log(
                  "💎 Diamond proxy with ERC20 functionality detected"
                );
              } else {
                detectedType = "Diamond";
                confidence = 0.8;
                detectionMethod = "diamond-pattern";
                console.log(
                  "💎 Diamond/EIP-2535 proxy pattern detected (generic)"
                );
              }
            } else {
              // Use the old function-based scoring as fallback
              const scores: Record<string, number> = {};

              // Score functions (simplified version)
              functionsParam.forEach((func: string) => {
                const funcInfo = FUNCTIONS[func as keyof typeof FUNCTIONS];
                if (funcInfo) {
                  if (funcInfo.type === "SHARED") {
                    funcInfo.sharedTypes?.forEach((sharedType: string) => {
                      scores[sharedType] =
                        (scores[sharedType] || 0) + funcInfo.weight;
                    });
                  } else {
                    scores[funcInfo.type] =
                      (scores[funcInfo.type] || 0) + funcInfo.weight;
                  }
                }
              });

              // Determine type based on highest score
              const maxScore = Math.max(...Object.values(scores));
              if (maxScore > 0) {
                const topType = Object.entries(scores).find(
                  ([_, score]) => score === maxScore
                )?.[0];
                if (topType) {
                  detectedType = topType;
                  confidence = Math.min(maxScore / 5, 0.8); // Normalize confidence
                  detectionMethod = "function-scoring";
                }
              }
            }
          }

          return {
            type: detectedType,
            confidence,
            interfaces: supportedInterfaces,
            detectionMethod,
            isDiamond,
          };
        }

        // Define function info type for fallback detection
        type FunctionInfo = {
          type: string;
          weight: number;
          sharedTypes?: string[];
        };

        // Function signatures for fallback detection
        const FUNCTIONS: Record<string, FunctionInfo> = {
          // Highly specific functions (unique to token types)
          "ownerOf(uint256)": { type: "ERC721", weight: 1.0 },
          "tokenURI(uint256)": { type: "ERC721", weight: 0.8 },
          "balanceOf(address,uint256)": { type: "ERC1155", weight: 1.0 },
          "balanceOfBatch(address[],uint256[])": {
            type: "ERC1155",
            weight: 1.0,
          },
          "safeTransferFrom(address,address,uint256,uint256,bytes)": {
            type: "ERC1155",
            weight: 1.0,
          },
          "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)": {
            type: "ERC1155",
            weight: 1.0,
          },
          "uri(uint256)": { type: "ERC1155", weight: 0.8 },
          "send(address,uint256,bytes)": { type: "ERC777", weight: 1.0 },
          "burn(uint256,bytes)": { type: "ERC777", weight: 1.0 },
          "isOperatorFor(address,address)": { type: "ERC777", weight: 0.8 },
          "authorizeOperator(address)": { type: "ERC777", weight: 0.8 },
          "revokeOperator(address)": { type: "ERC777", weight: 0.8 },
          "asset()": { type: "ERC4626", weight: 1.0 },
          "totalAssets()": { type: "ERC4626", weight: 1.0 },
          "convertToShares(uint256)": { type: "ERC4626", weight: 0.8 },
          "convertToAssets(uint256)": { type: "ERC4626", weight: 0.8 },
          "maxDeposit(address)": { type: "ERC4626", weight: 0.8 },
          "previewDeposit(uint256)": { type: "ERC4626", weight: 0.8 },
          "deposit(uint256,address)": { type: "ERC4626", weight: 0.8 },
          "maxMint(address)": { type: "ERC4626", weight: 0.8 },
          "previewMint(uint256)": { type: "ERC4626", weight: 0.8 },
          "mint(uint256,address)": { type: "ERC4626", weight: 0.8 },
          "maxWithdraw(address)": { type: "ERC4626", weight: 0.8 },
          "previewWithdraw(uint256)": { type: "ERC4626", weight: 0.8 },
          "withdraw(uint256,address,address)": { type: "ERC4626", weight: 0.8 },
          "maxRedeem(address)": { type: "ERC4626", weight: 0.8 },
          "previewRedeem(uint256)": { type: "ERC4626", weight: 0.8 },
          "redeem(uint256,address,address)": { type: "ERC4626", weight: 0.8 },
          "royaltyInfo(uint256,uint256)": { type: "ERC2981", weight: 1.0 },

          // Shared functions with multiple token types (weighted by context)
          "totalSupply()": {
            type: "SHARED",
            weight: 1.0,
            sharedTypes: ["ERC20", "ERC721"],
          },
          "balanceOf(address)": {
            type: "SHARED",
            weight: 1.0,
            sharedTypes: ["ERC20", "ERC721", "ERC1155"],
          },
          "transfer(address,uint256)": {
            type: "SHARED",
            weight: 1.0,
            sharedTypes: ["ERC20"],
          },
          "transferFrom(address,address,uint256)": {
            type: "SHARED",
            weight: 1.0,
            sharedTypes: ["ERC20", "ERC721"],
          },
          "approve(address,uint256)": {
            type: "SHARED",
            weight: 1.0,
            sharedTypes: ["ERC20", "ERC721"],
          },
          "allowance(address,address)": {
            type: "SHARED",
            weight: 1.0,
            sharedTypes: ["ERC20"],
          },
          "name()": {
            type: "SHARED",
            weight: 0.5,
            sharedTypes: ["ERC20", "ERC721"],
          },
          "symbol()": {
            type: "SHARED",
            weight: 0.5,
            sharedTypes: ["ERC20", "ERC721"],
          },
          "decimals()": {
            type: "SHARED",
            weight: 0.8,
            sharedTypes: ["ERC20", "ERC4626"],
          },
          "safeTransferFrom(address,address,uint256)": {
            type: "SHARED",
            weight: 1.0,
            sharedTypes: ["ERC721", "ERC1155"],
          },
          "safeTransferFrom(address,address,uint256,bytes)": {
            type: "SHARED",
            weight: 1.0,
            sharedTypes: ["ERC721"],
          },
          "setApprovalForAll(address,bool)": {
            type: "SHARED",
            weight: 0.8,
            sharedTypes: ["ERC721", "ERC1155"],
          },
          "isApprovedForAll(address,address)": {
            type: "SHARED",
            weight: 0.8,
            sharedTypes: ["ERC721", "ERC1155"],
          },
          "tokenByIndex(uint256)": {
            type: "SHARED",
            weight: 0.5,
            sharedTypes: ["ERC721"],
          },
          "tokenOfOwnerByIndex(address,uint256)": {
            type: "SHARED",
            weight: 0.5,
            sharedTypes: ["ERC721"],
          },
          "defaultOperators()": {
            type: "SHARED",
            weight: 0.5,
            sharedTypes: ["ERC777"],
          },

          // Common utility functions (lower weight)
          "supportsInterface(bytes4)": { type: "UTILITY", weight: 0.2 },
        };

        // Event signatures with importance weights
        const EVENTS = {
          "Transfer(address,address,uint256)": { type: "ERC20", weight: 0.8 },
          "Transfer(address,address,uint256,bytes)": {
            type: "ERC777",
            weight: 0.8,
          },
          "Transfer(address,address,uint256,uint256,bytes)": {
            type: "ERC1155",
            weight: 0.8,
          },
          "TransferSingle(address,address,address,uint256,uint256)": {
            type: "ERC1155",
            weight: 0.8,
          },
          "TransferBatch(address,address,address,uint256[],uint256[])": {
            type: "ERC1155",
            weight: 0.8,
          },
          "Approval(address,address,uint256)": {
            type: "ERC20/ERC721",
            weight: 0.6,
          },
          "ApprovalForAll(address,address,bool)": {
            type: "ERC721/ERC1155",
            weight: 0.7,
          },
          "Mint(address,uint256)": { type: "ERC20/ERC721", weight: 0.5 },
          "Burn(address,uint256)": { type: "ERC20/ERC721", weight: 0.5 },
          "URI(string,uint256)": { type: "ERC1155", weight: 0.6 },
        };

        // Calculate scores by type
        const scores: Record<string, number> = {};
        const detectedInterfaces: string[] = [];

        // Check for supportsInterface function to detect ERC165
        const hasSupportsInterface = functionsParam.includes(
          "supportsInterface(bytes4)"
        );
        if (hasSupportsInterface) {
          detectedInterfaces.push("ERC165");
        }

        // Check for Diamond/EIP-2535 proxy pattern
        const isDiamondProxy = functionsParam.some(
          (func: string) =>
            func.includes("facet") ||
            func.includes("diamond") ||
            func.includes("getDefaultFacetAddresses") ||
            func.includes("facets")
        );

        if (isDiamondProxy) {
          console.log(
            "🔍 [DETECT] Diamond/EIP-2535 proxy pattern detected - continuing with token type scoring"
          );
          detectedInterfaces.push("Diamond");
          // Add a score for Diamond but don't return early - let scoring determine final type
          scores["Diamond"] = (scores["Diamond"] || 0) + 0.5;
        }

        // Score functions
        console.log("🔍 [DETECT] Scoring functions...");
        functionsParam.forEach((func: string) => {
          const funcInfo = FUNCTIONS[func as keyof typeof FUNCTIONS];
          if (funcInfo) {
            console.log(
              `🔍 [DETECT] Matched function: ${func} -> ${funcInfo.type} (${funcInfo.weight})`
            );
            if (funcInfo.type === "SHARED") {
              // Add weight to all shared types
              funcInfo.sharedTypes?.forEach((sharedType: string) => {
                scores[sharedType] =
                  (scores[sharedType] || 0) + funcInfo.weight;
                console.log(
                  `🔍 [DETECT] Added to shared type: ${sharedType} = ${scores[sharedType]}`
                );
              });
            } else {
              scores[funcInfo.type] =
                (scores[funcInfo.type] || 0) + funcInfo.weight;
              console.log(
                `🔍 [DETECT] Added to type: ${funcInfo.type} = ${scores[funcInfo.type]}`
              );
            }
          } else {
            // Log unmatched functions for debugging
            if (
              func.includes("transfer") ||
              func.includes("balance") ||
              func.includes("owner") ||
              func.includes("token")
            ) {
              console.log(`🔍 [DETECT] Unmatched token-like function: ${func}`);
            }
          }
        });

        // Score events
        eventsParam.forEach((event: string) => {
          const eventInfo = EVENTS[event as keyof typeof EVENTS];
          if (eventInfo) {
            const type =
              eventInfo.type === "ERC20/ERC721"
                ? "ERC20"
                : eventInfo.type === "ERC721/ERC1155"
                  ? "ERC721"
                  : eventInfo.type;
            scores[type] = (scores[type] || 0) + eventInfo.weight;
          }
        });

        // Calculate maximum possible scores for confidence calculation
        const maxScores: Record<string, number> = {
          ERC20: 6.5, // Core functions + important optional
          ERC721: 6.8, // Core functions + metadata + enumerable
          ERC1155: 6.8, // Core functions + metadata
          ERC777: 5.1, // Core functions + operators
          ERC4626: 10.4, // All vault functions
          ERC2981: 1.0, // Only royaltyInfo
        };

        console.log("🔍 Token Detection Scores:", scores);
        console.log("🔍 Detected Interfaces:", detectedInterfaces);

        // Determine type with confidence thresholds
        const minConfidence = 0.4; // 40% minimum confidence

        if ((scores.ERC20 || 0) >= minConfidence * maxScores.ERC20) {
          const confidence = Math.min(
            (scores.ERC20 || 0) / maxScores.ERC20,
            1.0
          );
          return {
            type: "ERC20",
            confidence,
            interfaces: detectedInterfaces,
            detectionMethod: "function+event+interface",
          };
        } else if ((scores.ERC721 || 0) >= minConfidence * maxScores.ERC721) {
          const confidence = Math.min(
            (scores.ERC721 || 0) / maxScores.ERC721,
            1.0
          );
          return {
            type: "ERC721",
            confidence,
            interfaces: detectedInterfaces,
            detectionMethod: "function+event+interface",
          };
        } else if ((scores.ERC1155 || 0) >= minConfidence * maxScores.ERC1155) {
          const confidence = Math.min(
            (scores.ERC1155 || 0) / maxScores.ERC1155,
            1.0
          );
          return {
            type: "ERC1155",
            confidence,
            interfaces: detectedInterfaces,
            detectionMethod: "function+event+interface",
          };
        } else if ((scores.ERC777 || 0) >= minConfidence * maxScores.ERC777) {
          const confidence = Math.min(
            (scores.ERC777 || 0) / maxScores.ERC777,
            1.0
          );
          return {
            type: "ERC777",
            confidence,
            interfaces: detectedInterfaces,
            detectionMethod: "function+event+interface",
          };
        } else if ((scores.ERC4626 || 0) >= minConfidence * maxScores.ERC4626) {
          const confidence = Math.min(
            (scores.ERC4626 || 0) / maxScores.ERC4626,
            1.0
          );
          return {
            type: "ERC4626",
            confidence,
            interfaces: detectedInterfaces,
            detectionMethod: "function+event+interface",
          };
        } else {
          // Default case - unknown token type
          return {
            type: "unknown",
            confidence: 0,
            interfaces: detectedInterfaces,
            detectionMethod: "function+event+interface",
          };
        }

        try {
          // Use working RPC endpoints for different networks
          const rpcUrl = selectedNetwork?.rpcUrl || SUPPORTED_CHAINS[0].rpcUrl;

          console.log("Creating provider with RPC URL:", rpcUrl);
          const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
          const contract = new ethers.Contract(contractAddress, abi, provider);

          console.log("Provider created successfully");
          console.log("Contract instance created");

          // Test the provider connection
          try {
            const blockNumber = await provider.getBlockNumber();
            console.log(
              "Provider connection test - current block:",
              blockNumber
            );
          } catch (providerError) {
            console.error("Provider connection failed:", providerError);
          }

          // Perform universal token detection with our universal ABI
          console.log("🔍 Using universal token detection approach...");
          const tokenDetection = await detectTokenTypeUniversal(
            contractAddress,
            provider
          );

          // Enhanced detection specifically for Diamond contracts
          console.log("🔍 Performing enhanced Diamond contract detection...");
          let enhancedDetection = { ...tokenDetection };

          // If Diamond detected but no token type, try additional detection methods
          if (tokenDetection.isDiamond && tokenDetection.type === "unknown") {
            console.log(
              "🔍 Diamond detected but no token type - trying enhanced detection..."
            );

            // Try direct function calls for ERC721 detection
            try {
              const testContract = new ethers.Contract(
                contractAddress,
                [
                  "function name() view returns (string)",
                  "function symbol() view returns (string)",
                  "function ownerOf(uint256) view returns (address)",
                  "function tokenURI(uint256) view returns (string)",
                ],
                provider
              );

              const [name, symbol] = await Promise.all([
                testContract.name().catch(() => null),
                testContract.symbol().catch(() => null),
              ]);

              if (name && symbol) {
                console.log(
                  `✅ Enhanced detection found token: ${name} (${symbol})`
                );

                // Try ERC721 specific functions
                try {
                  await testContract.ownerOf(1);
                  console.log(
                    "✅ ERC721 ownerOf() succeeded - contract is ERC721"
                  );
                  enhancedDetection.type = "ERC721";
                  enhancedDetection.confidence = 0.9;
                  enhancedDetection.detectionMethod =
                    "enhanced-erc721-detection";
                  enhancedDetection.tokenInfo = { name, symbol, decimals: 0 };
                } catch (ownerOfError) {
                  console.log("❌ ownerOf() failed - not ERC721");
                }
              }
            } catch (enhancedError) {
              console.log("❌ Enhanced detection failed:", enhancedError);
            }
          }

          const erc20 = enhancedDetection.type === "ERC20";
          const erc721 = enhancedDetection.type === "ERC721";
          const erc1155 = enhancedDetection.type === "ERC1155";
          const erc777 = enhancedDetection.type === "ERC777";
          const erc4626 = enhancedDetection.type === "ERC4626";
          const erc2981 = enhancedDetection.type === "ERC2981";
          const diamond = !!(
            enhancedDetection.type === "Diamond" || enhancedDetection.isDiamond
          );

          // Prefer ERC165-based universal detection elsewhere; only set here if we still don't know
          if (!tokenDetection || tokenDetection.type === "unknown") {
            setTokenDetection(enhancedDetection);
            setIsERC20(erc20);
            setIsERC721(erc721);
            setIsERC1155(erc1155);
            setIsERC777(erc777);
            setIsERC4626(erc4626);
            setIsERC2981(erc2981);
          }
          // Always reflect diamond styling if detected
          setIsDiamond(diamond);

          console.log("🎯 ENHANCED token snapshot (non-authoritative):", {
            erc20,
            erc721,
            erc1155,
            erc777,
            erc4626,
            erc2981,
            diamond,
            detectionType: enhancedDetection.type,
            confidence: enhancedDetection.confidence,
            detectionMethod: enhancedDetection.detectionMethod,
            isDiamond: enhancedDetection.isDiamond,
            tokenInfo: enhancedDetection.tokenInfo,
          });

          console.log(`🔍 Enhanced Token Detection:`);
          console.log(`   Type: ${enhancedDetection.type}`);
          console.log(
            `   Confidence: ${Math.round(enhancedDetection.confidence * 100)}%`
          );
          console.log(
            `   Detection Method: ${enhancedDetection.detectionMethod}`
          );
          console.log(
            `   Interfaces: ${enhancedDetection.type ? [enhancedDetection.type].join(", ") : "None"}`
          );
          console.log(`   Is Diamond: ${enhancedDetection.isDiamond || false}`);
          console.log(`   Token Info:`, enhancedDetection.tokenInfo);
          console.log(`   Error:`, enhancedDetection.error);

          // Additional debugging for Diamond contracts
          if (enhancedDetection.isDiamond) {
            console.log(`🔍 Diamond Contract Debug:`);
            console.log(`   Address: ${contractAddress}`);
            console.log(
              `   Network: ${selectedNetwork?.name} (ID: ${selectedNetwork?.id})`
            );
            console.log(`   Token Type Detection: ${enhancedDetection.type}`);
            console.log(
              `   Enhanced Detection Used: ${enhancedDetection.detectionMethod.includes("enhanced")}`
            );
          }

          // Universal token detection results processing
          if (tokenDetection.type !== "unknown" && tokenDetection.tokenInfo) {
            console.log(
              `🎯 [UNIVERSAL] Processing detected ${tokenDetection.type} token...`
            );

            const { name, symbol, decimals } = tokenDetection.tokenInfo || {
              name: undefined,
              symbol: undefined,
              decimals: undefined,
            };
            console.log(`🎯 [UNIVERSAL] Token info:`, {
              name,
              symbol,
              decimals,
              isDiamond: tokenDetection.isDiamond,
            });

            // Format contract name based on token type
            let formattedName = contractName;
            if (!preserveContractName && symbol) {
              formattedName = `${tokenDetection.type}.${symbol}`;
              console.log(
                `🎯 [UNIVERSAL] Setting formatted name: ${formattedName}`
              );
              setContractName(formattedName);
            }

            // Set token info
            setTokenInfo({
              name: name || `${tokenDetection.type} Token`,
              symbol: symbol || tokenDetection.type,
              decimals:
                decimals ||
                (tokenDetection.type === "ERC20" ||
                tokenDetection.type === "ERC777"
                  ? 18
                  : 0),
            });

            console.log(
              `✅ [UNIVERSAL] Token detection and processing complete!`
            );
            return {
              type: "unknown",
              confidence: 0,
              interfaces: [],
              detectionMethod: "universal-skipped",
            }; // Skip all old token handling logic
          }

          // Fallback to old logic only if universal detection failed
          if (tokenDetection.type === "ERC20") {
            console.log("Detected ERC20 token, fetching info...");
            console.log("Calling contract methods...");
            const [name, symbol, decimals] = await Promise.all([
              contract.name().catch((err: unknown) => {
                console.error("Name call failed:", err);
                return "Unknown Token";
              }),
              contract.symbol().catch((err: unknown) => {
                console.error("Symbol call failed:", err);
                return "UNKNOWN";
              }),
              contract.decimals().catch((err: unknown) => {
                console.error("Decimals call failed:", err);
                return 18;
              }),
            ]);

            console.log("Token info successfully fetched:", {
              name,
              symbol,
              decimals,
            });

            // Preserve contract name from ABI fetch if it was already set
            const shouldPreserve =
              preserveContractName ||
              (contractName &&
                contractName !== "Smart Contract" &&
                contractName !== "ERC20 Token" &&
                contractName !== "Unknown Token" &&
                contractName !== "Unknown Contract" &&
                !contractName.startsWith("ERC") &&
                !contractName.startsWith("Unknown"));

            if (shouldPreserve) {
              console.log(
                `🔍 [SimpleGridUI] Preserving existing name: ${contractName} (not overriding with ERC20 name: ${name})`
              );
            } else {
              // Format as ERC20.SYMBOL.DECIMALS
              const formattedName = `ERC20.${symbol}.${decimals}`;
              console.log(
                `🔍 [SimpleGridUI] Overriding with ERC20 name: ${formattedName} (current: ${contractName})`
              );
              setContractName(formattedName);
            }
            setTokenInfo({ name, symbol, decimals });
          } else if (tokenDetection.type === "ERC721") {
            console.log("🎨 Detected ERC721 NFT, fetching info...");
            console.log(
              "🎨 Available contract functions:",
              Object.keys(contract.functions || {})
            );

            // Check if name and symbol functions exist in the ABI
            const hasNameFunction = abi.some(
              (item: any) => item.type === "function" && item.name === "name"
            );
            const hasSymbolFunction = abi.some(
              (item: any) => item.type === "function" && item.name === "symbol"
            );

            console.log("🎨 ABI has name function:", hasNameFunction);
            console.log("🎨 ABI has symbol function:", hasSymbolFunction);

            let name = "Unknown NFT";
            let symbol = "NFT";

            // Try to get name and symbol, with enhanced fallbacks
            if (hasNameFunction && hasSymbolFunction) {
              try {
                const [fetchedName, fetchedSymbol] = await Promise.all([
                  contract.name().catch((err: unknown) => {
                    console.error("❌ NFT name call failed:", err);
                    return null;
                  }),
                  contract.symbol().catch((err: unknown) => {
                    console.error("❌ NFT symbol call failed:", err);
                    return null;
                  }),
                ]);

                name = fetchedName || name;
                symbol = fetchedSymbol || symbol;
                console.log("✅ NFT info successfully fetched:", {
                  name,
                  symbol,
                });
              } catch (error) {
                console.error("❌ Failed to fetch NFT info:", error);
              }
            } else {
              console.log(
                "🎨 Missing name/symbol functions in ABI, using defaults"
              );
            }

            // Preserve contract name from ABI fetch if it was already set
            const shouldPreserve =
              preserveContractName ||
              (contractName &&
                contractName !== "Smart Contract" &&
                contractName !== "ERC721 NFT" &&
                contractName !== "Unknown NFT" &&
                contractName !== "Unknown Contract" &&
                !contractName.startsWith("ERC") &&
                !contractName.startsWith("Unknown"));

            if (shouldPreserve) {
              console.log(
                `🔍 [SimpleGridUI] Preserving existing name: ${contractName} (ERC721 detected: ${name})`
              );
            } else {
              // Format as ERC721.SYMBOL
              const formattedName = `ERC721.${symbol}`;
              console.log(
                `🔍 [SimpleGridUI] Setting ERC721 name: ${formattedName} (was: ${contractName})`
              );
              setContractName(formattedName);
            }
            setTokenInfo({ name, symbol, decimals: 0 });
          } else if (tokenDetection.type === "ERC1155") {
            console.log("🎭 Detected ERC1155 Multi-Token, fetching info...");
            console.log(
              "🎭 Contract instance functions available:",
              Object.keys(contract.functions || {})
            );
            console.log("🎭 Current contractName state:", contractName);
            console.log("🎭 Current tokenInfo state:", tokenInfo);

            // For ERC1155, we need to ensure we have the token functions
            // Some ABIs might not include all token functions, so create a fallback contract
            let erc1155Contract = contract;

            // Check if current contract has token functions, if not create a new one with minimal token ABI
            const hasTokenFunctions =
              contract.functions?.name && contract.functions?.symbol;
            if (!hasTokenFunctions) {
              console.log(
                "🎭 Token functions not available in current ABI, creating fallback contract..."
              );

              const erc1155ABI = [
                "function name() view returns (string)",
                "function symbol() view returns (string)",
                "function uri(uint256) view returns (string)",
              ];

              erc1155Contract = new ethers.Contract(
                contractAddress,
                erc1155ABI,
                provider
              );

              console.log(await erc1155Contract.name());
              console.log(
                "🎭 Created fallback ERC1155 contract with token functions"
              );
            }

            // Try to fetch token info with better error handling
            let name = "Multi-Token";
            let symbol = "MTK";

            try {
              const tokenName = await contract.name();
              const tokenSymbol = await contract.symbol();
              if (tokenName) name = tokenName;
              if (tokenSymbol) symbol = tokenSymbol;
            } catch (err) {
              console.error("🎭 ERC1155 name call failed:", err);
            }

            try {
              if (
                erc1155Contract.functions?.symbol &&
                typeof erc1155Contract.functions.symbol === "function"
              ) {
                const tokenSymbol = await erc1155Contract.symbol();
                if (tokenSymbol) symbol = tokenSymbol;
                console.log(
                  "🎭 ERC1155 symbol fetched successfully:",
                  tokenSymbol
                );
              } else {
                console.log("🎭 symbol() function not available in contract");
              }
            } catch (err) {
              console.error("🎭 ERC1155 symbol call failed:", err);
            }

            console.log("🎭 ERC1155 info result:", { name, symbol });
            console.log("🎭 About to setTokenInfo and contractName...");

            // Preserve contract name from ABI fetch if it was already set
            const shouldPreserve =
              preserveContractName ||
              (contractName &&
                contractName !== "ERC1155 Token" &&
                contractName !== "Multi-Token" &&
                contractName !== "Unknown Contract" &&
                !contractName.startsWith("ERC") &&
                !contractName.startsWith("Unknown"));

            if (shouldPreserve) {
              console.log(
                `🔍 [SimpleGridUI] Preserving existing name: ${contractName} (not overriding with ERC1155 name: ${name})`
              );
            } else {
              // Format as ERC1155.SYMBOL
              const formattedName = `ERC1155.${symbol}`;
              console.log(
                `🔍 [SimpleGridUI] Overriding with ERC1155 name: ${formattedName} (current: ${contractName})`
              );
              setContractName(formattedName);
            }

            const finalTokenInfo = { name, symbol, decimals: 0 };
            console.log("🎭 Setting tokenInfo to:", finalTokenInfo);
            setTokenInfo(finalTokenInfo);
            console.log("🎭 tokenInfo set completed");
          } else if (tokenDetection.type === "ERC777") {
            console.log("Detected ERC777 Token, fetching info...");
            const [name, symbol, decimals] = await Promise.all([
              contract.name().catch((err: unknown) => {
                console.error("ERC777 name call failed:", err);
                return "ERC777 Token";
              }),
              contract.symbol().catch((err: unknown) => {
                console.error("ERC777 symbol call failed:", err);
                return "777";
              }),
              contract.decimals().catch((err: unknown) => {
                console.error("ERC777 decimals call failed:", err);
                return 18;
              }),
            ]);

            console.log("ERC777 info successfully fetched:", {
              name,
              symbol,
              decimals,
            });

            // Preserve contract name from ABI fetch if it was already set
            const shouldPreserve =
              preserveContractName ||
              (contractName &&
                contractName !== "ERC777 Token" &&
                contractName !== "Unknown Contract" &&
                !contractName.startsWith("ERC") &&
                !contractName.startsWith("Unknown"));

            if (shouldPreserve) {
              console.log(
                `🔍 [SimpleGridUI] Preserving existing name: ${contractName} (not overriding with ERC777 name: ${name})`
              );
            } else {
              // Format as ERC777.SYMBOL.DECIMALS
              const formattedName = `ERC777.${symbol}.${decimals}`;
              console.log(
                `🔍 [SimpleGridUI] Overriding with ERC777 name: ${formattedName} (current: ${contractName})`
              );
              setContractName(formattedName);
            }
            setTokenInfo({ name, symbol, decimals });
          } else if (tokenDetection.type === "ERC4626") {
            console.log("Detected ERC4626 Tokenized Vault, fetching info...");
            const [name, symbol, decimals, assetAddress] = await Promise.all([
              contract.name().catch((err: unknown) => {
                console.error("ERC4626 name call failed:", err);
                return "Tokenized Vault";
              }),
              contract.symbol().catch((err: unknown) => {
                console.error("ERC4626 symbol call failed:", err);
                return "VAULT";
              }),
              contract.decimals().catch((err: unknown) => {
                console.error("ERC4626 decimals call failed:", err);
                return 18;
              }),
              contract.asset().catch((err: unknown) => {
                console.error("ERC4626 asset call failed:", err);
                return "0x0000000000000000000000000000000000000000";
              }),
            ]);

            console.log("ERC4626 info successfully fetched:", {
              name,
              symbol,
              decimals,
              assetAddress,
            });

            // Preserve contract name from ABI fetch if it was already set
            const shouldPreserve =
              preserveContractName ||
              (contractName &&
                contractName !== "ERC4626 Vault" &&
                contractName !== "Tokenized Vault" &&
                contractName !== "Unknown Contract" &&
                !contractName.startsWith("ERC") &&
                !contractName.startsWith("Unknown"));

            if (shouldPreserve) {
              console.log(
                `🔍 [SimpleGridUI] Preserving existing name: ${contractName} (not overriding with ERC4626 name: ${name})`
              );
            } else {
              // Format as ERC4626.SYMBOL.DECIMALS
              const formattedName = `ERC4626.${symbol}.${decimals}`;
              console.log(
                `🔍 [SimpleGridUI] Overriding with ERC4626 name: ${formattedName} (current: ${contractName})`
              );
              setContractName(formattedName);
            }
            setTokenInfo({ name, symbol, decimals, assetAddress });
          } else if (
            tokenDetection.isDiamond ||
            tokenDetection.type === "Diamond"
          ) {
            console.log("💎 Detected Diamond/EIP-2535 proxy contract");

            // For Diamond contracts, fetch token info from the facets if it's also a token
            let finalName = contractName;
            let tokenSymbol: string | undefined;
            let tokenDecimals: number | undefined;

            try {
              // Try to get token info - this will call through to the facets
              if (functionsParam.includes("symbol")) {
                tokenSymbol = await contract.symbol();
                console.log(`🔍 [Diamond] Fetched symbol: ${tokenSymbol}`);
              }

              if (functionsParam.includes("decimals")) {
                tokenDecimals = await contract.decimals();
                console.log(`🔍 [Diamond] Fetched decimals: ${tokenDecimals}`);
              }

              // Format name as TOKEN_TYPE.SYMBOL if we have the info
              if (tokenSymbol && finalName) {
                // If it's also a token, format accordingly
                if (isERC721) {
                  finalName = `ERC721.${tokenSymbol}`;
                } else if (isERC20) {
                  finalName = `ERC20.${tokenSymbol}.${tokenDecimals}`;
                } else if (isERC1155) {
                  finalName = `ERC1155.${tokenSymbol}`;
                } else {
                  finalName = `Diamond.${tokenSymbol}`;
                }
              }
            } catch (error) {
              console.log(
                "🔍 [Diamond] Could not fetch token info from facets:",
                error
              );
              // Fall back to original name or default
              if (!finalName || finalName === "Unknown Contract") {
                finalName = "Diamond Contract";
              }
            }

            setContractName(finalName);

            // Set token info if available
            if (tokenSymbol !== undefined) {
              setTokenInfo({
                name: finalName,
                symbol: tokenSymbol,
                decimals: tokenDecimals || 0,
              });
            } else {
              setTokenInfo(null);
            }
          } else if (isERC2981) {
            console.log("Detected ERC2981 Royalty Standard contract");
            // ERC2981 is just a royalty standard, not a token standard itself
            // So we should treat it as a regular contract with royalty support
            let contractNameFound = false;

            // Check if name function exists in ABI
            const hasNameFunction = functionsParam.includes("name");
            if (hasNameFunction) {
              try {
                const name = await contract.name();
                if (name && name !== "Unknown Contract") {
                  setContractName(name);
                  contractNameFound = true;
                  console.log("ERC2981 contract name found:", name);
                }
              } catch (error) {
                console.error("Error fetching ERC2981 contract name:", error);
              }
            }

            if (!contractNameFound && !contractName) {
              setContractName("Royalty Contract");
            }
            setTokenInfo(null);
          } else {
            // Try to get contract name if it has a name function
            let contractNameFound = false;

            // Check if name function exists in ABI
            const hasNameFunction = functionsParam.includes("name");

            if (hasNameFunction) {
              try {
                const name = await contract.name();
                console.log("Contract name fetched:", name);

                // Preserve contract name from ABI fetch if it was already set
                const shouldOverride =
                  !preserveContractName &&
                  (!contractName ||
                    contractName === "Smart Contract" ||
                    contractName.startsWith("Unknown") ||
                    contractName.startsWith("ERC"));

                if (shouldOverride) {
                  console.log(
                    `🔍 [SimpleGridUI] Overriding with contract.name(): ${name} (current: ${contractName})`
                  );
                  setContractName(name || "Smart Contract");
                } else {
                  console.log(
                    `🔍 [SimpleGridUI] PRESERVING Sourcify name: ${contractName} (ignoring contract.name(): ${name})`
                  );
                }
                setTokenInfo(null);
                contractNameFound = true;
              } catch (error) {
                console.log("Name function exists but call failed:", error);
              }
            }

            // Simplified: just try name() function if it exists
            if (!contractNameFound && !hasNameFunction) {
              console.log("No name function found in ABI, skipping name fetch");
            }

            // Removed contract type determination logic to prevent overriding actual contract names
            // Contract names from Sourcify/Blockscout/Etherscan should be preserved
            console.log(
              `🔍 [SimpleGridUI] Contract name resolution complete - final name: ${contractName}`
            );
            setTokenInfo(null);
          }
        } catch (fetchError) {
          console.error("Failed to fetch contract info:", fetchError);

          // Only set fallback names for token contracts, preserve other contract names
          if (
            !preserveContractName &&
            (!contractName ||
              contractName.startsWith("Unknown") ||
              contractName.startsWith("ERC"))
          ) {
            if (isERC20) {
              setContractName("ERC20 Token");
              setTokenInfo({
                name: "ERC20 Token",
                symbol: "TOKEN",
                decimals: 18,
              });
            } else if (isERC721) {
              setContractName("ERC721 NFT");
              setTokenInfo({ name: "ERC721 NFT", symbol: "NFT", decimals: 0 });
            } else if (isERC1155) {
              setContractName("ERC1155 Multi-Token");
              setTokenInfo({
                name: "ERC1155 Multi-Token",
                symbol: "MTK",
                decimals: 0,
              });
            } else if (isERC777) {
              setContractName("ERC777 Token");
              setTokenInfo({
                name: "ERC777 Token",
                symbol: "777",
                decimals: 18,
              });
            } else if (isERC4626) {
              setContractName("ERC4626 Vault");
              setTokenInfo({
                name: "ERC4626 Vault",
                symbol: "VAULT",
                decimals: 18,
              });
            } else if (isDiamond) {
              setContractName("Diamond Proxy");
              setTokenInfo(null);
            } else if (isERC2981) {
              setContractName("Royalty Contract");
              setTokenInfo({
                name: "Royalty Contract",
                symbol: "ROYALTY",
                decimals: 0,
              });
            } else {
              // Don't override with "Smart Contract" - preserve existing name or leave unset
              if (!contractName) {
                setContractName("Unknown Contract");
              }
              setTokenInfo(null);
            }
          } else {
            setTokenInfo(null);
          }
        }
      };
    } catch (error) {
      console.error("Error in detectAndFetchTokenInfo:", error);
      setTokenInfo(null);
    } finally {
      // Always reset loading state
      setIsLoadingContractInfo(false);
    }
  };

  const generateCallData = useCallback(
    (functionSignature: string, inputs: string[] = []) => {
      try {
        if (!contractInfo?.abi) return "0x";

        const parsedABI = JSON.parse(contractInfo.abi);
        const targetFunction = parsedABI.find(
          (item: {
            type: string;
            name?: string;
            inputs?: { type: string }[];
          }) => {
            if (item.type === "function" && item.name) {
              const sig = `${item.name}(${item.inputs?.map((input) => input.type).join(",") || ""})`;
              return sig === functionSignature;
            }
            return false;
          }
        );

        if (!targetFunction || !targetFunction.name) return "0x";

        const iface = new ethers.utils.Interface([targetFunction]);
        const calldata = iface.encodeFunctionData(targetFunction.name, inputs);
        return calldata;
      } catch (error) {
        console.error("Calldata generation error:", error);
        return "0x";
      }
    },
    [contractInfo?.abi]
  );

  const handleFunctionSelect = (value: string) => {
    setSelectedFunction(value);

    if (value && value !== "" && value !== "Select function") {
      const [type, index] = value.split("-");
      const functions = type === "read" ? readFunctions : writeFunctions;
      const func = functions[parseInt(index)];

      if (func) {
        setSelectedFunctionObj(func);
        // Initialize input values for the selected function
        const initialInputs: { [key: string]: string } = {};
        func.inputs?.forEach((input, idx) => {
          initialInputs[`${func.name}_${idx}`] = "";
        });
        setFunctionInputs(initialInputs);

        // Generate initial calldata with empty parameters
        const signature = `${func.name}(${func.inputs?.map((input) => input.type).join(",")})`;
        const emptyParams = new Array(func.inputs?.length || 0).fill("");
        const calldata = generateCallData(signature, emptyParams);
        setGeneratedCallData(calldata);
      }
    } else {
      setSelectedFunctionObj(null);
      setFunctionInputs({});
      setGeneratedCallData("0x");
    }
  };

  const updateCallData = useCallback(() => {
    console.log("🔄 updateCallData called");
    console.log("🔄 selectedFunctionObj:", selectedFunctionObj?.name);
    console.log("🔄 functionInputs keys:", Object.keys(functionInputs));
    console.log("🔄 has ABI:", !!contractInfo?.abi);

    if (selectedFunctionObj && contractInfo?.abi) {
      const signature = `${selectedFunctionObj.name}(${selectedFunctionObj.inputs?.map((input) => input.type).join(",")})`;
      console.log("🔄 Function signature:", signature);

      const params =
        selectedFunctionObj.inputs?.map((input, idx) => {
          const key = `${selectedFunctionObj.name}_${idx}`;
          const value = functionInputs[key] || "";
          console.log(
            `🔄 Parameter ${idx} (${input.type}): ${key} = "${value}"`
          );
          return value;
        }) || [];

      console.log("🔄 Final params array:", params);
      const calldata = generateCallData(signature, params);
      console.log("🔄 Generated calldata:", calldata);
      console.log("🔄 Setting calldata state...");
      setGeneratedCallData(calldata);
    } else {
      console.log("🔄 Cannot update calldata - missing function or ABI");
    }
  }, [
    selectedFunctionObj,
    functionInputs,
    contractInfo?.abi,
    generateCallData,
  ]);

  const handleInputChange = (inputKey: string, value: string) => {
    setFunctionInputs((prev) => {
      const newInputs = {
        ...prev,
        [inputKey]: value,
      };
      // Log the change for debugging
      console.log(`🔄 Input changed: ${inputKey} = ${value}`);
      console.log(`🔄 All inputs:`, newInputs);
      return newInputs;
    });
  };

  const handleFetchABI = async () => {
    if (!selectedNetwork || !contractAddress) {
      setAbiError("Please enter a contract address and select a network");
      return;
    }

    // Validate address format
    if (!contractAddress.startsWith("0x") || contractAddress.length !== 42) {
      setAbiError("Invalid contract address format");
      return;
    }

    setIsLoadingABI(true);
    setAbiError(null);
    setAbiSource(null);

    try {
      console.log("🔍 Starting comprehensive contract fetch...");

      // Use the comprehensive contract fetcher
      const result = await fetchContractInfoComprehensive(
        contractAddress,
        selectedNetwork
      );

      if (result.success && result.abi) {
        console.log("✅ Contract found via comprehensive search");

        try {
          const parsedABI = JSON.parse(result.abi);
          const contractInfoObj: ContractInfo = {
            address: result.address,
            chain: result.chain,
            abi: result.abi,
            verified: true,
          };

          setContractInfo(contractInfoObj);
          setAbiError(null);
          categorizeABIFunctions(parsedABI, true);

          /* eslint-disable @typescript-eslint/no-explicit-any */
          // Run token standard detection even when ABI comes from comprehensive search
          const functionNames = parsedABI
            .filter((item: any) => item.type === "function")
            .map((item: any) => (item as ethers.utils.FunctionFragment).name);

          const eventSignatures = parsedABI
            .filter((item: any) => item.type === "event")
            .map((item: any) => {
              const event = item as ethers.utils.EventFragment;
              const inputs = event.inputs
                .map((input) => {
                  if (input.type === "tuple") {
                    return `(${input.components?.map((comp: ethers.utils.ParamType) => comp.type).join(",")})`;
                  }
                  return input.type;
                })
                .join(",");
              return `${event.name}(${inputs})`;
            });
          /* eslint-enable @typescript-eslint/no-explicit-any */

          await detectAndFetchTokenInfo(
            parsedABI,
            true,
            functionNames,
            eventSignatures
          );

          // Set contract name from search result
          if (result.contractName) {
            console.log(
              "🔍 [SimpleGridUI] Setting contract name from search result:",
              result.contractName
            );
            setContractName(result.contractName);
          }

          // Set token info if available
          if (result.tokenInfo) {
            console.log(
              "🔍 [SimpleGridUI] Setting token info from search result:",
              result.tokenInfo
            );
            setTokenInfo(result.tokenInfo);
          }

          // Set ABI source
          if (result.source) {
            console.log(
              "🔍 [SimpleGridUI] Setting ABI source from search result:",
              result.source
            );
            setAbiSource(result.source);
          }

          console.log(
            "✅ Contract loaded successfully from comprehensive search"
          );

          // Add a timeout to check if contract name changes
          setTimeout(() => {
            console.log(
              "🔍 [SimpleGridUI] Contract name check after 1s - should still be:",
              result.contractName
            );
          }, 1000);

          // Universal token detection independent of ABI (robust RPC + non-destructive)
          try {
            // Use chain RPC directly (env-backed)
            const rpcUrl = selectedNetwork.rpcUrl;

            const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

            // Always run ERC165 universal detection and prefer its result
            const result = await detectTokenType(provider, contractAddress);

            setTokenDetection({
              type: result.type,
              confidence: result.type === "unknown" ? 0 : 0.95,
              detectionMethod: result.method,
              isDiamond: result.isDiamond,
              tokenInfo: {
                name: result.name,
                symbol: result.symbol,
                decimals: result.decimals,
              },
            });
            setIsERC20(result.type === "ERC20");
            setIsERC721(result.type === "ERC721");
            setIsERC1155(result.type === "ERC1155");
            setIsDiamond(result.isDiamond);

            if (result.isDiamond) {
              await loadDiamondFacets(contractAddress, selectedNetwork);
            }
          } catch (e) {
            console.log("Universal detector failed:", (e as Error)?.message);
          }
        } catch (parseError) {
          console.error("Error parsing ABI from search result:", parseError);
          setAbiError("Failed to parse contract ABI");
        }
      } else {
        // Fallback to original ABI fetch if comprehensive search fails
        console.log(
          "⚠️ Comprehensive search failed, falling back to original ABI fetch"
        );
        await fetchContractABI(contractAddress, selectedNetwork);
      }
    } catch (error) {
      console.error("Error in comprehensive contract fetch:", error);
      setAbiError("Network error occurred while fetching contract information");
    } finally {
      setIsLoadingABI(false);
    }
  };

  const handleManualABI = async () => {
    if (!manualAbi.trim() || !contractAddress || !selectedNetwork) {
      setAbiError("Please provide a valid ABI JSON and contract address");
      return;
    }

    try {
      // Validate ABI by trying to parse it
      const parsedABI = JSON.parse(manualAbi.trim());

      const contractInfoObj: ContractInfo = {
        address: contractAddress,
        chain: selectedNetwork,
        abi: manualAbi.trim(),
        verified: false, // Mark as manually added
      };

      setContractInfo(contractInfoObj);
      setAbiError(null);
      setShowAbiUpload(false);
      categorizeABIFunctions(parsedABI);
      setAbiSource("manual"); // Set source as manual
      console.log("Manual ABI processed successfully");

      // Extract function names and event signatures for token detection
      const functionNames = parsedABI
        .filter((item: any) => item.type === "function")
        .map((item: any) => (item as ethers.utils.FunctionFragment).name);

      const eventSignatures = parsedABI
        .filter((item: any) => item.type === "event")
        .map((item: any) => {
          const event = item as ethers.utils.EventFragment;
          const inputs = event.inputs
            .map((input) => {
              if (input.type === "tuple") {
                return `(${input.components?.map((comp: ethers.utils.ParamType) => comp.type).join(",")})`;
              }
              return input.type;
            })
            .join(",");
          return `${event.name}(${inputs})`;
        });

      // Fetch token info with manual ABI
      await detectAndFetchTokenInfo(
        parsedABI,
        false,
        functionNames,
        eventSignatures
      ); // Don't preserve - this is a manual ABI input
    } catch (parseError) {
      console.error("Manual ABI parsing error:", parseError);
      setAbiError(
        "Invalid ABI JSON format. Please check your ABI and try again."
      );
    }
  };

  // Local storage functions
  const SAVED_CONTRACTS_KEY = "web3-toolkit-saved-contracts";

  // Helper function to format contract address display
  const formatContractAddress = (address: string): string => {
    if (address.length >= 8) {
      return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }
    return address;
  };

  // Helper function to format contract display with address
  const formatContractDisplay = (
    name: string,
    address: string,
    chainName: string
  ): string => {
    const formattedAddress = formatContractAddress(address);
    return `${name} on ${chainName}(${formattedAddress})`;
  };

  const saveContractToStorage = useCallback(
    (contractInfo: ContractInfo) => {
      try {
        const existing = JSON.parse(
          localStorage.getItem(SAVED_CONTRACTS_KEY) || "[]"
        );
        const contractKey = `${contractInfo.address.toLowerCase()}-${contractInfo.chain.id}`;

        const updated = existing.filter(
          (c: ContractInfo & { address: string; chain: { id: number } }) =>
            `${c.address.toLowerCase()}-${c.chain.id}` !== contractKey
        );

        // Use the best available name for saving (priority: actual name > fallback name)
        const nameToSave =
          contractName &&
          !contractName.startsWith("Smart Contract") &&
          !contractName.startsWith("Unknown") &&
          !contractName.startsWith("ERC")
            ? contractName
            : (contractInfo as any).name || contractName;

        updated.unshift({
          ...contractInfo,
          name: nameToSave, // Save the best contract name
          abiSource, // Save the ABI source
          tokenInfo, // Save token info if available
          savedAt: new Date().toISOString(),
        });

        // Keep only the last 50 contracts
        const trimmed = updated.slice(0, 50);
        localStorage.setItem(SAVED_CONTRACTS_KEY, JSON.stringify(trimmed));

        console.log("Contract saved to local storage with name:", nameToSave);
      } catch (saveError) {
        console.error("Failed to save contract:", saveError);
      }
    },
    [contractName, abiSource, tokenInfo]
  );

  const loadSavedContracts = (): ContractInfo[] => {
    try {
      return JSON.parse(localStorage.getItem(SAVED_CONTRACTS_KEY) || "[]");
    } catch (loadError) {
      console.error("Failed to load saved contracts:", loadError);
      return [];
    }
  };

  const loadContractFromStorage = async (
    savedContract: ContractInfo & {
      savedAt?: string;
      abiSource?: string;
      tokenInfo?: typeof tokenInfo;
    }
  ) => {
    // Clear previous detection and functions; keep card clean until fetch
    setContractName("");
    setTokenInfo(null);
    setAbiSource(null);
    setGeneratedCallData("0x");
    setSelectedFunction(null);
    setSelectedFunctionObj(null);
    setFunctionInputs({});
    setReadFunctions([]);
    setWriteFunctions([]);
    setContractInfo(null);
    setAbiError(null);

    // Only set address and network from saved entry
    setContractAddress(savedContract.address);
    setSelectedNetwork(savedContract.chain);

    // Optional display name only
    if (savedContract.name) {
      setContractName(savedContract.name);
    }

    // Do not restore token info, abi source, or run detection here.
  };

  // Auto-save when contract info is successfully loaded
  useEffect(() => {
    if (contractInfo && contractInfo.abi) {
      saveContractToStorage(contractInfo);
    }
  }, [contractInfo, contractName, abiSource, tokenInfo, saveContractToStorage]);

  // Update calldata when function inputs change
  useEffect(() => {
    updateCallData();
  }, [functionInputs, selectedFunctionObj]);

  const [savedContracts] = useState<ContractInfo[]>(loadSavedContracts());
  const [showSavedContracts, setShowSavedContracts] = useState(false);
  const [showAbiUpload, setShowAbiUpload] = useState(false);
  const [manualAbi, setManualAbi] = useState("");

  const cardStyle = {
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "20px",
  };

  const headerStyle = {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#fff",
    marginBottom: "8px",
  };

  const subHeaderStyle = {
    fontSize: "18px",
    fontWeight: "600",
    color: "#fff",
    marginBottom: "20px",
  };

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "30px",
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "20px",
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    background: "#2a2a2a",
    border: "1px solid #555",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    marginBottom: "8px",
  };

  const buttonStyle = {
    padding: "12px 20px",
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  };

  const selectionCardStyle = (isSelected: boolean) => ({
    padding: "16px",
    background: isSelected ? "#1e40af20" : "#2a2a2a",
    border: `2px solid ${isSelected ? "#007bff" : "#555"}`,
    borderRadius: "10px",
    cursor: "pointer",
    marginBottom: "12px",
    transition: "all 0.2s ease",
  });

  const loadDiamondFacets = useCallback(
    async (diamondAddress: string, chain: Chain) => {
      try {
        const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl, {
          name: chain.name,
          chainId: chain.id,
        });
        const loupe = new ethers.Contract(
          diamondAddress,
          [
            "function facetAddresses() view returns (address[])",
            "function facetFunctionSelectors(address) view returns (bytes4[])",
          ],
          provider
        );
        const facets: string[] = await loupe.facetAddresses();
        if (!Array.isArray(facets) || facets.length === 0) return;

        // Map: facet -> selectors
        const facetToSelectors: Record<string, string[]> = {};
        for (const f of facets) {
          try {
            const sel: string[] = await loupe.facetFunctionSelectors(f);
            facetToSelectors[f] = sel || [];
          } catch {
            facetToSelectors[f] = [];
          }
        }

        // For each facet, try fetch ABI and split into read/write
        const newRead: ethers.utils.FunctionFragment[] = [];
        const newWrite: ethers.utils.FunctionFragment[] = [];

        for (const f of facets) {
          try {
            const res = await fetchContractInfoComprehensive(f, chain);
            if (res.success && res.abi) {
              const parsed = JSON.parse(res.abi).filter(
                (i: any) => i.type === "function"
              );
              for (const item of parsed) {
                const frag = item as ethers.utils.FunctionFragment;
                if (
                  frag.stateMutability === "view" ||
                  frag.stateMutability === "pure"
                ) {
                  newRead.push(frag);
                } else {
                  newWrite.push(frag);
                }
              }
            }
          } catch {
            // ignore facet fetch errors
          }
        }

        if (newRead.length > 0 || newWrite.length > 0) {
          setReadFunctions(newRead);
          setWriteFunctions(newWrite);
        }
      } catch (e) {
        console.log("Diamond facet load failed:", (e as Error)?.message);
      }
    },
    []
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#fff",
        padding: "20px",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <h1 style={headerStyle}>New Simulation</h1>
        <p style={{ color: "#888", fontSize: "16px" }}>
          Configure and simulate blockchain transactions
        </p>
      </div>

      {/* Main Grid */}
      <div style={gridStyle}>
        {/* LEFT COLUMN - Contract */}
        <div style={cardStyle}>
          <h2 style={subHeaderStyle}>🔧 Contract</h2>

          {/* Contract Source Selection */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={selectionCardStyle(contractSource === "project")}
              onClick={() => setContractSource("project")}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "2px solid #007bff",
                    background:
                      contractSource === "project" ? "#007bff" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {contractSource === "project" && (
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#fff",
                      }}
                    ></div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: "500" }}>Select from Project</div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    Choose from saved contracts
                  </div>
                </div>
              </div>
            </div>

            <div
              style={selectionCardStyle(contractSource === "address")}
              onClick={() => setContractSource("address")}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "2px solid #007bff",
                    background:
                      contractSource === "address" ? "#007bff" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {contractSource === "address" && (
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#fff",
                      }}
                    ></div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: "500" }}>Insert any address</div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    Enter contract address manually
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contract Input */}
          {contractSource === "project" ? (
            <div style={{ marginBottom: "24px" }}>
              {savedContracts.length > 0 ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      marginBottom: "16px",
                    }}
                  >
                    <select
                      style={{ ...inputStyle, flex: 1 }}
                      onChange={async (e) => {
                        const index = parseInt(e.target.value);
                        if (!isNaN(index) && savedContracts[index]) {
                          await loadContractFromStorage(savedContracts[index]);
                          setContractSource("address"); // Switch to address mode to show details
                        }
                      }}
                    >
                      <option value="">Select saved contract...</option>
                      {savedContracts.map((contract, index) => (
                        <option key={index} value={index}>
                          {contract.name
                            ? formatContractDisplay(
                                contract.name,
                                contract.address,
                                contract.chain.name
                              )
                            : `${formatContractAddress(contract.address)} on ${contract.chain.name}`}
                        </option>
                      ))}
                    </select>
                    <button
                      style={buttonStyle}
                      onClick={() => setShowSavedContracts(!showSavedContracts)}
                    >
                      {showSavedContracts ? "Hide" : "Show"} All
                    </button>
                  </div>

                  {showSavedContracts && (
                    <div
                      style={{
                        maxHeight: "200px",
                        overflowY: "auto",
                        background: "#2a2a2a",
                        borderRadius: "8px",
                        padding: "12px",
                        marginBottom: "16px",
                      }}
                    >
                      {savedContracts.map((contract, index) => (
                        <div
                          key={index}
                          style={{
                            padding: "8px 12px",
                            marginBottom: "8px",
                            background: "#1a1a1a",
                            borderRadius: "6px",
                            cursor: "pointer",
                            border: "1px solid #333",
                          }}
                          onClick={async () => {
                            await loadContractFromStorage(contract);
                            setContractSource("address");
                            setShowSavedContracts(false);
                          }}
                        >
                          <div
                            style={{ fontWeight: "500", marginBottom: "4px" }}
                          >
                            {contract.name || "Unnamed Contract"}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#888",
                              fontFamily: "monospace",
                            }}
                          >
                            {contract.chain.name} (
                            {formatContractAddress(contract.address)})
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#666",
                              marginTop: "4px",
                            }}
                          >
                            Saved:{" "}
                            {new Date(
                              (contract as ContractInfo & { savedAt?: string })
                                .savedAt || Date.now()
                            ).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div
                  style={{
                    padding: "20px",
                    background: "#2a2a2a",
                    borderRadius: "8px",
                    textAlign: "center",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ color: "#888", marginBottom: "8px" }}>
                    No saved contracts
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Use "Insert any address" to fetch and save contracts
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <select style={{ ...inputStyle, flex: 1 }} disabled>
                  <option>Use saved contracts above</option>
                </select>
                <button style={{ ...buttonStyle, opacity: 0.5 }} disabled>
                  Edit source
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: "24px" }}>
              {/* Network Selection */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    color: "#ccc",
                    marginBottom: "8px",
                  }}
                >
                  Network
                </label>
                <select
                  style={inputStyle}
                  value={selectedNetwork?.id || ""}
                  onChange={(e) => {
                    const chainId = parseInt(e.target.value);
                    const chain = SUPPORTED_CHAINS.find(
                      (c) => c.id === chainId
                    );
                    setSelectedNetwork(chain || null);
                  }}
                >
                  {SUPPORTED_CHAINS.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contract Address Input */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    color: "#ccc",
                    marginBottom: "8px",
                  }}
                >
                  Contract Address
                </label>
                <div style={{ display: "flex", gap: "12px" }}>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={contractAddress}
                    onChange={(e) => {
                      const v = e.target.value;
                      setContractAddress(v);
                      // Reset all derived state to avoid stale data bleed
                      setTokenInfo(null);
                      setTokenDetection(null);
                      setIsERC20(false);
                      setIsERC721(false);
                      setIsERC1155(false);
                      setIsERC777(false);
                      setIsERC4626(false);
                      setIsERC2981(false);
                      setIsDiamond(false);
                      setReadFunctions([]);
                      setWriteFunctions([]);
                      setContractInfo(null);
                      setAbiSource(null);
                      setAbiError(null);
                    }}
                    style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }}
                  />
                  <button
                    style={{
                      ...buttonStyle,
                      background: isLoadingABI ? "#666" : "#22c55e",
                      cursor: isLoadingABI ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onClick={handleFetchABI}
                    disabled={
                      isLoadingABI || !contractAddress || !selectedNetwork
                    }
                  >
                    {isLoadingABI ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Search size={16} />
                    )}
                    {isLoadingABI ? "Searching..." : "Search & Fetch ABI"}
                  </button>
                </div>
              </div>

              {/* ABI Status */}
              {isLoadingABI && (
                <div
                  style={{
                    padding: "12px",
                    background: "#2a2a2a",
                    borderRadius: "8px",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#22c55e",
                    }}
                  >
                    <Loader2
                      size={16}
                      style={{
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    <span style={{ fontSize: "14px" }}>
                      Checking Sourcify → Blockscout → Etherscan...
                    </span>
                  </div>
                </div>
              )}

              {abiError && (
                <div
                  style={{
                    padding: "12px",
                    background: "#dc262620",
                    border: "1px solid #dc2626",
                    borderRadius: "8px",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "#dc2626",
                      }}
                    >
                      <XCircle size={16} />
                      <span style={{ fontSize: "14px" }}>{abiError}</span>
                    </div>
                    {contractAddress && selectedNetwork && (
                      <button
                        style={{
                          padding: "4px 8px",
                          background: "#6366f1",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: "500",
                        }}
                        onClick={() => setShowAbiUpload(true)}
                      >
                        Upload ABI
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Manual ABI Upload Modal */}
              {showAbiUpload && (
                <div
                  style={{
                    padding: "16px",
                    background: "#1a1a1a",
                    border: "1px solid #6366f1",
                    borderRadius: "8px",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "12px",
                    }}
                  >
                    <h4
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#6366f1",
                        margin: 0,
                      }}
                    >
                      Upload Contract ABI
                    </h4>
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        color: "#888",
                        cursor: "pointer",
                        fontSize: "16px",
                        padding: "2px",
                      }}
                      onClick={() => {
                        setShowAbiUpload(false);
                        setManualAbi("");
                        setAbiError(null);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: "#ccc",
                        marginBottom: "6px",
                      }}
                    >
                      Paste ABI JSON
                    </label>
                    <textarea
                      value={manualAbi}
                      onChange={(e) => setManualAbi(e.target.value)}
                      placeholder='[{"inputs": [], "name": "totalSupply", "outputs": [...], ...}]'
                      style={{
                        width: "100%",
                        minHeight: "120px",
                        padding: "8px",
                        background: "#2a2a2a",
                        border: "1px solid #555",
                        borderRadius: "6px",
                        color: "#fff",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        resize: "vertical",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      style={{
                        ...buttonStyle,
                        background: "#22c55e",
                        fontSize: "12px",
                        padding: "8px 16px",
                      }}
                      onClick={handleManualABI}
                      disabled={!manualAbi.trim()}
                    >
                      Process ABI
                    </button>
                    <button
                      style={{
                        ...buttonStyle,
                        background: "#6b7280",
                        fontSize: "12px",
                        padding: "8px 16px",
                      }}
                      onClick={() => {
                        setShowAbiUpload(false);
                        setManualAbi("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {contractInfo && (
                <div
                  style={{
                    position: "relative",
                    padding: "16px",
                    background: isDiamond ? "#1a1025" : "#1a1a1a",
                    border: isDiamond ? "1px solid #7c3aed" : "1px solid #333",
                    borderRadius: "12px",
                    marginBottom: "16px",
                    opacity: isLoadingContractInfo || isLoadingABI ? 0.6 : 1,
                    filter:
                      isLoadingContractInfo || isLoadingABI
                        ? "grayscale(0.2)"
                        : "none",
                  }}
                >
                  {isLoadingContractInfo && (
                    <div
                      style={{
                        position: "absolute",
                        top: "0",
                        left: "0",
                        right: "0",
                        bottom: "0",
                        background: "rgba(26, 26, 26, 0.9)",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "16px 24px",
                          background: "#2a2a2a",
                          borderRadius: "8px",
                          border: "1px solid #444",
                        }}
                      >
                        <Loader2
                          size={20}
                          style={{
                            color: "#22c55e",
                            animation: "spin 1s linear infinite",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "14px",
                            color: "#22c55e",
                            fontWeight: "500",
                          }}
                        >
                          Fetching contract details...
                        </span>
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "12px",
                        background: tokenInfo
                          ? (tokenInfo.decimals || 0) === 0
                            ? "linear-gradient(135deg, #f59e0b, #d97706)"
                            : "linear-gradient(135deg, #10b981, #059669)"
                          : "linear-gradient(135deg, #6366f1, #4f46e5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "24px",
                        border: "2px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                      }}
                    >
                      {(() => {
                        const badgeMap: Record<
                          number,
                          { label: string; color: string }
                        > = {
                          1: { label: "ETH", color: "#627EEA" },
                          8453: { label: "BASE", color: "#0052FF" },
                          137: { label: "POLY", color: "#8247E5" },
                          42161: { label: "ARB", color: "#28A0F0" },
                          10: { label: "OP", color: "#FF0420" },
                          56: { label: "BSC", color: "#F3BA2F" },
                          100: { label: "GNO", color: "#48A9A6" },
                        };
                        const badge = selectedNetwork
                          ? badgeMap[selectedNetwork.id]
                          : undefined;
                        const label =
                          badge?.label ||
                          (selectedNetwork?.name
                            ? selectedNetwork.name
                                .split(" ")[0]
                                .toUpperCase()
                                .slice(0, 3)
                            : "NET");
                        const color = badge?.color || "#9CA3AF";
                        return (
                          <span style={{ lineHeight: 0 }}>
                            <ChainIcon
                              chain={
                                (badge?.label as
                                  | "ETH"
                                  | "BASE"
                                  | "POLY"
                                  | "ARB"
                                  | "OP"
                                  | "BSC"
                                  | "GNO") || "ETH"
                              }
                              size={24}
                              rounded={8}
                            />
                          </span>
                        );
                      })()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: "600",
                          fontSize: "18px",
                          color: "#fff",
                          marginBottom: "6px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        {contractName}
                        {isDiamond && (
                          <span
                            title="Diamond contract"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "18px",
                              height: "18px",
                              borderRadius: "50%",
                              background: "rgba(124, 58, 237, 0.15)",
                              border: "1px solid rgba(124, 58, 237, 0.4)",
                              color: "#a78bfa",
                            }}
                          >
                            <Gem size={12} />
                          </span>
                        )}
                        {abiSource && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: "600",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                cursor: "help",
                                backgroundColor:
                                  abiSource === "sourcify"
                                    ? "rgba(34, 197, 94, 0.2)"
                                    : abiSource === "blockscout"
                                      ? "rgba(59, 130, 246, 0.2)"
                                      : abiSource === "etherscan"
                                        ? "rgba(168, 85, 247, 0.2)"
                                        : "rgba(107, 114, 128, 0.2)",
                                color:
                                  abiSource === "sourcify"
                                    ? "#22c55e"
                                    : abiSource === "blockscout"
                                      ? "#3b82f6"
                                      : abiSource === "etherscan"
                                        ? "#a855f7"
                                        : "#6b7280",
                              }}
                              title={`Contract ABI verified from ${abiSource.charAt(0).toUpperCase() + abiSource.slice(1)} - ${abiSource === "sourcify" ? "Source code verified with reproducible builds" : abiSource === "blockscout" ? "Verified contract explorer" : "Blockchain explorer verification"}`}
                            >
                              {abiSource}
                            </div>
                            <div
                              style={{
                                width: "16px",
                                height: "16px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "help",
                              }}
                              title={`Contract ABI verified from ${abiSource.charAt(0).toUpperCase() + abiSource.slice(1)} - ${abiSource === "sourcify" ? "Source code verified with reproducible builds" : abiSource === "blockscout" ? "Verified contract explorer" : "Blockchain explorer verification"}`}
                            >
                              {abiSource === "sourcify" && <SourcifyLogo />}
                              {abiSource === "blockscout" && <BlockscoutLogo />}
                              {abiSource === "etherscan" && <EtherscanLogo />}
                              {abiSource === "manual" && <ManualLogo />}
                            </div>
                          </div>
                        )}
                      </div>
                      {tokenInfo ||
                      isDiamond ||
                      tokenDetection?.type !== "unknown" ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "14px",
                              color:
                                (tokenInfo?.decimals || 0) === 0
                                  ? "#f59e0b"
                                  : "#10b981",
                              fontWeight: "600",
                              padding: "2px 8px",
                              background:
                                (tokenInfo?.decimals || 0) === 0
                                  ? "rgba(245, 158, 11, 0.1)"
                                  : "rgba(16, 185, 129, 0.1)",
                              borderRadius: "6px",
                              display: "inline-block",
                              width: "fit-content",
                            }}
                          >
                            {(() => {
                              console.log(
                                "🎯 UI RENDER - Token detection state:",
                                {
                                  tokenInfo: !!tokenInfo,
                                  isERC20,
                                  isERC721,
                                  isERC1155,
                                  isERC777,
                                  isERC4626,
                                  isERC2981,
                                  contractName,
                                  tokenSymbol: tokenInfo?.symbol,
                                }
                              );

                              const typeName = tokenInfo?.name || "";
                              const contractDisplayName = contractName || "";

                              // Use universal detection results
                              if (tokenDetection?.type) {
                                const confidence = Math.round(
                                  tokenDetection.confidence * 100
                                );
                                const confidenceColor =
                                  confidence >= 90
                                    ? "#22c55e"
                                    : confidence >= 70
                                      ? "#f59e0b"
                                      : "#ef4444";

                                let typeLabel = "";
                                let typeIcon = "";

                                switch (tokenDetection.type) {
                                  case "ERC1155":
                                    typeLabel = "ERC1155 Multi-Token";
                                    typeIcon = "🎭";
                                    break;
                                  case "ERC721":
                                    typeLabel = "ERC721 NFT";
                                    typeIcon = "🎨";
                                    break;
                                  case "ERC20":
                                    typeLabel = "ERC20 Token";
                                    typeIcon = "💰";
                                    break;
                                  case "ERC777":
                                    typeLabel = "ERC777 Token";
                                    typeIcon = "⚡";
                                    break;
                                  case "ERC4626":
                                    typeLabel = "ERC4626 Vault";
                                    typeIcon = "🏦";
                                    break;
                                  case "ERC2981":
                                    typeLabel = "Royalty Contract";
                                    typeIcon = "👑";
                                    break;
                                  default:
                                    typeLabel = "Unknown Token";
                                    typeIcon = "❓";
                                }

                                if (tokenDetection.isDiamond) {
                                  typeLabel = `💎 Diamond Proxy (${typeLabel})`;
                                } else {
                                  typeLabel = `${typeIcon} ${typeLabel}`;
                                }

                                return (
                                  <div>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                      }}
                                    >
                                      {tokenDetection.type &&
                                        (() => {
                                          const dec =
                                            tokenDetection?.tokenInfo
                                              ?.decimals ?? tokenInfo?.decimals;
                                          const effectiveType =
                                            tokenDetection.type;
                                          const bg =
                                            effectiveType === "ERC721"
                                              ? "rgba(139, 92, 246, 0.12)"
                                              : effectiveType === "ERC1155"
                                                ? "rgba(16, 185, 129, 0.12)"
                                                : effectiveType === "ERC20"
                                                  ? "rgba(245, 158, 11, 0.12)"
                                                  : "rgba(107, 114, 128, 0.12)";
                                          const fg =
                                            effectiveType === "ERC721"
                                              ? "#8b5cf6"
                                              : effectiveType === "ERC1155"
                                                ? "#10b981"
                                                : effectiveType === "ERC20"
                                                  ? "#f59e0b"
                                                  : "#6b7280";
                                          return (
                                            <span
                                              style={{
                                                fontSize: 11,
                                                fontWeight: 600,
                                                padding: "2px 8px",
                                                borderRadius: 12,
                                                backgroundColor: bg,
                                                color: fg,
                                                border:
                                                  "1px solid rgba(255,255,255,0.12)",
                                              }}
                                            >
                                              {effectiveType}
                                            </span>
                                          );
                                        })()}
                                    </div>
                                    {tokenDetection.error && (
                                      <div
                                        style={{
                                          fontSize: "11px",
                                          color: "#ef4444",
                                          marginTop: "2px",
                                          fontStyle: "italic",
                                        }}
                                      >
                                        Warning: {tokenDetection.error}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // Fallback to old detection logic
                              if (
                                isDiamond ||
                                contractDisplayName.includes("Diamond") ||
                                typeName.includes("Diamond")
                              ) {
                                return "💎 Diamond Proxy";
                              } else if (
                                isERC1155 ||
                                typeName.includes("ERC1155")
                              ) {
                                return "🎭 ERC1155 Multi-Token";
                              } else if (
                                isERC721 ||
                                typeName.includes("ERC721") ||
                                (tokenInfo?.decimals || 0) === 0
                              ) {
                                return "🎨 ERC721 NFT";
                              } else if (
                                isERC777 ||
                                typeName.includes("ERC777")
                              ) {
                                return "⚡ ERC777 Token";
                              } else if (
                                isERC4626 ||
                                typeName.includes("ERC4626")
                              ) {
                                return "🏦 ERC4626 Vault";
                              } else if (
                                isERC2981 ||
                                typeName.includes("Royalty")
                              ) {
                                return "👑 Royalty Contract";
                              } else if (
                                isERC20 ||
                                typeName.includes("ERC20")
                              ) {
                                return "💰 ERC20 Token";
                              } else {
                                return "💰 ERC20 Token";
                              }
                            })()}
                          </div>
                          {tokenDetection?.type &&
                            tokenDetection.type !== "unknown" && (
                              <div
                                style={{
                                  fontSize: "13px",
                                  color: "#ccc",
                                  fontWeight: "500",
                                }}
                              >
                                Symbol:{" "}
                                {tokenDetection?.tokenInfo?.symbol ||
                                  tokenInfo?.symbol ||
                                  (contractName?.includes(".")
                                    ? contractName.split(".").pop()
                                    : "Unknown")}
                                {(tokenDetection?.tokenInfo?.decimals !==
                                undefined
                                  ? tokenDetection.tokenInfo.decimals
                                  : tokenInfo?.decimals || 0) > 0 &&
                                  ` • ${tokenDetection?.tokenInfo?.decimals || tokenInfo?.decimals} decimals`}
                              </div>
                            )}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: "13px",
                            color: isDiamond
                              ? "#a78bfa"
                              : tokenDetection?.type === "unknown"
                                ? "#ef4444"
                                : "#6366f1",
                            fontWeight: "500",
                            padding: "2px 8px",
                            background: isDiamond
                              ? "rgba(124, 58, 237, 0.15)"
                              : tokenDetection?.type === "unknown"
                                ? "rgba(239, 68, 68, 0.1)"
                                : "rgba(99, 102, 241, 0.1)",
                            borderRadius: "6px",
                            display: "inline-block",
                            width: "fit-content",
                          }}
                        >
                          {tokenDetection?.type === "unknown"
                            ? isDiamond
                              ? ""
                              : "Unknown Contract Type"
                            : "Smart Contract"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: "12px",
                      borderTop: "1px solid #333",
                    }}
                  >
                    <div
                      style={{ display: "flex", gap: "16px", fontSize: "12px" }}
                    >
                      <span
                        style={{
                          color: "#22c55e",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        📖 {readFunctions.length} read functions
                      </span>
                      <span
                        style={{
                          color: "#f59e0b",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        ✍️ {writeFunctions.length} write functions
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#666" }}>
                      {selectedNetwork?.name}
                    </div>
                  </div>
                </div>
              )}

              {/* Contract Function Selection - Inside Contract Container */}
              {(readFunctions.length > 0 || writeFunctions.length > 0) && (
                <div
                  style={{
                    marginTop: "16px",
                    paddingTop: "16px",
                    borderTop: "1px solid #333",
                  }}
                >
                  <h4
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#ccc",
                      marginBottom: "12px",
                    }}
                  >
                    Contract Function
                  </h4>

                  {/* Function Mode Selection */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px",
                        background:
                          functionMode === "function" ? "#9333ea20" : "#2a2a2a",
                        border: `1px solid ${functionMode === "function" ? "#9333ea" : "#444"}`,
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                      onClick={() => setFunctionMode("function")}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            background:
                              functionMode === "function"
                                ? "#9333ea"
                                : "transparent",
                            border: "2px solid #9333ea",
                          }}
                        ></div>
                        <div>
                          <div
                            style={{
                              fontWeight: "500",
                              fontSize: "12px",
                              color: "#fff",
                            }}
                          >
                            Choose function
                          </div>
                          <div style={{ fontSize: "10px", color: "#888" }}>
                            Select from ABI
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "8px",
                        background:
                          functionMode === "raw" ? "#9333ea20" : "#2a2a2a",
                        border: `1px solid ${functionMode === "raw" ? "#9333ea" : "#444"}`,
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                      onClick={() => setFunctionMode("raw")}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            background:
                              functionMode === "raw"
                                ? "#9333ea"
                                : "transparent",
                            border: "2px solid #9333ea",
                          }}
                        ></div>
                        <div>
                          <div
                            style={{
                              fontWeight: "500",
                              fontSize: "12px",
                              color: "#fff",
                            }}
                          >
                            Raw input data
                          </div>
                          <div style={{ fontSize: "10px", color: "#888" }}>
                            Direct calldata
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {functionMode === "function" && (
                    <>
                      {/* Function Type Selection */}
                      <div style={{ marginBottom: "12px" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            color: "#ccc",
                            marginBottom: "6px",
                          }}
                        >
                          Function Type
                        </label>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "6px",
                          }}
                        >
                          {readFunctions.length > 0 && (
                            <div
                              style={{
                                padding: "6px 8px",
                                background:
                                  selectedFunctionType === "read"
                                    ? "#22c55e20"
                                    : "#2a2a2a",
                                border: `1px solid ${selectedFunctionType === "read" ? "#22c55e" : "#444"}`,
                                borderRadius: "4px",
                                cursor: "pointer",
                                textAlign: "center",
                              }}
                              onClick={() => setSelectedFunctionType("read")}
                            >
                              <div
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "500",
                                  color:
                                    selectedFunctionType === "read"
                                      ? "#22c55e"
                                      : "#ccc",
                                }}
                              >
                                📖 Read ({readFunctions.length})
                              </div>
                            </div>
                          )}
                          {writeFunctions.length > 0 && (
                            <div
                              style={{
                                padding: "6px 8px",
                                background:
                                  selectedFunctionType === "write"
                                    ? "#f59e0b20"
                                    : "#2a2a2a",
                                border: `1px solid ${selectedFunctionType === "write" ? "#f59e0b" : "#444"}`,
                                borderRadius: "4px",
                                cursor: "pointer",
                                textAlign: "center",
                              }}
                              onClick={() => setSelectedFunctionType("write")}
                            >
                              <div
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "500",
                                  color:
                                    selectedFunctionType === "write"
                                      ? "#f59e0b"
                                      : "#ccc",
                                }}
                              >
                                ✍️ Write ({writeFunctions.length})
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Function Dropdown */}
                      {selectedFunctionType && (
                        <div style={{ marginBottom: "12px" }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "12px",
                              color: "#ccc",
                              marginBottom: "6px",
                            }}
                          >
                            Select Function
                          </label>
                          <select
                            style={{ ...inputStyle, fontSize: "12px" }}
                            onChange={(e) =>
                              handleFunctionSelect(e.target.value)
                            }
                            value={selectedFunction || ""}
                          >
                            <option value="">Choose function...</option>
                            {selectedFunctionType === "read" &&
                              readFunctions.length > 0 &&
                              readFunctions.map((func, index) => (
                                <option
                                  key={`read-${index}`}
                                  value={`read-${index}`}
                                >
                                  {func.name}(
                                  {func.inputs
                                    ?.map(
                                      (input: { type: string }) => input.type
                                    )
                                    .join(",")}
                                  )
                                </option>
                              ))}
                            {selectedFunctionType === "write" &&
                              writeFunctions.length > 0 &&
                              writeFunctions.map((func, index) => (
                                <option
                                  key={`write-${index}`}
                                  value={`write-${index}`}
                                >
                                  {func.name}(
                                  {func.inputs
                                    ?.map(
                                      (input: { type: string }) => input.type
                                    )
                                    .join(",")}
                                  )
                                </option>
                              ))}
                          </select>
                        </div>
                      )}

                      {/* Function Parameters */}
                      {selectedFunctionObj &&
                        selectedFunctionObj.inputs &&
                        selectedFunctionObj.inputs.length > 0 && (
                          <div style={{ marginBottom: "12px" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: "12px",
                                color: "#ccc",
                                marginBottom: "6px",
                              }}
                            >
                              Function Parameters
                            </label>
                            {selectedFunctionObj.inputs.map((input, idx) => (
                              <div key={idx} style={{ marginBottom: "8px" }}>
                                <label
                                  style={{
                                    display: "block",
                                    fontSize: "11px",
                                    color: "#999",
                                    marginBottom: "4px",
                                  }}
                                >
                                  {input.name || `param${idx}`} ({input.type})
                                </label>
                                <input
                                  type="text"
                                  placeholder={`Enter ${input.type} value`}
                                  value={
                                    functionInputs[
                                      `${selectedFunctionObj.name}_${idx}`
                                    ] || ""
                                  }
                                  onChange={(e) =>
                                    handleInputChange(
                                      `${selectedFunctionObj.name}_${idx}`,
                                      e.target.value
                                    )
                                  }
                                  style={{
                                    ...inputStyle,
                                    fontSize: "11px",
                                    padding: "6px 8px",
                                    marginBottom: "0",
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                      {/* Dynamic Calldata Display */}
                      <div style={{ marginBottom: "12px" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            color: "#ccc",
                            marginBottom: "6px",
                          }}
                        >
                          Generated Calldata
                        </label>
                        <div style={{ position: "relative" }}>
                          <input
                            type="text"
                            value={generatedCallData}
                            readOnly
                            style={{
                              ...inputStyle,
                              fontFamily: "monospace",
                              fontSize: "11px",
                              paddingRight: "80px",
                              background: "#0a0a0a",
                              border: "1px solid #333",
                              color: "#22c55e",
                              marginBottom: "0",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              right: "8px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#888",
                                cursor: "pointer",
                                padding: "2px 6px",
                                borderRadius: "3px",
                                background: "#2a2a2a",
                                border: "1px solid #444",
                                transition: "all 0.2s ease",
                              }}
                              onClick={() =>
                                navigator.clipboard.writeText(generatedCallData)
                              }
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#007bff";
                                e.currentTarget.style.color = "#fff";
                                e.currentTarget.style.transform = "scale(1.05)";
                                e.currentTarget.style.borderColor = "#007bff";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#2a2a2a";
                                e.currentTarget.style.color = "#888";
                                e.currentTarget.style.transform = "scale(1)";
                                e.currentTarget.style.borderColor = "#444";
                              }}
                              title="Copy calldata"
                            >
                              Copy
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - Transaction Parameters */}
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <h2 style={subHeaderStyle}>⚡ Transaction Parameters</h2>
            <Settings size={20} style={{ color: "#888", cursor: "pointer" }} />
          </div>

          {/* Use Pending Block */}
          <div
            style={{
              padding: "16px",
              background: "#2a2a2a",
              borderRadius: "10px",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: "500", marginBottom: "4px" }}>
                Use Pending Block
              </div>
              <div style={{ fontSize: "12px", color: "#888" }}>
                Simulate against pending state
              </div>
            </div>
            <label
              style={{
                position: "relative",
                display: "inline-block",
                width: "44px",
                height: "24px",
              }}
            >
              <input
                type="checkbox"
                checked={usePendingBlock}
                onChange={(e) => setUsePendingBlock(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <div
                style={{
                  position: "absolute",
                  cursor: "pointer",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: usePendingBlock ? "#22c55e" : "#6b7280",
                  transition: "0.4s",
                  borderRadius: "24px",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    content: "",
                    height: "18px",
                    width: "18px",
                    left: usePendingBlock ? "23px" : "3px",
                    bottom: "3px",
                    backgroundColor: "#fff",
                    transition: "0.4s",
                    borderRadius: "50%",
                  }}
                ></div>
              </div>
            </label>
          </div>

          {/* Parameters Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#ccc",
                  marginBottom: "8px",
                }}
              >
                Block Number
              </label>
              <input type="text" placeholder="Latest" style={inputStyle} />
              <div style={{ fontSize: "12px", color: "#888" }}>
                Current: 30930267
              </div>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#ccc",
                  marginBottom: "8px",
                }}
              >
                Tx Index
              </label>
              <input type="text" placeholder="0" style={inputStyle} />
              <div style={{ fontSize: "12px", color: "#888" }}>Max: 14</div>
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                color: "#ccc",
                marginBottom: "8px",
              }}
            >
              From Address
            </label>
            <input
              type="text"
              defaultValue="0x0000000000000000000000000000000000000000"
              style={{
                ...inputStyle,
                fontFamily: "monospace",
                fontSize: "12px",
              }}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#ccc",
                  marginBottom: "8px",
                }}
              >
                Gas Limit
              </label>
              <input type="text" defaultValue="800000" style={inputStyle} />
              <button
                style={{
                  fontSize: "12px",
                  color: "#22c55e",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Use custom gas value
              </button>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#ccc",
                  marginBottom: "8px",
                }}
              >
                Gas Price
              </label>
              <input type="text" defaultValue="0" style={inputStyle} />
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                color: "#ccc",
                marginBottom: "8px",
              }}
            >
              Value (ETH)
            </label>
            <input type="text" defaultValue="0" style={inputStyle} />
          </div>

          {/* Advanced Options - Inside Transaction Parameters Container */}
          <div
            style={{
              marginTop: "16px",
              paddingTop: "16px",
              borderTop: "1px solid #333",
            }}
          >
            <h4
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "#ccc",
                marginBottom: "12px",
              }}
            >
              Advanced Options
            </h4>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: "8px",
              }}
            >
              {/* Block Header Overrides */}
              <div
                style={{
                  padding: "8px 12px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span style={{ fontSize: "12px" }}>🔶</span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "500",
                        color: "#fff",
                      }}
                    >
                      Block Header Overrides
                    </span>
                  </div>
                  <ChevronDown size={12} style={{ color: "#888" }} />
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#888",
                    marginTop: "2px",
                    marginLeft: "18px",
                  }}
                >
                  Click to configure block header parameters
                </div>
              </div>

              {/* State Overrides */}
              <div
                style={{
                  padding: "8px 12px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span style={{ fontSize: "12px" }}>🗄️</span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "500",
                        color: "#fff",
                      }}
                    >
                      State Overrides
                    </span>
                  </div>
                  <ChevronDown size={12} style={{ color: "#888" }} />
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#888",
                    marginTop: "2px",
                    marginLeft: "18px",
                  }}
                >
                  No state overrides configured
                </div>
              </div>

              {/* Access Lists */}
              <div
                style={{
                  padding: "8px 12px",
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span style={{ fontSize: "12px" }}>🛡️</span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "500",
                        color: "#fff",
                      }}
                    >
                      Access Lists
                    </span>
                  </div>
                  <ChevronDown size={12} style={{ color: "#888" }} />
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#888",
                    marginTop: "2px",
                    marginLeft: "18px",
                  }}
                >
                  No access lists configured
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div style={{ textAlign: "center" }}>
        <button
          style={{
            padding: "16px 48px",
            background: "linear-gradient(135deg, #007bff 0%, #9333ea 100%)",
            color: "#fff",
            border: "none",
            borderRadius: "12px",
            fontSize: "16px",
            fontWeight: "600",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 4px 20px rgba(0, 123, 255, 0.3)",
          }}
        >
          <Play size={20} />
          Simulate Transaction
        </button>
      </div>
    </div>
  );
};

export default SimpleGridUI;
