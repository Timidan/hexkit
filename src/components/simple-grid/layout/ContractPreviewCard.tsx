/**
 * ContractPreviewCard - Token/contract preview card shown before full
 * contractInfo is available, plus the loading skeleton card.
 * Extracted from ContractColumn.tsx to reduce file size.
 */
import React from "react";
import { GemIcon } from "../../icons/IconLibrary";
import { useGridContext } from "../GridContext";

export default function ContractPreviewCard(): React.ReactElement | null {
  const ctx: any = useGridContext();
  const {
    contractInfo,
    isLoadingABI,
    isLoadingContractInfo,
    tokenInfo,
    tokenDetection,
    isDiamond,
    resolvedContractName,
    isFetchingContractDetails,
  } = ctx;

  // Token/diamond preview card (before contractInfo is set)
  if (!contractInfo && (tokenDetection || isDiamond || tokenInfo)) {
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "rgba(255, 255, 255, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "25px",
              border: "2px solid rgba(255,255,255,0.2)",
            }}
          >
            <span style={{ fontSize: 15, color: "#fff" }}>SC</span>
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
              {resolvedContractName}
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
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#ccc",
                fontWeight: 500,
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
          </div>
        </div>
      </div>
    );
  }

  // Loading skeleton card while searching
  if (isLoadingABI && !contractInfo && !tokenDetection && !isDiamond && !tokenInfo) {
    return (
      <div
        style={{
          position: "relative",
          padding: "16px",
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "12px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          {/* Icon skeleton */}
          <div
            className="shimmer-loading"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
            }}
          />
          <div style={{ flex: 1 }}>
            {/* Name skeleton */}
            <div
              className="shimmer-loading"
              style={{
                width: "180px",
                height: "22px",
                marginBottom: "8px",
              }}
            />
            {/* Token type skeleton */}
            <div
              className="shimmer-loading"
              style={{
                width: "100px",
                height: "18px",
              }}
            />
          </div>
        </div>
        {/* Function counts skeleton */}
        <div
          style={{
            display: "flex",
            gap: "12px",
          }}
        >
          <div
            className="shimmer-loading"
            style={{
              width: "90px",
              height: "16px",
            }}
          />
          <div
            className="shimmer-loading"
            style={{
              width: "90px",
              height: "16px",
            }}
          />
        </div>
      </div>
    );
  }

  return null;
}
