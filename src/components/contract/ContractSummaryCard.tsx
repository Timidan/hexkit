import React, { useMemo } from "react";
import { CheckCircle, ExternalLink, Eye, PenSquare } from "lucide-react";
import InlineCopyButton from "../ui/InlineCopyButton";
import { Badge } from "../shared";
import ChainIcon, { type ChainKey } from "../icons/ChainIcon";
import type { ContractConnectorResult } from "./ContractConnector";

export interface ContractSummaryCardProps {
  connection: ContractConnectorResult;
  metadata?: {
    name?: string | null;
    tokenInfo?: {
      type?: string;
      symbol?: string;
      name?: string;
      decimals?: number;
    } | null;
    abiSource?:
      | "sourcify"
      | "blockscout"
      | "etherscan"
      | "blockscout-bytecode"
      | "manual"
      | null;
  } | null;
}

const shortenAddress = (value: string): string => {
  if (!value) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const getSourceLabel = (
  source?:
    | "sourcify"
    | "blockscout"
    | "etherscan"
    | "blockscout-bytecode"
    | "manual"
    | null
): string | undefined => {
  if (!source) return undefined;
  if (source === "blockscout-bytecode") {
    return "blockscout-ebytecode";
  }
  return source;
};

const ContractSummaryCard: React.FC<ContractSummaryCardProps> = ({
  connection,
  metadata,
}) => {
  const {
    address,
    chain,
    contractName,
    readFunctions,
    writeFunctions,
    tokenInfo: connectorTokenInfo,
    abiSource,
  } = connection;

  const derivedName = metadata?.name || contractName;
  const derivedToken = metadata?.tokenInfo ?? connectorTokenInfo ?? undefined;
  const derivedSource = metadata?.abiSource ?? abiSource ?? undefined;

  const explorerUrl = useMemo(() => {
    if (!chain?.explorerUrl || !address) return undefined;
    return `${chain.explorerUrl.replace(/\/$/, "")}/address/${address}`;
  }, [chain?.explorerUrl, address]);

  const displaySource = getSourceLabel(derivedSource);

  const chainKey = useMemo<ChainKey>(() => {
    switch (chain?.id) {
      case 1:
        return "ETH";
      case 8453:
      case 84532:
        return "BASE";
      case 137:
        return "POLY";
      case 42161:
        return "ARB";
      case 10:
        return "OP";
      case 56:
        return "BSC";
      case 100:
        return "GNO";
      default:
        return "ETH";
    }
  }, [chain?.id]);

  return (
    <div className="contract-summary-card">
      <div className="contract-summary-card__header">
        <div className="contract-summary-card__avatar">
          <ChainIcon chain={chainKey} size={28} rounded={10} />
        </div>
        <div className="contract-summary-card__meta">
          <div className="contract-summary-card__title-row">
            <span className="contract-summary-card__name">
              {derivedName || shortenAddress(address)}
            </span>
            {displaySource ? (
              <Badge variant="success" size="sm" className="contract-summary-card__badge">
                <CheckCircle size={12} /> {displaySource}
              </Badge>
            ) : (
              <Badge variant="warning" size="sm" className="contract-summary-card__badge">
                Unverified
              </Badge>
            )}
          </div>
          <div className="contract-summary-card__submeta">
            <span>{chain?.name ?? "Unknown Chain"}</span>
            <span className="contract-summary-card__divider">•</span>
            <span className="contract-summary-card__address">{address}</span>
          </div>
        </div>
        <div className="contract-summary-card__actions">
          <InlineCopyButton value={address} ariaLabel="Copy contract address" />
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="contract-summary-card__action"
            >
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </div>

      {derivedToken && (
        <div className="contract-summary-card__token">
          {derivedToken.name && <span>{derivedToken.name}</span>}
          {derivedToken.symbol && <span>• {derivedToken.symbol}</span>}
          {typeof derivedToken.decimals === "number" && (
            <span>• Decimals: {derivedToken.decimals}</span>
          )}
        </div>
      )}

      <div className="contract-summary-card__stats">
        <div className="contract-summary-card__stat contract-summary-card__stat--read">
          <span>
            <Eye size={14} /> Read
          </span>
          <strong>{readFunctions.length}</strong>
        </div>
        <div className="contract-summary-card__stat contract-summary-card__stat--write">
          <span>
            <PenSquare size={14} /> Write
          </span>
          <strong>{writeFunctions.length}</strong>
        </div>
      </div>
    </div>
  );
};

export default ContractSummaryCard;
