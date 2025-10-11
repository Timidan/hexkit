import React, { useState } from "react";
import { ethers } from "ethers";
import {
  Search,
  Network,
  CheckCircle,
  XCircle,
  Diamond,
  Loader,
  Building2,
  Eye,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { SUPPORTED_CHAINS } from "../utils/chains";
import { fetchContractABIMultiSource } from "../utils/multiSourceAbiFetcher";
import type { Chain } from "../types";
import GlassButton from "./ui/GlassButton";

interface ContractSearchResult {
  chain: Chain;
  verified: boolean;
  name?: string;
  abi?: string;
  contractType?: string;
  isDiamond?: boolean;
  facetAddresses?: string[];
  error?: string;
}

interface FacetDetails {
  address: string;
  name?: string;
  verified: boolean;
  abi?: string;
  functionSelectors?: string[];
  functionCount?: number;
}

interface DiamondContractInfo {
  isDiamond: boolean;
  facets: FacetDetails[];
  totalFunctions: number;
}

interface MultiNetworkContractSearchProps {
  onContractFound?: (
    results: ContractSearchResult[],
    diamondInfo?: DiamondContractInfo
  ) => void;
  onContractSelected?: (
    address: string,
    chain: Chain,
    abi: string,
    contractMetadata?: {
      name?: string;
      compilerVersion?: string;
      tokenInfo?: {
        name?: string;
        symbol?: string;
        decimals?: string;
        totalSupply?: string;
        tokenType?: string;
        divisor?: string;
      };
      isDiamond?: boolean;
      facetAddresses?: string[];
    }
  ) => void;
  etherscanApiKey?: string;
  initialAddress?: string;
}

const MultiNetworkContractSearch: React.FC<MultiNetworkContractSearchProps> = ({
  onContractFound,
  onContractSelected,
  etherscanApiKey,
  initialAddress,
}) => {
  const [address, setAddress] = useState(initialAddress || "");
  const [selectedChains, setSelectedChains] = useState<number[]>(
    SUPPORTED_CHAINS.map((c) => c.id)
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ContractSearchResult[]>(
    []
  );
  const [diamondInfo, setDiamondInfo] = useState<DiamondContractInfo | null>(
    null
  );
  const [searchProgress, setSearchProgress] = useState<string>("");
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  // Minimal ERC165 ABI and interface IDs
  const erc165ABI = [
    {
      inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
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
    ERC1155: "0xd9b67a26",
  } as const;

  // ERC165 token standard detection (works for diamonds if ERC165 facet is wired)
  const detectTokenStandardViaERC165 = async (
    contractAddress: string,
    chain: Chain
  ): Promise<"ERC1155" | "ERC721" | "ERC20" | undefined> => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
      const contract = new ethers.Contract(
        contractAddress,
        erc165ABI,
        provider
      );

      const supportsERC165 = await contract
        .supportsInterface(interfaceIds.ERC165)
        .catch(() => false);

      // ERC165-only token detection; no decimals fallback here
      if (!supportsERC165) return undefined;

      // Priority: ERC1155 → ERC721 → ERC20
      if (
        await contract
          .supportsInterface(interfaceIds.ERC1155)
          .catch(() => false)
      )
        return "ERC1155";
      if (
        await contract.supportsInterface(interfaceIds.ERC721).catch(() => false)
      )
        return "ERC721";
      if (
        await contract.supportsInterface(interfaceIds.ERC20).catch(() => false)
      )
        return "ERC20";
      return undefined;
    } catch {
      return undefined;
    }
  };

  // Diamond detection function
  const detectDiamond = async (
    contractAddress: string,
    chain: Chain
  ): Promise<{ isDiamond: boolean; facetAddresses?: string[] }> => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);

      // Check if contract has facetAddresses() function
      const diamondContract = new ethers.Contract(
        contractAddress,
        [
          "function facetAddresses() external view returns (address[] memory facetAddresses_)",
        ],
        provider
      );

      const facetAddresses = await diamondContract.facetAddresses();

      if (Array.isArray(facetAddresses) && facetAddresses.length > 0) {
        return { isDiamond: true, facetAddresses };
      }

      return { isDiamond: false };
    } catch {
      // If the function doesn't exist or call fails, it's not a diamond
      return { isDiamond: false };
    }
  };

  // Get function selectors for a facet
  const getFacetFunctionSelectors = async (
    contractAddress: string,
    facetAddress: string,
    chain: Chain
  ): Promise<string[]> => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
      const diamondContract = new ethers.Contract(
        contractAddress,
        [
          "function facetFunctionSelectors(address _facet) external view returns (bytes4[] memory _facetFunctionSelectors)",
        ],
        provider
      );

      const selectors =
        await diamondContract.facetFunctionSelectors(facetAddress);
      return selectors || [];
    } catch (error) {
      console.warn(
        `Failed to get function selectors for facet ${facetAddress}:`,
        error
      );
      return [];
    }
  };

  // Analyze diamond facets
  const analyzeDiamond = async (
    contractAddress: string,
    facetAddresses: string[],
    chain: Chain
  ): Promise<DiamondContractInfo> => {
    const facets: FacetDetails[] = [];
    let totalFunctions = 0;

    for (const facetAddress of facetAddresses) {
      setSearchProgress(`Analyzing facet ${facetAddress.slice(0, 8)}...`);

      try {
        // Get function selectors for this facet
        const functionSelectors = await getFacetFunctionSelectors(
          contractAddress,
          facetAddress,
          chain
        );

        // Try to fetch ABI for the facet
        const facetAbiResult = await fetchContractABIMultiSource(
          facetAddress,
          chain,
          etherscanApiKey
        );

        const facetDetails: FacetDetails = {
          address: facetAddress,
          verified: facetAbiResult.success,
          abi: facetAbiResult.abi,
          name: facetAbiResult.contractName || undefined,
          functionSelectors,
          functionCount: functionSelectors.length,
        };

        facets.push(facetDetails);
        totalFunctions += functionSelectors.length;
      } catch (error) {
        console.warn(`Error analyzing facet ${facetAddress}:`, error);

        // Add facet with minimal info
        facets.push({
          address: facetAddress,
          verified: false,
          functionSelectors: [],
          functionCount: 0,
        });
      }
    }

    return {
      isDiamond: true,
      facets,
      totalFunctions,
    };
  };

  // Search contracts across networks
  const searchContract = async () => {
    if (!address || !ethers.utils.isAddress(address)) {
      alert("Please enter a valid contract address");
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    setDiamondInfo(null);
    setSearchProgress("Starting multi-network search...");

    const results: ContractSearchResult[] = [];
    let foundDiamondInfo: DiamondContractInfo | null = null;

    try {
      // Search on selected chains
      for (const chainId of selectedChains) {
        const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
        if (!chain) continue;

        setSearchProgress(`Searching on ${chain.name}...`);

        try {
          // Fetch contract info
          const contractInfo = await fetchContractABIMultiSource(
            address,
            chain,
            etherscanApiKey
          );

          console.log(`🔍 [${chain.name}] Contract info for ${address}:`, {
            success: contractInfo.success,
            contractName: contractInfo.contractName,
            source: contractInfo.source,
            explorerName: contractInfo.explorerName,
            error: contractInfo.error,
          });

          // Detect token standard via ERC165 (works for diamonds that expose ERC165)
          let tokenType: "ERC1155" | "ERC721" | "ERC20" | undefined = undefined;
          if (contractInfo.success) {
            tokenType = await detectTokenStandardViaERC165(address, chain);
          }

          const result: ContractSearchResult = {
            chain,
            verified: contractInfo.success,
            name: contractInfo.contractName,
            abi: contractInfo.abi,
            contractType: tokenType || contractInfo.contractType,
            error: contractInfo.success ? undefined : "Contract not verified",
          };

          // Check if it's a diamond contract (only for verified contracts)
          if (contractInfo.success) {
            setSearchProgress(`Checking diamond pattern on ${chain.name}...`);

            const diamondCheck = await detectDiamond(address, chain);

            if (diamondCheck.isDiamond && diamondCheck.facetAddresses) {
              result.isDiamond = true;
              result.facetAddresses = diamondCheck.facetAddresses;

              // If this is the first diamond we found, analyze it fully
              if (!foundDiamondInfo) {
                setSearchProgress(`Analyzing diamond facets...`);
                foundDiamondInfo = await analyzeDiamond(
                  address,
                  diamondCheck.facetAddresses,
                  chain
                );
              }
            }
          }

          results.push(result);
        } catch (error) {
          results.push({
            chain,
            verified: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      setSearchResults(results);
      setDiamondInfo(foundDiamondInfo);

      // Callback with results
      if (onContractFound) {
        onContractFound(results, foundDiamondInfo || undefined);
      }

      setSearchProgress("Search complete!");
      setTimeout(() => setSearchProgress(""), 2000);
    } catch (error) {
      console.error("Search error:", error);
      setSearchProgress("Search failed");
      setTimeout(() => setSearchProgress(""), 3000);
    } finally {
      setIsSearching(false);
    }
  };

  // Toggle chain selection
  const toggleChain = (chainId: number) => {
    setSelectedChains((prev) =>
      prev.includes(chainId)
        ? prev.filter((id) => id !== chainId)
        : [...prev, chainId]
    );
  };

  // Select/Deselect all chains
  const toggleAllChains = () => {
    const allChainIds = SUPPORTED_CHAINS.map((c) => c.id);
    setSelectedChains(
      selectedChains.length === allChainIds.length ? [] : allChainIds
    );
  };

  return (
    <div className="panel">
      <h2 className="flex items-center gap-2 mb-4">
        <Network size={24} />
        Multi-Network Contract Search & Diamond Detection
      </h2>

      {/* Search Form */}
      <div className="space-y-4">
        {/* Contract Address Input */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Contract Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 border rounded-md"
            disabled={isSearching}
          />
        </div>

        {/* Network Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">
              Networks to Search
            </label>
            <button
              onClick={toggleAllChains}
              className="text-sm text-blue-600 hover:text-blue-800"
              disabled={isSearching}
            >
              {selectedChains.length === SUPPORTED_CHAINS.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {SUPPORTED_CHAINS.map((chain) => (
              <label
                key={chain.id}
                className="flex items-center space-x-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedChains.includes(chain.id)}
                  onChange={() => toggleChain(chain.id)}
                  disabled={isSearching}
                  className="rounded"
                />
                <span className="truncate">{chain.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Search Button */}
        <GlassButton
          onClick={searchContract}
          disabled={isSearching || !address || selectedChains.length === 0}
          variant="primary"
          size="lg"
          icon={isSearching ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
          style={{ width: '100%' }}
        >
          {isSearching ? 'Searching...' : 'Search Contract'}
        </GlassButton>

        {/* Progress */}
        {searchProgress && (
          <div className="text-sm text-gray-600 text-center py-2">
            {searchProgress}
          </div>
        )}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="mt-6 space-y-4">
          <h3 className="text-lg font-medium">Search Results</h3>

          {/* Diamond Summary */}
          {diamondInfo && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Diamond size={20} className="text-purple-600" />
                <span className="font-medium text-purple-800">
                  Diamond Contract Detected
                </span>
              </div>
              <p className="text-sm text-purple-700">
                This contract implements the Diamond Standard with{" "}
                {diamondInfo.facets.length} facets containing{" "}
                {diamondInfo.totalFunctions} total functions.
              </p>
            </div>
          )}

          {/* Network Results */}
          {searchResults.map((result) => (
            <div
              key={result.chain.id}
              className={`border rounded-lg p-4 ${result.verified ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {result.verified ? (
                    <CheckCircle size={20} className="text-green-600" />
                  ) : (
                    <XCircle size={20} className="text-red-600" />
                  )}

                  <div>
                    <div className="font-medium">{result.chain.name}</div>
                    {result.name && (
                      <div className="text-sm text-gray-600">{result.name}</div>
                    )}
                    {result.contractType && (
                      <div
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor:
                            result.contractType === "ERC721"
                              ? "rgba(139, 92, 246, 0.12)"
                              : result.contractType === "ERC1155"
                                ? "rgba(16, 185, 129, 0.12)"
                                : result.contractType === "ERC20"
                                  ? "rgba(245, 158, 11, 0.12)"
                                  : "rgba(107, 114, 128, 0.12)",
                          color:
                            result.contractType === "ERC721"
                              ? "#8b5cf6"
                              : result.contractType === "ERC1155"
                                ? "#10b981"
                                : result.contractType === "ERC20"
                                  ? "#f59e0b"
                                  : "#6b7280",
                          border: "1px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        {result.contractType}
                      </div>
                    )}
                  </div>

                  {result.isDiamond && (
                    <Diamond size={16} className="text-purple-600" />
                  )}
                </div>

                {result.verified && (
                  <button
                    onClick={() =>
                      setExpandedResult(
                        expandedResult === `${result.chain.id}`
                          ? null
                          : `${result.chain.id}`
                      )
                    }
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Details
                    {expandedResult === `${result.chain.id}` ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>
                )}
              </div>

              {result.error && (
                <p className="text-sm text-red-600 mt-2">{result.error}</p>
              )}

              {/* Expanded Details */}
              {expandedResult === `${result.chain.id}` && result.verified && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Address:</span>
                      <div className="font-mono text-xs break-all">
                        {address}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">Contract Type:</span>
                      <div>{result.contractType || "Unknown"}</div>
                    </div>
                  </div>

                  {result.isDiamond && result.facetAddresses && (
                    <div>
                      <span className="font-medium">
                        Facet Addresses ({result.facetAddresses.length}):
                      </span>
                      <div className="mt-2 space-y-1">
                        {result.facetAddresses.map((facetAddr, index) => (
                          <div
                            key={facetAddr}
                            className="text-xs font-mono bg-gray-100 p-2 rounded"
                          >
                            {index + 1}. {facetAddr}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      onClick={() => {
                        if (result.abi && result.chain) {
                          onContractSelected?.(
                            address,
                            result.chain,
                            result.abi,
                            {
                              name: result.name,
                              tokenInfo: result.contractType
                                ? { tokenType: result.contractType }
                                : undefined,
                              isDiamond: result.isDiamond,
                              facetAddresses: result.facetAddresses,
                            }
                          );
                        }
                      }}
                    >
                      <Building2 size={14} className="inline mr-1" />
                      Use in Builder
                    </button>
                    <a
                      href={`${result.chain.explorerUrl}/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                    >
                      <Eye size={14} className="inline mr-1" />
                      View on Explorer
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Diamond Facet Details */}
      {diamondInfo && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Diamond size={20} />
            Diamond Facets Analysis
          </h3>

          <div className="space-y-3">
            {diamondInfo.facets.map((facet, index) => (
              <div key={facet.address} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Facet #{index + 1}</span>
                    {facet.verified ? (
                      <CheckCircle size={16} className="text-green-600" />
                    ) : (
                      <XCircle size={16} className="text-red-600" />
                    )}
                    {facet.name && (
                      <span className="text-sm text-gray-600">
                        ({facet.name})
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {facet.functionCount} functions
                  </div>
                </div>

                <div className="text-xs font-mono text-gray-700 mb-2">
                  {facet.address}
                </div>

                {facet.verified ? (
                  <div className="text-sm text-green-700">
                    ✓ Verified contract with ABI available
                  </div>
                ) : (
                  <div className="text-sm text-red-700">
                    ⚠ Unverified contract - function calls may be limited
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiNetworkContractSearch;
