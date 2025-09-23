const API_KEY =
  (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
    .API_KEY ||
  (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
    .VITE_API_KEY ||
  "";
const BLOCKSCOUT_BYTECODE_DB_URL =
  (import.meta.env as unknown as {
    VITE_BLOCKSCOUT_BYTECODE_DB_URL?: string;
    BLOCKSCOUT_BYTECODE_DB_URL?: string;
  }).VITE_BLOCKSCOUT_BYTECODE_DB_URL ||
  (import.meta.env as unknown as {
    VITE_BLOCKSCOUT_BYTECODE_DB_URL?: string;
    BLOCKSCOUT_BYTECODE_DB_URL?: string;
  }).BLOCKSCOUT_BYTECODE_DB_URL ||
  "https://eth-bytecode-db.services.blockscout.com";
import axios from "axios";
import { ethers } from "ethers";
import type { Chain, ExplorerAPI } from "../types";

// CORS proxy not used in browser; proxies are configured in Vite

// Enhanced contract information interface
export interface ContractInfoResult {
  success: boolean;
  address: string;
  chain: Chain;
  contractName?: string;
  abi?: string;
  source?:
    | "sourcify"
    | "blockscout"
    | "etherscan"
    | "blockscout-bytecode";
  explorerName?: string;
  verified?: boolean;
  // Optional tokenType for legacy UI; current detection happens elsewhere
  tokenType?: string;
  // NOTE: tokenType is now determined exclusively by ERC165 supportsInterface() calls in the main component
  tokenInfo?: {
    name?: string;
    symbol?: string;
    decimals?: number;
    totalSupply?: string;
  };
  externalFunctions?: Array<{
    name: string;
    signature: string;
    inputs: Array<{ name: string; type: string }>;
    outputs: Array<{ name: string; type: string }>;
    stateMutability: "view" | "pure" | "nonpayable" | "payable";
  }>;
  error?: string;
  searchProgress?: Array<{
    source: string;
    status: "searching" | "found" | "not_found" | "error";
    message?: string;
  }>;
}

// Simple retry helper
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 300
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

// Sourcify API response interface
interface SourcifyResponse {
  match?: any; // Can be "match", "exact_match", or null
  creationMatch?: any;
  runtimeMatch?: any;
  verifiedAt?: string;
  chainId?: string;
  address?: string;
  abi?: any[];
  metadata?: {
    settings?: {
      compilationTarget?: Record<string, string>;
    };
    name?: string;
    compiler?: {
      version?: string;
    };
    language?: string;
    output?: {
      abi?: any[];
    };
  };
}

interface BlockscoutBytecodeSource {
  contractName?: string;
  compilerVersion?: string;
  compilerSettings?: string;
  sourceFiles?: Record<string, string>;
  abi?: string | Record<string, unknown> | unknown[];
  constructorArguments?: string;
  matchType?: string;
  sourceType?: string;
}

interface BlockscoutBytecodeSearchResponse {
  ethBytecodeDbSources?: BlockscoutBytecodeSource[];
  sourcifySources?: BlockscoutBytecodeSource[];
  allianceSources?: BlockscoutBytecodeSource[];
}

const BLOCKSCOUT_API_FALLBACKS: Record<number, string[]> = {
  8453: ["https://base.blockscout.com/api"],
  84532: ["https://base-sepolia.blockscout.com/api"],
  137: ["https://polygon.blockscout.com/api"],
  42161: ["https://arbitrum.blockscout.com/api"],
};

// Enhanced search function with comprehensive progress tracking
export const fetchContractInfoComprehensive = async (
  address: string,
  chain: Chain,
  progressCallback?: (progress: {
    source: string;
    status: "searching" | "found" | "not_found" | "error";
    message?: string;
  }) => void
): Promise<ContractInfoResult> => {
  const searchProgress: ContractInfoResult["searchProgress"] = [];
  let finalResult: ContractInfoResult = {
    success: false,
    address,
    chain,
    searchProgress: [],
  };

  // Validate address
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    return {
      ...finalResult,
      success: false,
      error: "Invalid contract address format",
    };
  }

  // Add progress tracking
  const addProgress = (
    source: string,
    status: "searching" | "found" | "not_found" | "error",
    message?: string
  ) => {
    const progress = { source, status, message };
    searchProgress.push(progress);
    console.log(`🔍 [Progress] ${source}: ${status} - ${message || ""}`);
    
    // Call the callback if provided for real-time updates
    if (progressCallback) {
      progressCallback(progress);
    }
  };

  try {
    const integrateAbiDetails = async (
      result: ContractInfoResult
    ): Promise<ContractInfoResult> => {
      if (!result.success || !result.abi) {
        return result;
      }

      try {
        const parsedABI = JSON.parse(result.abi);
        const externalFunctions = extractExternalFunctions(parsedABI);
        console.log(
          `🔍 Extracted ${externalFunctions?.length || 0} external functions`
        );

        let tokenInfo = result.tokenInfo;
        if (!tokenInfo) {
          addProgress("Token API", "searching", "Fetching token metadata...");
          tokenInfo = await fetchTokenInfo(address, parsedABI, chain);
          if (tokenInfo) {
            addProgress(
              "Token API",
              "found",
              `Token: ${tokenInfo.name} (${tokenInfo.symbol})`
            );
          } else {
            addProgress(
              "Token API",
              "not_found",
              "Could not fetch token metadata"
            );
          }
        }

        const updatedResult: ContractInfoResult = {
          ...result,
          externalFunctions,
          tokenInfo,
          searchProgress: [...searchProgress],
        };

        console.log(
          `🔍 [DEBUG] Before fallbacks - Contract name: "${updatedResult.contractName}", Token name: "${tokenInfo?.name}"`
        );

        if (!updatedResult.contractName && tokenInfo?.name) {
          updatedResult.contractName = tokenInfo.name;
          console.log(
            `🔍 [DEBUG] Using token name as contract name: "${tokenInfo.name}"`
          );
        }

        if (!updatedResult.contractName) {
          console.log(
            `🔍 [DEBUG] No contract name found, trying ABI extraction...`
          );
          const contractABI = parsedABI.find(
            (item: any) => item.type === "constructor"
          );
          if (contractABI && contractABI.name) {
            updatedResult.contractName = contractABI.name;
            console.log(
              `🔍 [DEBUG] Using constructor name: "${contractABI.name}"`
            );
          } else {
            const genericName = "Smart Contract";
            updatedResult.contractName = genericName;
            console.log(`🔍 [DEBUG] Using generic name: "${genericName}"`);
          }
        }

        console.log(
          `🔍 [DEBUG] Final contract name: "${updatedResult.contractName}"`
        );
        return updatedResult;
      } catch (parseError) {
        console.error("Error parsing ABI:", parseError);
        return {
          ...result,
          error: `Failed to parse ABI: ${parseError}`,
        };
      }
    };

    console.log(
      `🔍 Starting comprehensive search for ${address} on ${chain.name}`
    );

    // Priority 1: Sourcify
    addProgress(
      "Sourcify",
      "searching",
      "Searching Sourcify for verified contract..."
    );
    const sourcifyResult = await fetchFromSourcify(address, chain.id);

    if (sourcifyResult.success) {
      addProgress(
        "Sourcify",
        "found",
        `Found verified contract on Sourcify: ${sourcifyResult.contractName || "Unknown"}`
      );
      finalResult = await integrateAbiDetails({
        ...finalResult,
        ...sourcifyResult,
        success: true,
      });
    } else {
      addProgress(
        "Sourcify",
        "not_found",
        sourcifyResult.error || "Contract not found on Sourcify"
      );
    }

    // Priority 2: Blockscout (only if Sourcify failed)
    if (!finalResult.success) {
      console.log(`🔍 [DEBUG] Sourcify failed, trying Blockscout...`);
      addProgress(
        "Blockscout",
        "searching",
        "Searching Blockscout for verified contract..."
      );
      const blockscoutResult = await fetchFromBlockscout(address, chain);

      if (blockscoutResult.success) {
        addProgress(
          "Blockscout",
          "found",
          `Found verified contract on Blockscout: ${blockscoutResult.contractName || "Unknown"}`
        );
        finalResult = await integrateAbiDetails({
          ...finalResult,
          ...blockscoutResult,
          success: true,
        });
      } else {
        addProgress(
          "Blockscout",
          "not_found",
          blockscoutResult.error || "Contract not found on Blockscout"
        );
      }
    }

    // Priority 3: Etherscan (only if both Sourcify and Blockscout failed)
    if (!finalResult.success) {
      console.log(
        `🔍 [DEBUG] Both Sourcify and Blockscout failed, trying Etherscan...`
      );
      addProgress(
        "Etherscan",
        "searching",
        "Searching Etherscan for verified contract..."
      );
      const etherscanResult = await fetchFromEtherscan(address, chain);

      if (etherscanResult.success) {
        addProgress(
          "Etherscan",
          "found",
          `Found verified contract on Etherscan: ${etherscanResult.contractName || "Unknown"}`
        );
        finalResult = await integrateAbiDetails({
          ...finalResult,
          ...etherscanResult,
          success: true,
        });
      } else {
        addProgress(
          "Etherscan",
          "not_found",
          etherscanResult.error || "Contract not found on Etherscan"
        );
      }
    }

    // Priority 4: Blockscout Bytecode DB (only if all direct explorers failed)
    if (!finalResult.success) {
      console.log(
        "🔍 [DEBUG] Explorer sources failed, trying Blockscout Bytecode DB..."
      );
      addProgress(
        "Blockscout EBD",
        "searching",
        "Searching Blockscout's shared bytecode database..."
      );
      const bytecodeDbResult = await fetchFromBlockscoutBytecodeDB(
        address,
        chain
      );

      if (bytecodeDbResult.success) {
        addProgress(
          "Blockscout EBD",
          "found",
          `Recovered sources from Blockscout Bytecode DB: ${bytecodeDbResult.contractName || "Unknown"}`
        );
        finalResult = { ...finalResult, ...bytecodeDbResult };
      } else {
        addProgress(
          "Blockscout EBD",
          "not_found",
          bytecodeDbResult.error ||
            "No match in Blockscout's shared bytecode database"
        );
      }
    }

    // If we have ABI from any source, extract external functions and detect token type
    finalResult = await integrateAbiDetails(finalResult);

    if (
      finalResult.success &&
      (!finalResult.externalFunctions || finalResult.externalFunctions.length === 0) &&
      finalResult.source !== "blockscout-bytecode"
    ) {
      addProgress(
        "Blockscout EBD",
        "searching",
        "No functions found. Searching Blockscout Bytecode DB for richer metadata..."
      );
      const enrichmentResult = await fetchFromBlockscoutBytecodeDB(
        address,
        chain
      );

      if (enrichmentResult.success) {
        addProgress(
          "Blockscout EBD",
          "found",
          `Recovered ABI from Blockscout Bytecode DB: ${enrichmentResult.contractName || "Unknown"}`
        );
        finalResult = await integrateAbiDetails({
          ...finalResult,
          ...enrichmentResult,
          success: true,
        });
      } else {
        addProgress(
          "Blockscout EBD",
          "not_found",
          enrichmentResult.error ||
            "Blockscout Bytecode DB did not return a richer ABI"
        );
      }
    }

    // RAW FALLBACK: If still not successful (no verified ABI), probe minimal on-chain data
    if (!finalResult.success) {
      try {
        addProgress(
          "RawProbe",
          "searching",
          "Probing ERC165 and token metadata..."
        );
        const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);

        // Probe ERC165
        let supports165 = false;
        try {
          const erc165 = new ethers.Contract(
            address,
            [
              {
                inputs: [
                  {
                    internalType: "bytes4",
                    name: "interfaceId",
                    type: "bytes4",
                  },
                ],
                name: "supportsInterface",
                outputs: [{ internalType: "bool", name: "", type: "bool" }],
                stateMutability: "view",
                type: "function",
              },
            ],
            provider
          );
          supports165 = await erc165
            .supportsInterface("0x01ffc9a7")
            .catch(() => false);
        } catch {}

        // Probe token metadata directly
        const metaIface = new ethers.utils.Interface([
          "function name() view returns (string)",
          "function symbol() view returns (string)",
          "function decimals() view returns (uint8)",
        ]);
        const meta = new ethers.Contract(address, metaIface, provider);
        const [name, symbol, decimals] = await Promise.all([
          meta.name().catch(() => undefined),
          meta.symbol().catch(() => undefined),
          meta.decimals().catch(() => undefined),
        ]);

        const tokenInfo = {
          name: typeof name === "string" ? name : undefined,
          symbol: typeof symbol === "string" ? symbol : undefined,
          decimals: typeof decimals === "number" ? decimals : undefined,
        };

        // If we obtained any token metadata, surface it and use name as contractName
        if (
          tokenInfo.name ||
          tokenInfo.symbol ||
          tokenInfo.decimals !== undefined
        ) {
          addProgress(
            "RawProbe",
            "found",
            `Token metadata: ${tokenInfo.name || "Unknown"}`
          );
          finalResult = {
            ...finalResult,
            success: false, // Not verified; ABI still missing
            contractName:
              finalResult.contractName ||
              tokenInfo.name ||
              finalResult.contractName,
            tokenInfo,
            verified: false,
            searchProgress: [...searchProgress],
          };
        } else {
          addProgress(
            "RawProbe",
            "not_found",
            supports165
              ? "ERC165 supported, no token metadata"
              : "No ERC165 or token metadata"
          );
        }
      } catch (rawErr) {
        addProgress("RawProbe", "error", String(rawErr));
      }
    }

    console.log(`🔍 Search completed. Success: ${finalResult.success}`);
    return finalResult;
  } catch (error) {
    console.error("Comprehensive contract info fetch error:", error);
    return {
      ...finalResult,
      success: false,
      error: `Network error: ${error}`,
      searchProgress: [...searchProgress],
    };
  }
};

// Fetch contract sources from Blockscout's Ethereum Bytecode Database (cross-chain fallback)
const fetchFromBlockscoutBytecodeDB = async (
  address: string,
  chain: Chain
): Promise<Partial<ContractInfoResult>> => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
    const deployedBytecode = await withRetry(() => provider.getCode(address));

    if (!deployedBytecode || deployedBytecode === "0x") {
      return {
        success: false,
        error: "Contract has no runtime bytecode on this chain",
      };
    }

    const requestBody = {
      bytecode: deployedBytecode,
      bytecodeType: "DEPLOYED_BYTECODE",
      chain: String(chain.id),
      address,
      onlyLocal: false,
    };

    const response = await withRetry(() =>
      axios.post<BlockscoutBytecodeSearchResponse>(
        `${BLOCKSCOUT_BYTECODE_DB_URL}/api/v2/bytecodes/sources:search-all`,
        requestBody,
        {
          timeout: 20000,
        }
      )
    );

    const pickSource = (
      payload: BlockscoutBytecodeSearchResponse
    ): BlockscoutBytecodeSource | undefined => {
      const prioritized = [
        payload.ethBytecodeDbSources,
        payload.sourcifySources,
        payload.allianceSources,
      ];

      for (const collection of prioritized) {
        if (collection && collection.length > 0) {
          return collection[0];
        }
      }

      return undefined;
    };

    const primarySource = pickSource(response.data);

    if (!primarySource) {
      return {
        success: false,
        error: "No matching source found in Blockscout Bytecode DB",
      };
    }

    const normalizeAbi = (
      rawAbi: BlockscoutBytecodeSource["abi"]
    ): string | undefined => {
      if (!rawAbi) return undefined;
      if (typeof rawAbi === "string") {
        try {
          JSON.parse(rawAbi);
          return rawAbi;
        } catch (parseErr) {
          console.warn("🔍 [EBD] ABI string is not valid JSON, discarding.", parseErr);
          return undefined;
        }
      }
      try {
        return JSON.stringify(rawAbi);
      } catch (jsonErr) {
        console.warn("🔍 [EBD] Failed to stringify ABI object.", jsonErr);
        return undefined;
      }
    };

    const abi = normalizeAbi(primarySource.abi);

    if (!abi) {
      return {
        success: false,
        error: "Blockscout Bytecode DB returned a match without ABI",
      };
    }

    const contractName = primarySource.contractName || "Smart Contract";

    return {
      success: true,
      abi,
      contractName,
      source: "blockscout-bytecode",
      explorerName: "Blockscout Bytecode DB",
      verified: true,
    };
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      return {
        success: false,
        error: `Blockscout Bytecode DB error${
          status ? ` (status ${status})` : ""
        }: ${message}`,
      };
    }

    console.error("Blockscout Bytecode DB lookup failed:", error);
    return {
      success: false,
      error: `Blockscout Bytecode DB error: ${error?.message || error}`,
    };
  }
};

// Fetch from Sourcify with enhanced contract name extraction
const fetchFromSourcify = async (
  address: string,
  chainId: number
): Promise<Partial<ContractInfoResult>> => {
  try {
    console.log(
      `🔍 [Sourcify] Fetching contract: ${address} on chain ${chainId}`
    );

    // Prefer repo endpoints (full_match, partial_match)
    const repoEndpoints = [
      `/api/repo/contracts/full_match/${chainId}/${address}/metadata.json`,
      `/api/repo/contracts/partial_match/${chainId}/${address}/metadata.json`,
    ];

    for (const url of repoEndpoints) {
      try {
        const res = await withRetry(() =>
          axios.get<SourcifyResponse>(url, { timeout: 15000 })
        );
        const metadata: any = res.data;
        const abi = Array.isArray(metadata?.output?.abi)
          ? metadata.output.abi
          : [];
        if (abi.length > 0) {
          let contractName: string | undefined;
          const compilationTarget = metadata?.settings?.compilationTarget;
          if (compilationTarget) {
            const keys = Object.keys(compilationTarget);
            if (keys.length > 0) contractName = compilationTarget[keys[0]];
          }
          if (!contractName && metadata?.metadata?.name) {
            contractName = metadata.metadata.name;
          }
          if (!contractName && metadata?.name) {
            contractName = metadata.name;
          }
          return {
            success: true,
            contractName,
            abi: JSON.stringify(abi),
            source: "sourcify",
            explorerName: "Sourcify",
            verified: true,
          };
        }
      } catch (e: any) {
        // Gracefully handle 404s and other errors
        if (e.response?.status === 404) {
          console.log(`🔍 [Sourcify] Repo endpoint ${url} returned 404 (expected for unverified contracts)`);
        } else {
          console.warn(`🔍 [Sourcify] Repo endpoint ${url} failed:`, e.message);
        }
        continue;
      }
    }

    // Fallback: server v2 contract endpoint as a secondary check
    const checkUrl = `/api/sourcify/server/v2/contract/${chainId}/${address}?fields=abi,metadata`;
    const response = await withRetry(() =>
      axios.get<SourcifyResponse>(checkUrl, {
        timeout: 15000,
      })
    );

    console.log(`🔍 [Sourcify] Response status: ${response.status}`);
    console.log(`🔍 [Sourcify] Response data:`, {
      match: !!response.data.match,
      creationMatch: !!response.data.creationMatch,
      runtimeMatch: !!response.data.runtimeMatch,
      hasAbi: !!(response.data.abi && Array.isArray(response.data.abi)),
      abiLength: response.data.abi?.length || 0,
    });

    const hasValidData =
      response.data.match ||
      response.data.creationMatch ||
      response.data.runtimeMatch ||
      (response.status === 304 &&
        response.data.abi &&
        Array.isArray(response.data.abi));

    if (hasValidData) {
      let abi: string | null = null;
      if (response.data.abi && Array.isArray(response.data.abi)) {
        abi = JSON.stringify(response.data.abi);
      }

      let contractName: string | undefined;
      const metadata = response.data.metadata as any;
      if (metadata) {
        const compilationTarget = metadata?.settings?.compilationTarget;
        if (compilationTarget) {
          const targetKeys = Object.keys(compilationTarget);
          if (targetKeys.length > 0) {
            contractName = compilationTarget[targetKeys[0]];
          }
        }
        if (!contractName && metadata?.name) {
          contractName = metadata.name;
        }
      }

      if (abi) {
        return {
          success: true,
          contractName,
          abi,
          source: "sourcify",
          explorerName: "Sourcify",
          verified: true,
        };
      }
    }

    return { success: false, error: "Contract not verified on Sourcify" };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return { success: false, error: "Contract not found on Sourcify" };
    }
    console.error(`🔍 [Sourcify] Error:`, error);
    return { success: false, error: `Sourcify error: ${error.message}` };
  }
};

// Helper function to fetch with better error handling
const fetchWithFallback = async (url: string) => {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
    });
    return response;
  } catch (error) {
    console.warn(`Failed to fetch ${url}:`, error);
    return null;
  }
};

// Fetch from Blockscout with enhanced contract name extraction
const fetchFromBlockscout = async (
  address: string,
  chain: Chain
): Promise<Partial<ContractInfoResult>> => {
  try {
    console.log(
      `🔍 [Blockscout] Fetching contract: ${address} on ${chain.name}`
    );

    const explorers: ExplorerAPI[] = [
      ...(chain.explorers || []),
    ];

    const fallbackApis = BLOCKSCOUT_API_FALLBACKS[chain.id] || [];
    fallbackApis.forEach((url) => {
      if (!explorers.some((e) => e.url === url)) {
        explorers.push({
          name: "Blockscout",
          url,
          type: "blockscout",
        });
      }
    });

    const blockscoutExplorer = explorers.find((e) => e.type === "blockscout");
    if (!blockscoutExplorer) {
      return {
        success: false,
        error: "No Blockscout API available for this network",
      };
    }

    const blockscoutProxy =
      chain.id === 137
        ? "/api/polygon-blockscout"
        : chain.id === 42161
          ? "/api/arbitrum-blockscout"
          : chain.id === 84532
            ? "/api/base-sepolia-blockscout"
            : "/api/blockscout";

    const apiBases = new Set<string>([
      blockscoutProxy,
      blockscoutExplorer.url,
      ...fallbackApis,
    ]);

    const normalizeBase = (base: string) => base.replace(/\/$/, "");

    const buildStandardEndpoint = (base: string) => {
      const normalized = normalizeBase(base);
      return `${normalized}${normalized.endsWith("/api") ? "" : "/api"}?module=contract&action=getabi&address=${address}`;
    };

    const buildV2Endpoint = (base: string) => {
      const normalized = normalizeBase(base);
      return `${normalized}${normalized.endsWith("/api") ? "" : "/api"}/v2/smart-contracts/${address}`;
    };

    const abiEndpoints: string[] = [];
    apiBases.forEach((base) => {
      abiEndpoints.push(buildStandardEndpoint(base));
      abiEndpoints.push(buildV2Endpoint(base));
    });

    let abiResult: { abi: string; contractName?: string } | null = null;

    for (const endpoint of abiEndpoints) {
      try {
        console.log(`🔍 [Blockscout] Trying ABI endpoint: ${endpoint}`);
        const response = await withRetry(() =>
          axios.get(endpoint, {
            timeout: 15000,
          })
        );

        if (response.data?.status === "1" && response.data.result) {
          abiResult = { abi: response.data.result };
          break;
        }

        const v2Abi =
          response.data?.abi ||
          response.data?.result?.abi ||
          response.data?.result?.contract?.abi;

        if (v2Abi) {
          abiResult = {
            abi: typeof v2Abi === "string" ? v2Abi : JSON.stringify(v2Abi),
            contractName:
              response.data?.contractName ||
              response.data?.name ||
              response.data?.result?.contractName ||
              response.data?.result?.name,
          };
          break;
        }
      } catch (endpointError: any) {
        if (endpointError.response?.status === 404) {
          console.log(
            `🔍 [Blockscout] Endpoint ${endpoint} returned 404 (expected for unverified contracts)`
          );
        } else {
          console.warn(
            `🔍 [Blockscout] Endpoint ${endpoint} failed:`,
            endpointError.message
          );
        }
        continue;
      }
    }

    if (!abiResult) {
      return { success: false, error: "Contract not found on Blockscout" };
    }

    if (!abiResult.contractName) {
      try {
        console.log(`🔍 [Blockscout] Fetching contract name separately...`);
        const nameEndpoints = [
          buildStandardEndpoint(blockscoutExplorer.url),
          buildV2Endpoint(blockscoutExplorer.url),
        ];

        for (const nameEndpoint of nameEndpoints) {
          try {
            const nameResponse = await withRetry(() =>
              axios.get(nameEndpoint, {
                timeout: 15000,
              })
            );

            if (
              nameResponse.data?.status === "1" &&
              nameResponse.data.result?.[0]
            ) {
              abiResult.contractName =
                nameResponse.data.result[0].ContractName;
              console.log(
                `🔍 [Blockscout] Contract name from source code: ${abiResult.contractName}`
              );
              break;
            }

            if (nameResponse.data?.name || nameResponse.data?.contract_name) {
              abiResult.contractName =
                nameResponse.data.name || nameResponse.data.contract_name;
              console.log(
                `🔍 [Blockscout] Contract name from v2 API: ${abiResult.contractName}`
              );
              break;
            }
          } catch (nameError) {
            continue;
          }
        }
      } catch (error) {
        console.warn("Could not fetch contract name from Blockscout");
      }
    }

    return {
      success: true,
      contractName: abiResult.contractName,
      abi: abiResult.abi,
      source: "blockscout",
      explorerName: blockscoutExplorer.name,
      verified: true,
    };
  } catch (error: any) {
    return { success: false, error: `Blockscout error: ${error.message}` };
  }
};

// Fetch from Etherscan with enhanced contract name extraction
const fetchFromEtherscan = async (
  address: string,
  chain: Chain
): Promise<Partial<ContractInfoResult>> => {
  try {
    console.log(
      `🔍 [Etherscan] Fetching contract: ${address} on ${chain.name}`
    );

    const etherscanExplorer = chain.explorers?.find(
      (e) => e.type === "etherscan"
    );
    if (!etherscanExplorer) {
      return {
        success: false,
        error: "No Etherscan API available for this network",
      };
    }

    // Fetch ABI and contract name in parallel
    const [abiResponse, nameResponse] = await Promise.allSettled([
      axios.get(
        `/api/${etherscanExplorer.type === "etherscan" && chain.id === 8453 ? "basescan" : etherscanExplorer.type === "etherscan" && chain.id === 1 ? "etherscan" : etherscanExplorer.type === "etherscan" && chain.id === 137 ? "polygonscan" : etherscanExplorer.type}?module=contract&action=getabi&address=${address}`,
        {
          timeout: 15000,
        }
      ),
      axios.get(
        `/api/${etherscanExplorer.type === "etherscan" && chain.id === 8453 ? "basescan" : etherscanExplorer.type === "etherscan" && chain.id === 1 ? "etherscan" : etherscanExplorer.type === "etherscan" && chain.id === 137 ? "polygonscan" : etherscanExplorer.type}?module=contract&action=getsourcecode&address=${address}`,
        {
          timeout: 15000,
        }
      ),
    ]);

    // Check ABI response
    if (
      abiResponse.status === "fulfilled" &&
      abiResponse.value.data.status === "1"
    ) {
      const abi = abiResponse.value.data.result;
      let contractName: string | undefined;

      // Extract contract name from source code response
      if (
        nameResponse.status === "fulfilled" &&
        nameResponse.value.data.status === "1"
      ) {
        const sourceResult = nameResponse.value.data.result?.[0];
        if (sourceResult?.ContractName) {
          contractName = sourceResult.ContractName;
          console.log(`🔍 [Etherscan] Contract name: ${contractName}`);
        }
      }

      // Also try to get token info if available
      let tokenInfo: ContractInfoResult["tokenInfo"] | undefined;

      return {
        success: true,
        contractName,
        abi,
        source: "etherscan",
        explorerName: etherscanExplorer.name,
        verified: true,
        tokenInfo,
      };
    }

    return { success: false, error: "Contract not found on Etherscan" };
  } catch (error: any) {
    return { success: false, error: `Etherscan error: ${error.message}` };
  }
};

// Extract external functions from ABI
const extractExternalFunctions = (
  abi: any[]
): ContractInfoResult["externalFunctions"] => {
  if (!abi || !Array.isArray(abi)) return [];

  return abi
    .filter(
      (item) =>
        item.type === "function" &&
        (item.stateMutability === "view" ||
          item.stateMutability === "pure" ||
          item.stateMutability === "nonpayable" ||
          item.stateMutability === "payable")
    )
    .map((func) => ({
      name: func.name,
      signature: `${func.name}(${func.inputs?.map((input: any) => input.type).join(",") || ""})`,
      inputs:
        func.inputs?.map((input: any) => ({
          name: input.name || "",
          type: input.type,
        })) || [],
      outputs:
        func.outputs?.map((output: any) => ({
          name: output.name || "",
          type: output.type,
        })) || [],
      stateMutability: func.stateMutability,
    }));
};

// NOTE: Token type detection should only be done via ERC165 supportsInterface() calls
// This ABI-based function is deprecated and should not be used
// ERC165 interface detection is handled in the main component with proper contract calls

// Fetch token information using ABI with multiple fallback strategies
const fetchTokenInfo = async (
  address: string,
  abi: any[],
  chain: Chain
): Promise<ContractInfoResult["tokenInfo"]> => {
  console.log(`🔍 [Token] Fetching token info for ${address}`);

  try {
    // Use working RPC endpoints for different networks
    let rpcUrl = chain.rpcUrl;
    if (chain.id === 1) {
      rpcUrl = `https://eth-mainnet.g.alchemy.com/v2/${API_KEY}`;
    } else if (chain.id === 8453) {
      const key =
        (
          import.meta.env as unknown as {
            API_KEY?: string;
            VITE_API_KEY?: string;
          }
        ).API_KEY ||
        (
          import.meta.env as unknown as {
            API_KEY?: string;
            VITE_API_KEY?: string;
          }
        ).VITE_API_KEY;
      rpcUrl = key
        ? `https://base-mainnet.g.alchemy.com/v2/${key}`
        : chain.rpcUrl;
    } else if (chain.id === 84532) {
      const key =
        (
          import.meta.env as unknown as {
            API_KEY?: string;
            VITE_API_KEY?: string;
          }
        ).API_KEY ||
        (
          import.meta.env as unknown as {
            API_KEY?: string;
            VITE_API_KEY?: string;
          }
        ).VITE_API_KEY;
      rpcUrl = key
        ? `https://base-sepolia.g.alchemy.com/v2/${key}`
        : chain.rpcUrl;
    } else if (chain.id === 137) {
      rpcUrl = `https://polygon-mainnet.g.alchemy.com/v2/${API_KEY}`;
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(address, abi, provider);

    // Try to fetch token info based on detected type
    const functions = abi
      .filter((item) => item.type === "function")
      .map((item) => item.name);

    // Strategy 1: Direct contract calls (most reliable)
    if (functions.includes("name") && functions.includes("symbol")) {
      console.log(`🔍 [Token] Using direct contract calls...`);

      const calls = [];
      if (functions.includes("name")) calls.push(contract.name());
      if (functions.includes("symbol")) calls.push(contract.symbol());
      if (functions.includes("decimals")) calls.push(contract.decimals());
      if (functions.includes("totalSupply")) calls.push(contract.totalSupply());

      const results = await Promise.allSettled(calls);

      const tokenInfo: ContractInfoResult["tokenInfo"] = {
        name: results[0]?.status === "fulfilled" ? results[0].value : undefined,
        symbol:
          results[1]?.status === "fulfilled" ? results[1].value : undefined,
        decimals:
          results[2]?.status === "fulfilled"
            ? Number(results[2].value)
            : undefined,
        totalSupply:
          results[3]?.status === "fulfilled"
            ? results[3].value?.toString()
            : undefined,
      };

      console.log(`🔍 [Token] Direct call results:`, tokenInfo);

      // If we got at least name and symbol, return it
      if (tokenInfo.name && tokenInfo.symbol) {
        return tokenInfo;
      }
    }

    // Strategy 2: Try static call (some tokens require this)
    console.log(`🔍 [Token] Trying static calls...`);
    try {
      const name = await contract.callStatic.name().catch(() => undefined);
      const symbol = await contract.callStatic.symbol().catch(() => undefined);
      const decimals = await contract.callStatic
        .decimals()
        .catch(() => undefined);

      if (name && symbol) {
        console.log(`🔍 [Token] Static call successful: ${name} (${symbol})`);
        return { name, symbol, decimals: Number(decimals) || 18 };
      }
    } catch (staticError) {
      console.log(`🔍 [Token] Static call failed:`, staticError);
    }

    // Strategy 3: Try to get from explorer APIs as fallback
    // Explorer token fallbacks disabled to avoid proxy 404s

    console.log(`🔍 [Token] Could not fetch token info for ${address}`);
    return undefined;
  } catch (error) {
    console.error("Error fetching token info:", error);
    return undefined;
  }
};
