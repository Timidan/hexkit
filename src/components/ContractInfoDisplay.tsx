import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ethers } from "ethers";
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Coins,
  Hash,
  Activity,
  Eye,
  Edit,
  Shield,
  TrendingUp,
  Users,
  Image,
  Loader,
} from "lucide-react";
import InlineCopyButton from "./ui/InlineCopyButton";
import type { ContractInfo } from "../utils/contractAnalyzer";
import type { Chain } from "../types";
import {
  analyzeContract,
  getContractTypeIcon,
  getContractTypeDescription,
} from "../utils/contractAnalyzer";

interface ContractInfoDisplayProps {
  abi: string;
  contractAddress: string;
  chain: Chain;
  provider?: ethers.providers.Provider;
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
  } | null;
}

const ContractInfoDisplay: React.FC<ContractInfoDisplayProps> = ({
  abi,
  contractAddress,
  chain,
  provider,
  contractMetadata,
}) => {
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize provider creation to prevent unnecessary recreations
  const memoizedProvider = useMemo(() => {
    return provider;
  }, [provider]); // Only recreate if provider changes

  // Memoize the analysis key to prevent unnecessary re-runs
  const analysisKey = useMemo(() => {
    if (!abi || !contractAddress) return "";
    // Create a stable key based on contract address, chain, and ABI structure
    const abiHash =
      abi.length +
      (abi.includes("function") ? "f" : "") +
      (abi.includes("event") ? "e" : "");
    return `${contractAddress.toLowerCase()}-${chain.id}-${abiHash}`;
  }, [contractAddress, chain.id, abi]);

  const analyzeContractInfo = useCallback(async () => {
    if (!abi || !contractAddress) return;

    setLoading(true);
    setError(null);

    try {
      const info = await analyzeContract(
        abi,
        contractAddress,
        chain,
        memoizedProvider
      );
      setContractInfo(info);
    } catch (err: any) {
      setError("Failed to analyze contract: " + err.message);
      console.error("Contract analysis error:", err);
    } finally {
      setLoading(false);
    }
  }, [abi, contractAddress, chain, memoizedProvider]);

  useEffect(() => {
    if (analysisKey) {
      analyzeContractInfo();
    }
  }, [analysisKey, analyzeContractInfo]); // Only re-run when the analysis key changes and is not empty

  if (loading) {
    return (
      <div
        style={{
          background: "rgba(59, 130, 246, 0.05)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <h4
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            fontWeight: "600",
            color: "#374151",
            marginBottom: "12px",
          }}
        >
          <FileText size={16} />
          Analyzing Contract...
        </h4>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#6b7280",
            fontSize: "13px",
          }}
        >
          <Loader size={14} className="animate-spin" />
          Fetching contract metadata and token information...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          background: "rgba(239, 68, 68, 0.05)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <h4
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            fontWeight: "600",
            color: "#374151",
            marginBottom: "12px",
          }}
        >
          <FileText size={16} />
          Contract Analysis
        </h4>
        <p
          style={{
            color: "#ef4444",
            fontSize: "13px",
            margin: "0",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <AlertTriangle size={14} />
          {error}
        </p>
      </div>
    );
  }

  if (!contractInfo) {
    return null;
  }

  const getContractTypeIcon = (type: string) => {
    switch (type) {
      case "ERC20":
        return <Coins size={20} />;
      case "ERC721":
        return <Image size={20} />;
      case "ERC1155":
        return <Hash size={20} />;
      case "PROXY":
        return <Shield size={20} />;
      case "MULTISIG":
        return <Users size={20} />;
      default:
        return <FileText size={20} />;
    }
  };

  const getContractTypeColor = (type: string) => {
    switch (type) {
      case "ERC20":
        return "#f59e0b"; // Amber
      case "ERC721":
        return "#8b5cf6"; // Purple
      case "ERC1155":
        return "#10b981"; // Emerald
      case "PROXY":
        return "#3b82f6"; // Blue
      case "MULTISIG":
        return "#ef4444"; // Red
      default:
        return "#6b7280"; // Gray
    }
  };

  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "12px",
        overflow: "hidden",
        marginBottom: "16px",
      }}
    >
      {/* Header with contract type */}
      <div
        style={{
          background: "rgba(59, 130, 246, 0.1)",
          padding: "16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <h4
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "16px",
            fontWeight: "600",
            color: "#374151",
            margin: "0 0 12px 0",
          }}
        >
          <FileText size={18} />
          Contract Information
        </h4>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            {contractInfo.tokenIcon ? (
              <img
                src={contractInfo.tokenIcon}
                alt={`${contractInfo.symbol || "Token"} icon`}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "2px solid rgba(255, 255, 255, 0.2)",
                }}
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                  const fallback = img.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}
            <div
              style={{
                display: contractInfo.tokenIcon ? "none" : "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: `${getContractTypeColor(contractInfo.contractType)}20`,
                color: getContractTypeColor(contractInfo.contractType),
              }}
            >
              {getContractTypeIcon(contractInfo.contractType)}
            </div>
            <div>
              {/* Contract Name if available */}
              {contractMetadata?.name && (
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "#ffffff",
                    marginBottom: "4px",
                  }}
                >
                  {contractMetadata.name}
                </div>
              )}

              <div
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: contractMetadata?.name ? "#d1d5db" : "#ffffff",
                  marginBottom: "2px",
                }}
              >
                {contractInfo.contractType}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#a0a0a0",
                }}
              >
                {getContractTypeDescription(contractInfo.contractType)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "20px",
              background: contractInfo.verified
                ? "rgba(34, 197, 94, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${contractInfo.verified ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            }}
          >
            {contractInfo.verified ? (
              <CheckCircle size={14} style={{ color: "#22c55e" }} />
            ) : (
              <AlertTriangle size={14} style={{ color: "#ef4444" }} />
            )}
            <span
              style={{
                fontSize: "12px",
                fontWeight: "500",
                color: contractInfo.verified ? "#22c55e" : "#ef4444",
              }}
            >
              {contractInfo.verified ? "Verified" : "Unverified"}
            </span>
          </div>
        </div>
      </div>

      {/* Token-specific information - Use API data first, then contract analyzer data */}
      {(contractInfo.contractType === "ERC20" ||
        contractInfo.contractType === "ERC721" ||
        (contractMetadata?.tokenInfo &&
          (contractMetadata?.tokenInfo?.symbol ||
            contractMetadata?.tokenInfo?.decimals ||
            contractMetadata?.tokenInfo?.name))) && (
        <div style={{ padding: "16px" }}>
          <h5
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              fontWeight: "600",
              color: "#ffffff",
              marginBottom: "12px",
            }}
          >
            <Coins
              size={14}
              style={{ color: getContractTypeColor(contractInfo.contractType) }}
            />
            Token Details
          </h5>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            {(contractMetadata?.tokenInfo?.name || contractInfo.name) && (
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    fontWeight: "500",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "4px",
                  }}
                >
                  Token Name
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#ffffff",
                    fontWeight: "600",
                  }}
                >
                  {contractMetadata?.tokenInfo?.name || contractInfo.name}
                </div>
              </div>
            )}

            {(contractMetadata?.tokenInfo?.symbol || contractInfo.symbol) && (
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    fontWeight: "500",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "4px",
                  }}
                >
                  Symbol
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#ffffff",
                    fontWeight: "600",
                    fontFamily: "Monaco, Menlo, monospace",
                  }}
                >
                  {contractMetadata?.tokenInfo?.symbol || contractInfo.symbol}
                </div>
              </div>
            )}

            {(contractMetadata?.tokenInfo?.decimals ||
              contractInfo.decimals !== undefined) && (
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    fontWeight: "500",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "4px",
                  }}
                >
                  Decimals
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#ffffff",
                    fontWeight: "600",
                  }}
                >
                  {contractMetadata?.tokenInfo?.decimals ||
                    contractInfo.decimals}
                </div>
              </div>
            )}

            {(contractMetadata?.tokenInfo?.totalSupply ||
              contractInfo.totalSupply) && (
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    fontWeight: "500",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "4px",
                  }}
                >
                  Total Supply
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#ffffff",
                    fontWeight: "600",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <TrendingUp
                    size={12}
                    style={{
                      color: getContractTypeColor(contractInfo.contractType),
                    }}
                  />
                  {(() => {
                    const totalSupply =
                      contractMetadata?.tokenInfo?.totalSupply ||
                      contractInfo.totalSupply;
                    const symbol =
                      contractMetadata?.tokenInfo?.symbol ||
                      contractInfo.symbol;
                    const decimals =
                      contractMetadata?.tokenInfo?.decimals ||
                      contractInfo.decimals;

                    if (totalSupply && decimals) {
                      // Convert from wei to human readable format
                      const divisor = Math.pow(
                        10,
                        parseInt(decimals.toString())
                      );
                      const humanReadable = (
                        parseInt(totalSupply) / divisor
                      ).toLocaleString();
                      return `${humanReadable} ${symbol || ""}`;
                    }

                    return `${parseInt(totalSupply || "0").toLocaleString()} ${symbol || ""}`;
                  })()}
                </div>
              </div>
            )}

            {contractMetadata?.tokenInfo?.tokenType && (
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    fontWeight: "500",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "4px",
                  }}
                >
                  Token Standard
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#ffffff",
                    fontWeight: "600",
                  }}
                >
                  {contractMetadata.tokenInfo.tokenType}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contract functions summary */}
      <div
        style={{
          padding: "16px",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <h5
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "14px",
            fontWeight: "600",
            color: "#ffffff",
            marginBottom: "12px",
          }}
        >
          <Activity size={14} style={{ color: "#6366f1" }} />
          Function Summary
        </h5>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
          }}
        >
          <div
            style={{
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "8px",
              padding: "12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "24px",
                fontWeight: "700",
                color: "#6366f1",
                marginBottom: "4px",
              }}
            >
              {contractInfo.functions.length}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                fontWeight: "500",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Functions
            </div>
          </div>

          <div
            style={{
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: "8px",
              padding: "12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "24px",
                fontWeight: "700",
                color: "#10b981",
                marginBottom: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Eye size={16} />
              {
                contractInfo.functions.filter(
                  (f) =>
                    f.type === "function" &&
                    (f.stateMutability === "view" ||
                      f.stateMutability === "pure")
                ).length
              }
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                fontWeight: "500",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Read Functions
            </div>
          </div>

          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "8px",
              padding: "12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "24px",
                fontWeight: "700",
                color: "#ef4444",
                marginBottom: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Edit size={16} />
              {
                contractInfo.functions.filter(
                  (f) =>
                    f.type === "function" &&
                    (f.stateMutability === "nonpayable" ||
                      f.stateMutability === "payable")
                ).length
              }
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                fontWeight: "500",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Write Functions
            </div>
          </div>
        </div>
      </div>

      {/* Common functions highlight */}
      {contractInfo.contractType === "ERC20" && (
        <div
          style={{
            padding: "16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            background: "rgba(245, 158, 11, 0.03)",
          }}
        >
          <h5
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              fontWeight: "600",
              color: "#ffffff",
              marginBottom: "12px",
            }}
          >
            <Coins size={14} style={{ color: "#f59e0b" }} />
            Standard ERC20 Functions
          </h5>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            {["transfer", "approve", "balanceOf", "allowance"].map(
              (funcName) => {
                const hasFunction = contractInfo.functions.some(
                  (f) => f.name === funcName
                );
                return (
                  <span
                    key={funcName}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 10px",
                      borderRadius: "16px",
                      fontSize: "12px",
                      fontWeight: "500",
                      fontFamily: "Monaco, Menlo, monospace",
                      background: hasFunction
                        ? "rgba(34, 197, 94, 0.15)"
                        : "rgba(239, 68, 68, 0.15)",
                      border: `1px solid ${hasFunction ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                      color: hasFunction ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {hasFunction ? (
                      <CheckCircle size={10} />
                    ) : (
                      <AlertTriangle size={10} />
                    )}
                    {funcName}
                  </span>
                );
              }
            )}
          </div>
        </div>
      )}

      {contractInfo.contractType === "ERC721" && (
        <div
          style={{
            padding: "16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            background: "rgba(139, 92, 246, 0.03)",
          }}
        >
          <h5
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              fontWeight: "600",
              color: "#ffffff",
              marginBottom: "12px",
            }}
          >
            <Image size={14} style={{ color: "#8b5cf6" }} />
            Standard ERC721 Functions
          </h5>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            {["transferFrom", "approve", "ownerOf", "balanceOf"].map(
              (funcName) => {
                const hasFunction = contractInfo.functions.some(
                  (f) => f.name === funcName
                );
                return (
                  <span
                    key={funcName}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 10px",
                      borderRadius: "16px",
                      fontSize: "12px",
                      fontWeight: "500",
                      fontFamily: "Monaco, Menlo, monospace",
                      background: hasFunction
                        ? "rgba(34, 197, 94, 0.15)"
                        : "rgba(239, 68, 68, 0.15)",
                      border: `1px solid ${hasFunction ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                      color: hasFunction ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {hasFunction ? (
                      <CheckCircle size={10} />
                    ) : (
                      <AlertTriangle size={10} />
                    )}
                    {funcName}
                  </span>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* Contract address */}
      <div
        style={{
          padding: "16px",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          background: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <h5
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "14px",
            fontWeight: "600",
            color: "#ffffff",
            marginBottom: "12px",
          }}
        >
          <Hash size={14} style={{ color: "#6b7280" }} />
          Contract Address
        </h5>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(0, 0, 0, 0.2)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            padding: "10px 12px",
          }}
        >
          <code
            style={{
              flex: 1,
              fontSize: "13px",
              fontFamily: "Monaco, Menlo, monospace",
              color: "#e5e5e5",
              background: "none",
              wordBreak: "break-all",
            }}
          >
            {contractAddress}
          </code>
          <div style={{ display: "flex", gap: "6px" }}>
            <InlineCopyButton
              value={contractAddress}
              ariaLabel="Copy contract address"
              iconSize={14}
              size={32}
            />
            <a
              href={`${chain.explorerUrl}/address/${contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              title="View on block explorer"
              style={{
                background: "rgba(34, 197, 94, 0.15)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "6px",
                padding: "6px",
                cursor: "pointer",
                color: "#22c55e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(34, 197, 94, 0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(34, 197, 94, 0.15)";
              }}
            >
              <Activity size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractInfoDisplay;
