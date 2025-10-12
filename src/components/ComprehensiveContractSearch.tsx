import React, { useState, useEffect } from "react";
import { type ContractInfoResult } from "../utils/comprehensiveContractFetcher";
import type { Chain } from "../types";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Search,
  Coins,
  Image,
  FileText,
  ChevronRight,
  Radio,
  Wifi,
} from "lucide-react";
import { useContractLookup } from "../hooks/useContractLookup";

interface ComprehensiveContractSearchProps {
  onContractFound?: (result: ContractInfoResult) => void;
  onLoadingChange?: (loading: boolean) => void;
}

const ComprehensiveContractSearch: React.FC<
  ComprehensiveContractSearchProps
> = ({ onContractFound, onLoadingChange }) => {
  const [contractAddress, setContractAddress] = useState("");
  const [selectedChain, setSelectedChain] = useState<Chain | null>(null);
  const [searchResult, setSearchResult] = useState<ContractInfoResult | null>(
    null
  );
  const [error, setError] = useState<string>("");
  const [searchProgress, setSearchProgress] = useState<
    NonNullable<ContractInfoResult["searchProgress"]>
  >([]);
  const [originalResult, setOriginalResult] =
    useState<ContractInfoResult | null>(null);

  const {
    loading: isLoading,
    error: lookupError,
    result,
    refetch,
    cancel,
  } = useContractLookup(contractAddress, selectedChain, {
    auto: false,
    progressCallback: (progress) => {
      setSearchProgress((prev) => [...prev, progress]);
    },
  });

  // Supported chains
  const supportedChains: Chain[] = [
    {
      id: 1,
      name: "Ethereum",
      rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${import.meta.env.API_KEY}`,
      explorerUrl: "https://etherscan.io",
      blockExplorer: "https://etherscan.io",
      apiUrl: "https://api.etherscan.io/api",
      explorers: [
        {
          name: "Etherscan",
          url: "https://api.etherscan.io/api",
          type: "etherscan",
        },
      ],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
    {
      id: 8453,
      name: "Base",
      rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${import.meta.env.API_KEY}`,
      explorerUrl: "https://basescan.org",
      blockExplorer: "https://basescan.org",
      apiUrl: "https://api.basescan.org/api",
      explorers: [
        {
          name: "BaseScan",
          url: "https://api.basescan.org/api",
          type: "etherscan",
        },
        {
          name: "Base Blockscout",
          url: "https://base-mainnet.blockscout.com/api",
          type: "blockscout",
        },
      ],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
    {
      id: 137,
      name: "Polygon",
      rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${import.meta.env.API_KEY}`,
      explorerUrl: "https://polygonscan.com",
      blockExplorer: "https://polygonscan.com",
      apiUrl: "https://api.polygonscan.com/api",
      explorers: [
        {
          name: "PolygonScan",
          url: "https://api.polygonscan.com/api",
          type: "etherscan",
        },
        {
          name: "Polygon Blockscout",
          url: "https://polygon.blockscout.com/api",
          type: "blockscout",
        },
      ],
      nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    },
    {
      id: 42161,
      name: "Arbitrum",
      rpcUrl: `https://arb-mainnet.g.alchemy.com/v2/${import.meta.env.API_KEY}`,
      explorerUrl: "https://arbiscan.io",
      blockExplorer: "https://arbiscan.io",
      apiUrl: "https://api.arbiscan.io/api",
      explorers: [
        {
          name: "Arbiscan",
          url: "https://api.arbiscan.io/api",
          type: "etherscan",
        },
        {
          name: "Arbitrum Blockscout",
          url: "https://arbitrum.blockscout.com/api",
          type: "blockscout",
        },
      ],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
  ];

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    if (searchResult) {
      console.log(" [UI] searchResult updated:", {
        success: searchResult.success,
        contractName: searchResult.contractName,
        tokenName: searchResult.tokenInfo?.name,
        source: searchResult.source,
        explorerName: searchResult.explorerName,
      });
    }
  }, [searchResult]);

  const handleSearch = async () => {
    if (!contractAddress || !selectedChain) {
      setError("Please enter a contract address and select a network");
      return;
    }

    if (!contractAddress.startsWith("0x") || contractAddress.length !== 42) {
      setError("Invalid contract address format");
      return;
    }

    setError("");
    setSearchResult(null);
    setSearchProgress([]);

    try {
      await refetch();
    } catch (error) {
      setError("Network error occurred while fetching contract information");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "searching":
        return <Loader2 className="w-4 h-4 animate-pulse text-blue-500" />;
      case "found":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "not_found":
        return <XCircle className="w-4 h-4 text-gray-400" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Search className="w-4 h-4 text-gray-400" />;
    }
  };

  useEffect(() => () => {
    cancel();
  }, [cancel]);

  useEffect(() => {
    if (!lookupError) return;
    setError(lookupError);
  }, [lookupError]);

  useEffect(() => {
    if (!result) return;

    setSearchResult(result);
    setOriginalResult(result);
    setSearchProgress(result.searchProgress || []);

    if (result.success) {
      onContractFound?.(result);
      setError("");
    } else if (result.error) {
      setError(result.error);
    }
  }, [onContractFound, result]);

  const getTokenIcon = (tokenType: string) => {
    switch (tokenType) {
      case "ERC20":
        return <Coins className="w-5 h-5 text-amber-500" />;
      case "ERC721":
        return <Image className="w-5 h-5 text-purple-500" />;
      case "ERC1155":
        return <FileText className="w-5 h-5 text-emerald-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#0a0a0a",
        border: "1px solid #2a2a2a",
        borderRadius: "12px",
        padding: "24px",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      <h3
        style={{
          fontSize: "20px",
          fontWeight: "600",
          color: "#ffffff",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <Search className="w-5 h-5" />
        Comprehensive Contract Search
      </h3>

      <div style={{ marginBottom: "16px" }}>
        <label
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: "500",
            color: "#9ca3af",
            marginBottom: "6px",
          }}
        >
          Contract Address
        </label>
        <input
          type="text"
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          placeholder="0x..."
          style={{
            width: "100%",
            padding: "12px 16px",
            backgroundColor: "#1a1a1a",
            border: "1px solid #374151",
            borderRadius: "8px",
            color: "#ffffff",
            fontSize: "15px",
            fontFamily: "monospace",
          }}
        />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: "500",
            color: "#9ca3af",
            marginBottom: "6px",
          }}
        >
          Network
        </label>
        <select
          value={selectedChain?.id || ""}
          onChange={(e) => {
            const chain = supportedChains.find(
              (chain) => chain.id === parseInt(e.target.value)
            );
            setSelectedChain(chain || null);
          }}
          style={{
            width: "100%",
            padding: "12px 16px",
            backgroundColor: "#1a1a1a",
            border: "1px solid #374151",
            borderRadius: "8px",
            color: "#ffffff",
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          <option value="">Select a network...</option>
          {supportedChains.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSearch}
        disabled={isLoading || !contractAddress || !selectedChain}
        style={{
          width: "100%",
          padding: "12px 24px",
          backgroundColor: isLoading ? "#374151" : "#3b82f6",
          border: "none",
          borderRadius: "8px",
          color: "#ffffff",
          fontSize: "15px",
          fontWeight: "500",
          cursor: isLoading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Searching...
          </>
        ) : (
          <>
            <Search className="w-4 h-4" />
            Search Contract
          </>
        )}
      </button>

      {error && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px 16px",
            backgroundColor: "#dc262620",
            border: "1px solid #dc2626",
            borderRadius: "8px",
            color: "#ef4444",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {(isLoading || (searchProgress && searchProgress.length > 0)) && (
        <div style={{ marginTop: "20px" }}>
          <h4
            style={{
              fontSize: "16px",
              fontWeight: "500",
              color: "#ffffff",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Wifi className="w-4 h-4" />
            Search Progress
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {searchProgress?.map((progress, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  backgroundColor:
                    progress.status === "found"
                      ? "#064e3b20"
                      : progress.status === "error"
                      ? "#7f1d1d20"
                      : "#1a1a1a",
                  border:
                    progress.status === "found"
                      ? "1px solid #10b981"
                      : progress.status === "error"
                      ? "1px solid #ef4444"
                      : "1px solid #374151",
                  borderRadius: "6px",
                  transition: "all 0.3s ease",
                }}
              >
                {getStatusIcon(progress.status)}
                <span
                  style={{
                    fontSize: "14px",
                    color:
                      progress.status === "found"
                        ? "#10b981"
                        : progress.status === "error"
                        ? "#ef4444"
                        : "#9ca3af",
                    flex: 1,
                  }}
                >
                  {progress.source}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color:
                      progress.status === "found"
                        ? "#34d399"
                        : progress.status === "error"
                        ? "#fca5a5"
                        : "#6b7280",
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {progress.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {searchResult && searchResult.success && (
        <div style={{ marginTop: "20px" }}>
          <h4
            style={{
              fontSize: "16px",
              fontWeight: "500",
              color: "#ffffff",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle className="w-4 h-4 text-green-500" />
            Contract Found
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div
              style={{
                padding: "16px",
                backgroundColor: "#1a1a1a",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                border: "1px solid #374151",
              }}
            >
              {getTokenIcon(searchResult.tokenType || "UNKNOWN")}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#9ca3af",
                    marginBottom: "4px",
                  }}
                >
                  Contract Name
                </div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#ffffff",
                  }}
                >
                  {searchResult.contractName ||
                    searchResult.tokenInfo?.name ||
                    "Unknown Contract"}
                </div>
                {searchResult.tokenInfo?.symbol && (
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#6b7280",
                      marginTop: "2px",
                    }}
                  >
                    Symbol: {searchResult.tokenInfo.symbol}
                  </div>
                )}
              </div>
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>

            <div
              style={{
                padding: "16px",
                backgroundColor: "#1a1a1a",
                borderRadius: "8px",
                border: "1px solid #374151",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  color: "#9ca3af",
                  marginBottom: "12px",
                }}
              >
                Contract Details
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#9ca3af",
                      marginBottom: "4px",
                    }}
                  >
                    Network
                  </div>
                  <div
                    style={{
                      color: "#ffffff",
                      fontWeight: "500",
                    }}
                  >
                    {searchResult.chain.name}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "#9ca3af",
                      marginBottom: "4px",
                    }}
                  >
                    Data Source
                  </div>
                  <div
                    style={{
                      color:
                        searchResult.source === "sourcify"
                          ? "#00ffff"
                          : searchResult.source === "blockscout"
                          ? "#10b981"
                          : searchResult.source === "etherscan"
                          ? "#3b82f6"
                          : "#ffffff",
                      fontWeight: "500",
                      textTransform: "capitalize",
                    }}
                  >
                    {searchResult.source || "Unknown"}
                    {searchResult.source && (
                      <span
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginLeft: "4px",
                          fontWeight: "400",
                        }}
                      >
                        ({searchResult.explorerName})
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "#9ca3af",
                      marginBottom: "4px",
                    }}
                  >
                    Token Type
                  </div>
                  <div
                    style={{
                      color: "#ffffff",
                      fontWeight: "500",
                    }}
                  >
                    {searchResult.tokenType || "Unknown"}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "#9ca3af",
                      marginBottom: "4px",
                    }}
                  >
                    Status
                  </div>
                  <div
                    style={{
                      color: "#10b981",
                      fontWeight: "500",
                    }}
                  >
                     Verified
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: "12px",
                  paddingTop: "12px",
                  borderTop: "1px solid #374151",
                  fontSize: "12px",
                  color: "#6b7280",
                }}
              >
                <div>
                  <strong>Debug Info:</strong>
                </div>
                <div>
                  Contract Name from source: {searchResult.contractName || "None"}
                </div>
                <div>
                  Token Name from metadata: {searchResult.tokenInfo?.name || "None"}
                </div>
                <div>
                  Final displayed name:{" "}
                  {searchResult.contractName ||
                    searchResult.tokenInfo?.name ||
                    "Unknown"}
                </div>
                {originalResult && (
                  <div style={{ marginTop: "8px" }}>
                    <div>
                      <strong>Name Change Detection:</strong>
                    </div>
                    <div>
                      Original contract name: {originalResult.contractName || "None"}
                    </div>
                    <div>
                      Current contract name: {searchResult.contractName || "None"}
                    </div>
                    <div
                      style={{
                        color:
                          originalResult.contractName !== searchResult.contractName
                            ? "#ef4444"
                            : "#10b981",
                      }}
                    >
                      Name changed:{" "}
                      {originalResult.contractName !== searchResult.contractName
                        ? "YES"
                        : "NO"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {searchResult.tokenType !== "UNKNOWN" &&
              searchResult.tokenInfo && (
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "#1a1a1a",
                    borderRadius: "8px",
                    border:
                      searchResult.tokenType === "ERC20"
                        ? "1px solid #f59e0b"
                        : searchResult.tokenType === "ERC721"
                        ? "1px solid #a855f7"
                        : searchResult.tokenType === "ERC1155"
                        ? "1px solid #10b981"
                        : "1px solid #374151",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#9ca3af",
                      marginBottom: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {getTokenIcon(searchResult.tokenType || "UNKNOWN")}
                    Token Information ({searchResult.tokenType})
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      fontSize: "14px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#9ca3af",
                          marginBottom: "2px",
                        }}
                      >
                        Name
                      </div>
                      <div
                        style={{
                          color: "#ffffff",
                          fontWeight: "500",
                        }}
                      >
                        {searchResult.tokenInfo.name || "Unknown"}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          color: "#9ca3af",
                          marginBottom: "2px",
                        }}
                      >
                        Symbol
                      </div>
                      <div
                        style={{
                          color: "#ffffff",
                          fontWeight: "500",
                        }}
                      >
                        {searchResult.tokenInfo.symbol || "UNKNOWN"}
                      </div>
                    </div>
                    {searchResult.tokenInfo.decimals !== undefined && (
                      <div>
                        <div
                          style={{
                            color: "#9ca3af",
                            marginBottom: "2px",
                          }}
                        >
                          Decimals
                        </div>
                        <div
                          style={{
                            color: "#ffffff",
                            fontWeight: "500",
                          }}
                        >
                          {searchResult.tokenInfo.decimals}
                        </div>
                      </div>
                    )}
                    {searchResult.tokenInfo.totalSupply && (
                      <div>
                        <div
                          style={{
                            color: "#9ca3af",
                            marginBottom: "2px",
                          }}
                        >
                          Total Supply
                        </div>
                        <div
                          style={{
                            color: "#ffffff",
                            fontWeight: "500",
                            fontFamily: "monospace",
                          }}
                        >
                          {searchResult.tokenInfo.totalSupply}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {searchResult.externalFunctions && (
              <div
                style={{
                  padding: "12px 16px",
                  backgroundColor: "#1a1a1a",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#9ca3af",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>External Functions</span>
                  <span style={{ color: "#ffffff" }}>
                    {searchResult.externalFunctions.length} found
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {searchResult.externalFunctions.slice(0, 5).map((func, index) => (
                    <div
                      key={index}
                      style={{
                        fontSize: "13px",
                        color: "#9ca3af",
                        fontFamily: "monospace",
                        padding: "4px 8px",
                        backgroundColor: "#0a0a0a",
                        borderRadius: "4px",
                      }}
                    >
                      {func.signature}
                    </div>
                  ))}
                  {searchResult.externalFunctions.length > 5 && (
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#6b7280",
                        fontStyle: "italic",
                        padding: "4px 8px",
                      }}
                    >
                      +{searchResult.externalFunctions.length - 5} more functions...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComprehensiveContractSearch;
