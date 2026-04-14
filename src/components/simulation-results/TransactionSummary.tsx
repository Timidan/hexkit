import React from "react";
import { CopyButton } from "../ui/copy-button";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../ui/hover-card";
import ChainIcon, { type ChainKey } from "../icons/ChainIcon";
import { networkToChainKey } from "./constants";
import { formatTimestamp, formatGwei, formatEth, calculateTxFee } from "./formatters";
import { useNativeTokenPrice } from "../../hooks/useNativeTokenPrice";

interface TransactionSummaryProps {
  hash: string;
  network: string;
  statusColor: string;
  statusIcon: string;
  statusLabel: string;
  blockNumber: string;
  result: any;
  from: string;
  to: string;
  functionName: string;
  value: string;
  txFee: string;
  gasUsed: string;
  gasLimit: string;
  gasPrice: string;
  txType: string;
  nonce: string;
  /** Chain ID for native token USD pricing (defaults to 1 / Ethereum) */
  chainId?: number;
  formatAddressWithName: (address: string) => { display: string; hasName: boolean };
  normalizeValue: (value: string | undefined | null) => string | null;
  highlightedValue: string | null;
  setHighlightedValue: (v: string | null) => void;
}

export const TransactionSummary: React.FC<TransactionSummaryProps> = ({
  hash,
  network,
  statusColor,
  statusIcon,
  statusLabel,
  blockNumber,
  result,
  from,
  to,
  functionName,
  value,
  txFee,
  gasUsed,
  gasLimit,
  gasPrice,
  txType,
  nonce,
  chainId = 1,
  formatAddressWithName,
  normalizeValue,
  highlightedValue,
  setHighlightedValue,
}) => {
  const { formatUsd } = useNativeTokenPrice(chainId);

  // Compute fee in wei for USD conversion
  const txFeeWei = React.useMemo(() => {
    if (!gasUsed || !gasPrice || gasUsed === "\u2014" || gasPrice === "\u2014") return null;
    try {
      return (BigInt(gasUsed) * BigInt(gasPrice)).toString();
    } catch { return null; }
  }, [gasUsed, gasPrice]);
  const renderAddress = (address: string, label: string) => {
    const formatted = formatAddressWithName(address);
    const normalized = normalizeValue(address);
    const isHighlighted = normalized && highlightedValue === normalized;
    const highlightHandlers = normalized ? {
      onMouseEnter: () => setHighlightedValue(normalized),
      onMouseLeave: () => setHighlightedValue(null),
    } : {};

    return (
      <div className="sim-summary-row">
        <span className="sim-summary-label">{label}</span>
        <div className="sim-summary-value">
          {formatted.hasName ? (
            <HoverCard>
              <HoverCardTrigger asChild>
                <span
                  className={`sim-summary-mono sim-contract-name highlightable-value${isHighlighted ? " highlighted" : ""}`}
                  {...highlightHandlers}
                >
                  {formatted.display}
                </span>
              </HoverCardTrigger>
              <HoverCardContent>{address}</HoverCardContent>
            </HoverCard>
          ) : (
            <span
              className={`sim-summary-mono highlightable-value${isHighlighted ? " highlighted" : ""}`}
              {...highlightHandlers}
            >
              {address}
            </span>
          )}
          {address !== "\u2014" && (
            <CopyButton value={address} className="sim-copy-btn" iconSize={12} />
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="sim-summary-section">
      <div className="sim-summary-grid">
        {/* Left Column */}
        <div className="sim-summary-col">
          <div className="sim-summary-row">
            <span className="sim-summary-label">Hash</span>
            <div className="sim-summary-value">
              <span className="sim-summary-mono">{hash}</span>
              {hash !== "\u2014" && (
                <CopyButton value={hash} className="sim-copy-btn" iconSize={12} />
              )}
            </div>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Network</span>
            <span className="sim-summary-value">
              <HoverCard>
                <HoverCardTrigger asChild>
                  <span style={{ cursor: "help", display: "inline-flex" }}>
                    <ChainIcon
                      chain={networkToChainKey[network] || "ETH"}
                      chainId={chainId}
                      size={18}
                      rounded={4}
                    />
                  </span>
                </HoverCardTrigger>
                <HoverCardContent side="right">
                  {network}
                </HoverCardContent>
              </HoverCard>
            </span>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Status</span>
            <span className="sim-summary-value" style={{ color: statusColor }}>
              {statusIcon} {statusLabel}
            </span>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Block</span>
            <span className="sim-summary-value">{blockNumber}</span>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Timestamp</span>
            <span className="sim-summary-value">{formatTimestamp(result.timestamp)}</span>
          </div>

          {renderAddress(from, "From")}
          {renderAddress(to, "To")}
        </div>

        {/* Right Column */}
        <div className="sim-summary-col">
          <div className="sim-summary-row">
            <span className="sim-summary-label">Function</span>
            <span className="sim-summary-value sim-summary-mono">
              {functionName}
            </span>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Value</span>
            <span className="sim-summary-value">
              {formatEth(value)}
              {value && value !== "\u2014" && (
                <span className="text-muted-foreground ml-1 text-[11px]">{formatUsd(value)}</span>
              )}
            </span>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Tx Fee</span>
            <span className="sim-summary-value">
              {txFee}
              {txFeeWei && (
                <span className="text-muted-foreground ml-1 text-[11px]">{formatUsd(txFeeWei)}</span>
              )}
            </span>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Gas Used</span>
            <span className="sim-summary-value">
              {gasUsed} / {gasLimit}
            </span>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Gas Price</span>
            <span className="sim-summary-value">{gasPrice !== "\u2014" ? formatGwei(gasPrice) : gasPrice}</span>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Tx Type</span>
            <span className="sim-summary-value">{txType}</span>
          </div>

          <div className="sim-summary-row">
            <span className="sim-summary-label">Nonce</span>
            <span className="sim-summary-value">{nonce}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
