import React from "react";
import { CopyButton } from "../ui/copy-button";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../ui/hover-card";
import ChainIcon from "../icons/ChainIcon";
import { networkToChainKey } from "./constants";
import { formatTimestamp, formatGwei, formatEth } from "./formatters";
import { useNativeTokenPrice } from "../../hooks/useNativeTokenPrice";

interface TransactionSummaryProps {
  hash: string;
  network: string;
  statusColor: string;
  statusIcon: string;
  statusLabel: string;
  blockNumber: string;
  result: { timestamp?: number | null };
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
  chainId?: number | null;
  formatAddressWithName: (address: string) => { display: string; hasName: boolean };
  normalizeValue: (value: string | undefined | null) => string | null;
  highlightedValue: string | null;
  setHighlightedValue: (v: string | null) => void;
  /** Optional extra rows appended to the right column. Used by the
   *  Starknet panel to surface L1 / L1-data / VM steps / lifecycle
   *  inside the same `sim-summary-section` block instead of mounting
   *  a separate "Starknet details" panel below the EDB summary. The
   *  EVM page never passes this and renders identically to before. */
  extraRightRows?: React.ReactNode;
  /** Optional extra rows appended to the left column. Used by Starknet
   *  to balance the column heights — chain-meta rows (Starknet Version,
   *  Lifecycle) live alongside Network/Status on the left so the right
   *  column doesn't tower above. EVM never passes this. */
  extraLeftRows?: React.ReactNode;
  /** When true, suppresses the Value row. Starknet INVOKE v3 has no
   *  native value at the tx envelope so the slot is always "—" — hiding
   *  it removes a dead row instead of padding the right column. */
  omitValue?: boolean;
  /** When set, replaces the "Gas Price" row label with this string so
   *  Starknet can repurpose the slot as "L1 Gas". Falls back to the
   *  default "Gas Price" label for the EVM page. */
  gasPriceLabel?: string;
  /** When set, renders the gas-price value as a plain string instead
   *  of running it through formatGwei. Used by Starknet to display L1
   *  gas as a decimal integer rather than a Gwei conversion. */
  gasPriceRaw?: string;
  /** Optional icon override for non-EVM result surfaces that reuse the
   *  EVM summary chrome but should not go through the EVM chain map. */
  networkIcon?: React.ReactNode;
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
  extraRightRows,
  extraLeftRows,
  omitValue = false,
  gasPriceLabel,
  gasPriceRaw,
  networkIcon,
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
      <div className="sim-summary-row" data-summary-row={label.toLowerCase()}>
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
          <div className="sim-summary-row" data-summary-row="hash">
            <span className="sim-summary-label">Hash</span>
            <div className="sim-summary-value">
              <span className="sim-summary-mono">{hash}</span>
              {hash !== "\u2014" && (
                <CopyButton value={hash} className="sim-copy-btn" iconSize={12} />
              )}
            </div>
          </div>

          <div className="sim-summary-row" data-summary-row="network">
            <span className="sim-summary-label">Network</span>
            <span className="sim-summary-value">
              <HoverCard>
                <HoverCardTrigger asChild>
                  <span style={{ cursor: "help", display: "inline-flex" }}>
                    {networkIcon ?? (
                      <ChainIcon
                        chain={networkToChainKey[network] || "ETH"}
                        chainId={chainId ?? undefined}
                        size={18}
                        rounded={4}
                      />
                    )}
                  </span>
                </HoverCardTrigger>
                <HoverCardContent side="right">
                  {network}
                </HoverCardContent>
              </HoverCard>
            </span>
          </div>

          <div className="sim-summary-row" data-summary-row="status" data-status={statusLabel}>
            <span className="sim-summary-label">Status</span>
            <span className="sim-summary-value" style={{ color: statusColor }}>
              {statusIcon} {statusLabel}
            </span>
          </div>

          <div className="sim-summary-row" data-summary-row="block">
            <span className="sim-summary-label">Block</span>
            <span className="sim-summary-value">{blockNumber}</span>
          </div>

          <div className="sim-summary-row" data-summary-row="timestamp">
            <span className="sim-summary-label">Timestamp</span>
            <span className="sim-summary-value">{formatTimestamp(result.timestamp)}</span>
          </div>

          {renderAddress(from, "From")}
          {renderAddress(to, "To")}
          {extraLeftRows}
        </div>

        {/* Right Column */}
        <div className="sim-summary-col">
          <div className="sim-summary-row" data-summary-row="function">
            <span className="sim-summary-label">Function</span>
            <span className="sim-summary-value sim-summary-mono">
              {functionName}
            </span>
          </div>

          {!omitValue && (
            <div className="sim-summary-row" data-summary-row="value">
              <span className="sim-summary-label">Value</span>
              <span className="sim-summary-value">
                {formatEth(value)}
                {value && value !== "\u2014" && (
                  <span className="text-muted-foreground ml-1 text-[11px]">{formatUsd(value)}</span>
                )}
              </span>
            </div>
          )}

          <div className="sim-summary-row" data-summary-row="fee">
            <span className="sim-summary-label">Tx Fee</span>
            <span className="sim-summary-value">
              {txFee}
              {txFeeWei && (
                <span className="text-muted-foreground ml-1 text-[11px]">{formatUsd(txFeeWei)}</span>
              )}
            </span>
          </div>

          <div className="sim-summary-row" data-summary-row="gas-used">
            <span className="sim-summary-label">Gas Used</span>
            <span className="sim-summary-value">
              {gasUsed} / {gasLimit}
            </span>
          </div>

          <div className="sim-summary-row" data-summary-row="gas-price">
            <span className="sim-summary-label">{gasPriceLabel ?? "Gas Price"}</span>
            <span className="sim-summary-value">
              {gasPriceRaw !== undefined
                ? gasPriceRaw
                : gasPrice !== "\u2014"
                ? formatGwei(gasPrice)
                : gasPrice}
            </span>
          </div>

          <div className="sim-summary-row" data-summary-row="tx-type">
            <span className="sim-summary-label">Tx Type</span>
            <span className="sim-summary-value">{txType}</span>
          </div>

          <div className="sim-summary-row" data-summary-row="nonce">
            <span className="sim-summary-label">Nonce</span>
            <span className="sim-summary-value">{nonce}</span>
          </div>

          {extraRightRows}
        </div>
      </div>
    </section>
  );
};
