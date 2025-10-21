import React, { useCallback, useState } from "react";
import { Eye, Edit } from "lucide-react";
import type { ContractInfoResult } from "../types/contractInfo";
import {
  ContractConnector,
  ContractSummaryCard,
  type ContractConnectorResult,
} from "./contract";
import { Badge } from "./shared";

interface ComprehensiveContractSearchProps {
  onContractFound?: (result: ContractInfoResult) => void;
  onLoadingChange?: (loading: boolean) => void;
}

const MAX_FUNCTIONS_PREVIEW = 8;

const ComprehensiveContractSearch: React.FC<
  ComprehensiveContractSearchProps
> = ({ onContractFound, onLoadingChange }) => {
  const [connection, setConnection] =
    useState<ContractConnectorResult | null>(null);

  const handleContractConnected = useCallback(
    (result: ContractConnectorResult) => {
      setConnection(result);

      if (!onContractFound) {
        return;
      }

      const tokenInfo =
        result.tokenInfo && result.tokenInfo.type !== "unknown"
          ? {
              name: result.tokenInfo.name,
              symbol: result.tokenInfo.symbol,
              decimals: result.tokenInfo.decimals,
            }
          : undefined;

      const normalizedSource =
        result.abiSource && result.abiSource !== "manual"
          ? result.abiSource
          : undefined;

      const payload: ContractInfoResult = {
        success: true,
        address: result.address,
        chain: result.chain,
        contractName: result.contractName,
        abi: JSON.stringify(result.abi),
        source: normalizedSource,
        verified: true,
        tokenType:
          result.tokenInfo?.type && result.tokenInfo.type !== "unknown"
            ? result.tokenInfo.type
            : undefined,
        tokenInfo,
      };

      onContractFound(payload);
    },
    [onContractFound]
  );

  const handleConnectionError = useCallback(() => {
    setConnection(null);
  }, []);

  const renderFunctionList = (
    functions: Array<{ name: string }>,
    emptyLabel: string
  ) => {
    if (!functions.length) {
      return (
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted, #94a3b8)",
            margin: 0,
          }}
        >
          {emptyLabel}
        </p>
      );
    }

    const visible = functions.slice(0, MAX_FUNCTIONS_PREVIEW);

    return (
      <>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          {visible.map((func, index) => (
            <li
              key={`${func.name}-${index}`}
              style={{
                fontFamily:
                  "var(--font-mono, SFMono-Regular, Menlo, monospace)",
                fontSize: "0.85rem",
                color: "var(--text-primary, #e2e8f0)",
              }}
            >
              {func.name}
            </li>
          ))}
        </ul>
        {functions.length > MAX_FUNCTIONS_PREVIEW && (
          <span
            style={{
              display: "block",
              marginTop: "0.35rem",
              fontSize: "0.75rem",
              color: "var(--text-muted, #94a3b8)",
            }}
          >
            +{functions.length - MAX_FUNCTIONS_PREVIEW} more
          </span>
        )}
      </>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: "1080px",
        margin: "0 auto",
        paddingBottom: "32px",
        width: "100%",
      }}
    >
      <div className="panel">
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "var(--text-primary, #f9fafb)",
            marginBottom: "0.5rem",
          }}
        >
          Comprehensive Contract Search
        </h2>
        <p
          style={{
            color: "var(--text-muted, #94a3b8)",
            marginBottom: "1.5rem",
            maxWidth: "680px",
          }}
        >
          Fetch a verified contract, surface metadata, and immediately browse its
          functions using the same connector flow as the live interaction page.
        </p>

        <ContractConnector
          onContractConnected={handleContractConnected}
          onConnectionError={handleConnectionError}
          onLoadingChange={onLoadingChange}
          showAdvancedFeatures
        />
      </div>

      {connection && (
        <div className="panel">
          <div style={{ marginBottom: "24px" }}>
            <ContractSummaryCard connection={connection} metadata={null} />
          </div>

          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: 600,
              color: "var(--text-primary, #f8fafc)",
              marginBottom: "1rem",
            }}
          >
            Function Overview
          </h3>

          <div
            style={{
              display: "grid",
              gap: "24px",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            <section>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                  color: "var(--text-primary, #f8fafc)",
                }}
              >
                <Eye size={16} />
                <span style={{ fontWeight: 600 }}>Read Functions</span>
                <Badge variant="info" size="sm">
                  {connection.readFunctions.length}
                </Badge>
              </div>
              {renderFunctionList(
                connection.readFunctions,
                "No read functions detected."
              )}
            </section>

            <section>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                  color: "var(--text-primary, #f8fafc)",
                }}
              >
                <Edit size={16} />
                <span style={{ fontWeight: 600 }}>Write Functions</span>
                <Badge variant="warning" size="sm">
                  {connection.writeFunctions.length}
                </Badge>
              </div>
              {renderFunctionList(
                connection.writeFunctions,
                "No write functions detected."
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComprehensiveContractSearch;
