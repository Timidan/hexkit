/**
 * ContractInfoCard - Displays contract metadata card when contractInfo is available.
 * Extracted from ContractColumn.tsx to reduce file size.
 *
 * Shows: chain icon, contract name, ABI source badge, proxy badge,
 * token type detection, symbol/decimals, and read/write function counts.
 */
import React from "react";
import {
  Loader2Icon,
  GemIcon,
  BookOpenIcon,
  EditIcon,
} from "../../icons/IconLibrary";
import { Badge } from "../../ui/badge";
import ChainIcon from "../../icons/ChainIcon";
import {
  SourcifyLogo,
  BlockscoutLogo,
  EtherscanLogo,
  ManualLogo,
} from "../../SourceLogos";
import { useGridContext } from "../GridContext";

export default function ContractInfoCard(): React.ReactElement | null {
  const ctx: any = useGridContext();
  const {
    contractInfo,
    contractName,
    isLoadingABI,
    isLoadingContractInfo,
    abiSource,
    proxyInfo,
    tokenInfo,
    tokenDetection,
    isDetectingTokenType,
    isERC20,
    isERC721,
    isERC1155,
    isERC777,
    isERC4626,
    isERC2981,
    isDiamond,
    readFunctions,
    writeFunctions,
    totalFacetReads,
    totalFacetWrites,
    isFacetDataPending,
    resolvedContractName,
    selectedNetwork,
    isFetchingContractDetails,
  } = ctx;

  if (!contractInfo) return null;

  return (
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
            <Loader2Icon
              width={20}
              height={20}
              style={{
                color: "#22c55e",
                animation: "spin 1s linear infinite",
              }}
            />
            <span
              style={{
                fontSize: "15px",
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
              : "rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "25px",
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
              fontSize: "19px",
              color: "#fff",
              marginBottom: "6px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {isLoadingABI ? (
              <div
                className="shimmer-loading"
                style={{
                  width: "140px",
                  height: "22px",
                }}
              />
            ) : (
              <span style={{ flexShrink: 1, minWidth: 0 }}>{resolvedContractName}</span>
            )}
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
                <GemIcon width={12} height={12} />
              </span>
            )}
            {/* Source badge - only show when not loading */}
            {isLoadingABI ? (
              <div
                className="shimmer-loading"
                style={{
                  width: "70px",
                  height: "18px",
                }}
              />
            ) : abiSource && (
              <Badge
                variant={
                  abiSource === "sourcify"
                    ? "success"
                    : abiSource === "blockscout"
                      ? "info"
                      : abiSource === "etherscan"
                        ? "accent"
                        : abiSource === "blockscout-bytecode"
                          ? "teal"
                          : "secondary"
                }
                size="sm"
                className="uppercase tracking-wide cursor-help gap-1"
                style={{ flexShrink: 0, flexGrow: 0, width: "fit-content" }}
                title={`Contract ABI verified from ${
                  abiSource === "blockscout-bytecode"
                    ? "Blockscout Bytecode DB"
                    : abiSource.charAt(0).toUpperCase() +
                      abiSource.slice(1)
                } - ${
                  abiSource === "sourcify"
                    ? "Source code verified with reproducible builds"
                    : abiSource === "blockscout"
                      ? "Verified contract explorer"
                      : abiSource === "blockscout-bytecode"
                        ? "Shared bytecode database fallback"
                        : "Blockchain explorer verification"
                }`}
              >
                {abiSource === "blockscout-bytecode"
                  ? "bytecode-db"
                  : abiSource}
                {abiSource === "sourcify" && <SourcifyLogo />}
                {(abiSource === "blockscout" ||
                  abiSource === "blockscout-bytecode") && (
                  <BlockscoutLogo />
                )}
                {abiSource === "etherscan" && <EtherscanLogo />}
                {abiSource === "manual" && <ManualLogo />}
              </Badge>
            )}
            {/* Proxy type badge */}
            {proxyInfo?.isProxy && !isDiamond && (
              <Badge
                variant="secondary"
                size="sm"
                className="uppercase tracking-wide cursor-help gap-1"
                style={{ flexShrink: 0, flexGrow: 0, width: "fit-content" }}
                title={`${
                  proxyInfo.proxyType === 'eip1967' ? 'EIP-1967 Transparent Proxy' :
                  proxyInfo.proxyType === 'transparent' ? 'Transparent Proxy' :
                  proxyInfo.proxyType === 'eip1967-beacon' ? 'EIP-1967 Beacon Proxy' :
                  proxyInfo.proxyType === 'eip1167' ? 'EIP-1167 Minimal Proxy (Clone)' :
                  proxyInfo.proxyType === 'eip1822' ? 'EIP-1822 UUPS Proxy' :
                  proxyInfo.proxyType === 'gnosis-safe' ? 'Gnosis Safe Proxy' :
                  'Proxy Contract'
                }${proxyInfo.implementationAddress ? ` → ${proxyInfo.implementationAddress.slice(0, 10)}...` : ''}`}
              >
                {proxyInfo.proxyType === 'eip1967' && 'EIP-1967'}
                {proxyInfo.proxyType === 'transparent' && 'Transparent'}
                {proxyInfo.proxyType === 'eip1967-beacon' && 'Beacon'}
                {proxyInfo.proxyType === 'eip1167' && 'Clone'}
                {proxyInfo.proxyType === 'eip1822' && 'UUPS'}
                {proxyInfo.proxyType === 'gnosis-safe' && 'Safe'}
                {!['eip1967', 'transparent', 'eip1967-beacon', 'eip1167', 'eip1822', 'gnosis-safe'].includes(proxyInfo.proxyType || '') && 'Proxy'}
              </Badge>
            )}
          </div>
          {/* Token type badge - show loading skeleton while detecting */}
          {isDetectingTokenType ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div
                className="shimmer-loading"
                style={{
                  width: "100px",
                  height: "24px",
                }}
              />
            </div>
          ) : tokenInfo ||
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
                  fontSize: "15px",
                  color:
                    tokenDetection?.type === "ERC721" || tokenDetection?.type === "ERC1155"
                      ? "#f59e0b"
                      : tokenDetection?.type
                        ? "#10b981"
                        : "#94a3b8",
                  fontWeight: "600",
                  padding: "2px 8px",
                  background:
                    tokenDetection?.type === "ERC721" || tokenDetection?.type === "ERC1155"
                      ? "rgba(245, 158, 11, 0.1)"
                      : tokenDetection?.type
                        ? "rgba(16, 185, 129, 0.1)"
                        : "rgba(148, 163, 184, 0.1)",
                  borderRadius: "6px",
                  display: "inline-block",
                  width: "fit-content",
                }}
              >
                {(() => {
                  const typeName = tokenInfo?.name || "";
                  const contractDisplayName = contractName || "";

                  // Use universal detection results
                  if (tokenDetection?.type) {
                    let typeLabel = "";

                    switch (tokenDetection.type) {
                      case "ERC1155":
                        typeLabel = "ERC1155 Multi-Token";
                        break;
                      case "ERC721":
                        typeLabel = "ERC721 NFT";
                        break;
                      case "ERC20":
                        typeLabel = "ERC20 Token";
                        break;
                      case "ERC777":
                        typeLabel = "ERC777 Token";
                        break;
                      case "ERC4626":
                        typeLabel = "ERC4626 Vault";
                        break;
                      case "ERC2981":
                        typeLabel = "Royalty Contract";
                        break;
                      default:
                        typeLabel = "Unknown Token";
                    }

                    if (tokenDetection.isDiamond) {
                      typeLabel = `Diamond Proxy (${typeLabel})`;
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
                          {tokenDetection.type && (
                            <Badge
                              variant={
                                tokenDetection.type === "ERC721"
                                  ? "accent"
                                  : tokenDetection.type === "ERC1155"
                                    ? "success"
                                    : tokenDetection.type === "ERC20"
                                      ? "warning"
                                      : "secondary"
                              }
                              size="sm"
                              style={{ flexShrink: 0, flexGrow: 0, width: "fit-content" }}
                            >
                              {tokenDetection.type}
                            </Badge>
                          )}
                        </div>
                        {tokenDetection.error && (
                          <div
                            style={{
                              fontSize: "12px",
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
                    return "Diamond Proxy";
                  } else if (
                    isERC1155 ||
                    typeName.includes("ERC1155")
                  ) {
                    return " ERC1155 Multi-Token";
                  } else if (
                    isERC721 ||
                    typeName.includes("ERC721")
                  ) {
                    return " ERC721 NFT";
                  } else if (
                    isERC777 ||
                    typeName.includes("ERC777")
                  ) {
                    return "ERC777 Token";
                  } else if (
                    isERC4626 ||
                    typeName.includes("ERC4626")
                  ) {
                    return " ERC4626 Vault";
                  } else if (
                    isERC2981 ||
                    typeName.includes("Royalty")
                  ) {
                    return " Royalty Contract";
                  } else if (
                    isERC20 ||
                    typeName.includes("ERC20")
                  ) {
                    return " ERC20 Token";
                  } else {
                    return "Smart Contract";
                  }
                })()}
              </div>
              {(tokenDetection?.type ? true : false) && (
                <div
                  style={{
                    fontSize: "14px",
                    color: "#ccc",
                    fontWeight: "500",
                  }}
                >
                  {tokenDetection?.tokenInfo?.symbol || tokenInfo?.symbol
                    ? (
                        <>
                          Symbol:{" "}
                          {tokenDetection?.tokenInfo?.symbol ||
                            tokenInfo?.symbol}
                          {(tokenDetection?.tokenInfo?.decimals !==
                            undefined
                            ? tokenDetection.tokenInfo.decimals
                            : tokenInfo?.decimals || 0) > 0 &&
                            ` - ${tokenDetection?.tokenInfo?.decimals || tokenInfo?.decimals} decimals`}
                        </>
                      )
                    : isFetchingContractDetails
                      ? "Fetching token metadata..."
                      : "Symbol: Unknown"}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                fontSize: "14px",
                color: isDiamond
                  ? "#a78bfa"
                  : tokenDetection?.type === "unknown"
                    ? "#ef4444"
                    : "#ffffff",
                fontWeight: "500",
                padding: "2px 8px",
                background: isDiamond
                  ? "rgba(124, 58, 237, 0.15)"
                  : tokenDetection?.type === "unknown"
                    ? "rgba(239, 68, 68, 0.1)"
                    : "rgba(255, 255, 255, 0.1)",
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
          style={{ display: "flex", gap: "16px", fontSize: "13px" }}
        >
          {isFacetDataPending ? (
            <span
              style={{
                color: "#cbd5f5",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Loader2Icon width={14} height={14} className="animate-spin" />
              Loading facet details
              <div
                className="shimmer-loading"
                style={{ width: "50px", height: "12px" }}
              />
            </span>
          ) : (
            <>
              <span
                style={{
                  color: "#22c55e",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <BookOpenIcon
                  width={16}
                  height={16}
                  style={{ marginRight: "4px" }}
                />
                {(isDiamond ? totalFacetReads : readFunctions.length).toString()} read functions
              </span>
              <span
                style={{
                  color: "#f59e0b",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <EditIcon width={16} height={16} />
                {(isDiamond ? totalFacetWrites : writeFunctions.length).toString()} write functions
              </span>
            </>
          )}
        </div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          {selectedNetwork?.name}
        </div>
      </div>
    </div>
  );
}
