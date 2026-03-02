import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import {
  extractTokenMovements,
  aggregateBalanceChanges,
  groupByTokenType,
  fetchTokenPrices,
  fetchTokenMetadata,
  getTokenIconUrl,
  type TokenType,
  type BalanceChange,
  type TokenMovement,
  type TokenPrice,
} from "../utils/tokenMovements";
import { normalizeValue } from "../utils/displayFormatters";
import { Button } from "./ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
import "../styles/TokenMovementsPanel.css";

interface TokenMovementsPanelProps {
  /** Raw event logs from trace (with address, topics, data) */
  events?: Array<{ address?: string; topics?: string[]; data?: string }>;
  /** Sender address for labeling */
  senderAddress?: string;
  /** Pre-parsed movements if available */
  movements?: TokenMovement[];
  /** Chain ID for price lookups (defaults to 1 for Ethereum) */
  chainId?: number;
  /** Address to contract name resolution map */
  addressToName?: Map<string, string>;
  /** External highlight value for cross-component highlighting */
  highlightedValue?: string | null;
  /** Callback when highlight value changes */
  onHighlightChange?: (value: string | null) => void;
  /**
   * Map of implementation/facet address → proxy address
   * Used to resolve the correct token address when events come from proxy implementations
   */
  implementationToProxy?: Map<string, string>;
  /**
   * Map of address → token symbol (for pre-resolved symbols from contract metadata)
   */
  addressToSymbol?: Map<string, string>;
  /**
   * RPC URL for fetching token metadata (symbol, decimals) on-chain
   */
  rpcUrl?: string;
}

type GroupingMode = "address" | "chronological";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const TokenMovementsPanel: React.FC<TokenMovementsPanelProps> = ({
  events = [],
  senderAddress,
  movements: preMovements,
  chainId = 1,
  addressToName,
  highlightedValue,
  onHighlightChange,
  implementationToProxy,
  addressToSymbol,
  rpcUrl,
}) => {
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("address");
  const [activeTab, setActiveTab] = useState<TokenType | null>(null);
  const [prices, setPrices] = useState<Map<string, TokenPrice>>(new Map());
  const [resolvedSymbols, setResolvedSymbols] = useState<Map<string, string>>(new Map());
  const fetchingRef = useRef<Set<string>>(new Set());

  // Normalize a value for comparison (lowercase for addresses)
  const normalizeHighlightValue = useCallback((value: string | undefined | null): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "0x" || trimmed === "0x0") return null;
    if (trimmed.startsWith("0x")) {
      return trimmed.toLowerCase();
    }
    return trimmed;
  }, []);


  // Merge pre-resolved symbols with dynamically fetched symbols
  const mergedSymbols = useMemo(() => {
    const merged = new Map<string, string>();
    // Start with pre-resolved symbols
    if (addressToSymbol) {
      addressToSymbol.forEach((symbol, addr) => merged.set(addr.toLowerCase(), symbol));
    }
    // Add dynamically fetched symbols
    resolvedSymbols.forEach((symbol, addr) => merged.set(addr.toLowerCase(), symbol));
    return merged;
  }, [addressToSymbol, resolvedSymbols]);

  // Extract movements from events with proxy/symbol resolution
  const movements = useMemo(() => {
    if (preMovements && preMovements.length > 0) return preMovements;
    return extractTokenMovements(events, {
      implementationToProxy,
      addressToSymbol: mergedSymbols,
    });
  }, [events, preMovements, implementationToProxy, mergedSymbols]);

  // Fetch missing token symbols on-chain using symbol() call
  useEffect(() => {
    if (!rpcUrl || movements.length === 0) return;

    // Find tokens that don't have an authoritative on-chain symbol yet.
    const tokensToFetchSet = new Set<string>();
    for (const m of movements) {
      const addr = m.tokenAddress.toLowerCase();
      // Skip if already fetched from chain
      if (resolvedSymbols.has(addr)) continue;
      // Skip if already fetching
      if (fetchingRef.current.has(addr)) continue;
      tokensToFetchSet.add(addr);
    }
    const tokensToFetch = [...tokensToFetchSet];

    if (tokensToFetch.length === 0) return;

    // Mark as fetching to prevent duplicate requests
    tokensToFetch.forEach(addr => fetchingRef.current.add(addr));

    // Create provider and fetch symbols in batches (max 5 concurrent to avoid
    // overwhelming RPC, with 3s timeout per request).
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const BATCH_SIZE = 5;
    const TIMEOUT_MS = 3000;

    const fetchWithTimeout = async (addr: string) => {
      try {
        const result = await Promise.race([
          fetchTokenMetadata(addr, provider),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
        ]);
        if (result && result.symbol && !result.symbol.startsWith("0x")) {
          return { addr, symbol: result.symbol };
        }
      } catch {
        // Silently skip timeouts / failures
      }
      return null;
    };

    (async () => {
      const allResults: Array<{ addr: string; symbol: string } | null> = [];
      for (let i = 0; i < tokensToFetch.length; i += BATCH_SIZE) {
        const batch = tokensToFetch.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(fetchWithTimeout));
        allResults.push(...batchResults);
      }

      // Use functional update to avoid race conditions with concurrent effects
      const validResults = allResults.filter((r): r is { addr: string; symbol: string } => r !== null);
      if (validResults.length > 0) {
        setResolvedSymbols((prev) => {
          const merged = new Map(prev);
          for (const result of validResults) {
            merged.set(result.addr, result.symbol);
          }
          return merged;
        });
      }
    })().finally(() => {
      tokensToFetch.forEach((addr) => fetchingRef.current.delete(addr));
    });
  }, [movements, rpcUrl]);

  // Aggregate balance changes
  const balanceChanges = useMemo(() => {
    return aggregateBalanceChanges(movements, senderAddress);
  }, [movements, senderAddress]);

  // Fetch prices for ERC-20 tokens only (not ERC-721 or ERC-1155)
  useEffect(() => {
    if (balanceChanges.length === 0) return;

    // Only fetch prices for ERC-20 tokens - NFTs don't have meaningful USD prices
    const erc20Tokens = balanceChanges
      .filter((c) => c.tokenType === "ERC-20")
      .map((c) => c.tokenAddress.toLowerCase());

    const uniqueTokens = Array.from(new Set(erc20Tokens));
    if (uniqueTokens.length === 0) return;

    // Fetch prices
    fetchTokenPrices(uniqueTokens.map((address) => ({ address, chainId })))
      .then((priceMap) => {
        setPrices(priceMap);
      })
      .catch((err) => {
        console.warn("Failed to fetch token prices:", err);
      });
  }, [balanceChanges, chainId]);

  // Group by token type
  const groupedChanges = useMemo(() => {
    return groupByTokenType(balanceChanges);
  }, [balanceChanges]);

  // Determine which tabs have data
  const movementCounts = useMemo(() => {
    const counts: Record<TokenType, number> = {
      "ERC-20": 0,
      "ERC-721": 0,
      "ERC-1155": 0,
    };
    movements.forEach((m) => {
      counts[m.tokenType] += 1;
    });
    return counts;
  }, [movements]);

  const availableTabs = useMemo(() => {
    const tabs: TokenType[] = [];
    if (movementCounts["ERC-20"] > 0) tabs.push("ERC-20");
    if (movementCounts["ERC-721"] > 0) tabs.push("ERC-721");
    if (movementCounts["ERC-1155"] > 0) tabs.push("ERC-1155");
    return tabs;
  }, [movementCounts]);

  // Auto-select first available tab if none selected
  const currentTab = activeTab && availableTabs.includes(activeTab) 
    ? activeTab 
    : availableTabs[0] || null;

  // Get changes for current tab
  const currentChanges = currentTab ? groupedChanges[currentTab] : [];
  const currentMovements = useMemo(
    () => {
      if (!currentTab) return [];
      const filtered = movements.filter((movement) => movement.tokenType === currentTab);
      // Sort: outgoing (sender is from) first, then incoming
      if (senderAddress) {
        const senderLower = senderAddress.toLowerCase();
        filtered.sort((a, b) => {
          const aOut = a.from.toLowerCase() === senderLower ? 0 : 1;
          const bOut = b.from.toLowerCase() === senderLower ? 0 : 1;
          return aOut - bOut;
        });
      }
      return filtered;
    },
    [movements, currentTab, senderAddress]
  );

  // Format address for display - resolve to contract name if known
  const formatAddress = (address: string) => {
    if (!address) return "—";
    if (address.toLowerCase() === ZERO_ADDRESS) return "Null address";
    const name = addressToName?.get(address.toLowerCase());
    if (name) return name;
    return `${address.slice(0, 8)}…${address.slice(-6)}`;
  };

  // Handle empty state
  if (movements.length === 0) {
    return null; // Don't render anything if no token movements
  }

  return (
    <section className="token-movements-panel">
      {/* Tabs for token types */}
      <div className="token-movements-header">
        <div className="token-movements-tabs">
          {availableTabs.map((tab) => (
            <Button
              key={tab}
              type="button"
              variant="ghost"
              size="sm"
              className={`token-movements-tab ${currentTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab} ({movementCounts[tab]})
            </Button>
          ))}
        </div>

        {/* Grouping toggle */}
        <div className="token-movements-grouping">
          <span className="grouping-label">Group by:</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`grouping-btn ${groupingMode === "address" ? "active" : ""}`}
            onClick={() => setGroupingMode("address")}
          >
            Address
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`grouping-btn ${groupingMode === "chronological" ? "active" : ""}`}
            onClick={() => setGroupingMode("chronological")}
          >
            Chronologically
          </Button>
        </div>
      </div>

      {/* Balance changes table - different columns for different token types */}
      {groupingMode === "address" && currentChanges.length > 0 && (
        <div className="token-movements-table-wrapper">
          <Table className="token-movements-table token-movements-table--address">
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Asset</TableHead>
                {/* ERC-721 and ERC-1155 have Token ID column, ERC-20 has Value column */}
                {(currentTab === "ERC-721" || currentTab === "ERC-1155") ? (
                  <>
                    <TableHead>Token ID</TableHead>
                    <TableHead>Balance Change</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Balance Change</TableHead>
                    <TableHead>Value</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentChanges.map((change, idx) => {
                const prevChange = idx > 0 ? currentChanges[idx - 1] : null;
                const showDivider = prevChange && prevChange.rawDelta < 0n && change.rawDelta >= 0n;
                const colCount = (currentTab === "ERC-721" || currentTab === "ERC-1155") ? 4 : 4;
                return (
                  <React.Fragment key={idx}>
                    {showDivider && (
                      <TableRow className="token-movements-group-divider" aria-hidden="true">
                        <TableCell colSpan={colCount} />
                      </TableRow>
                    )}
                    <TokenMovementRow
                      change={change}
                      formatAddress={formatAddress}
                      price={prices.get(change.tokenAddress.toLowerCase())}
                      chainId={chainId}
                      highlightedValue={highlightedValue}
                      onHighlightChange={onHighlightChange}
                      isNft={currentTab === "ERC-721" || currentTab === "ERC-1155"}
                    />
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {groupingMode === "chronological" && currentMovements.length > 0 && (
        <div className="token-movements-table-wrapper">
          <Table className="token-movements-table token-movements-table--chronological">
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Asset Type</TableHead>
                <TableHead>Token ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentMovements.map((movement, idx) => {
                const senderLower = senderAddress?.toLowerCase();
                const prevMovement = idx > 0 ? currentMovements[idx - 1] : null;
                const showDivider = senderLower && prevMovement &&
                  prevMovement.from.toLowerCase() === senderLower &&
                  movement.from.toLowerCase() !== senderLower;
                return (
                  <React.Fragment key={`${movement.tokenAddress}-${movement.tokenId || "na"}-${movement.from}-${movement.to}-${idx}`}>
                    {showDivider && (
                      <TableRow className="token-movements-group-divider" aria-hidden="true">
                        <TableCell colSpan={6} />
                      </TableRow>
                    )}
                    <TokenMovementChronologicalRow
                      movement={movement}
                      formatAddress={formatAddress}
                      highlightedValue={highlightedValue}
                      onHighlightChange={onHighlightChange}
                      normalizeHighlightValue={normalizeHighlightValue}
                      senderAddress={senderAddress}
                      tokenSymbol={mergedSymbols.get(movement.tokenAddress.toLowerCase()) || movement.tokenSymbol}
                    />
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
};

interface TokenMovementRowProps {
  change: BalanceChange;
  formatAddress: (addr: string) => string;
  price?: TokenPrice;
  chainId: number;
  highlightedValue?: string | null;
  onHighlightChange?: (value: string | null) => void;
  isNft?: boolean;
}

const TokenMovementRow: React.FC<TokenMovementRowProps> = ({
  change,
  formatAddress,
  price,
  chainId,
  highlightedValue,
  onHighlightChange,
  isNft = false,
}) => {
  const isNegative = change.rawDelta < 0n;
  const deltaClass = isNegative ? "delta-negative" : "delta-positive";
  const [iconError, setIconError] = useState(false);

  // Check if we have a real symbol (not a truncated address)
  const hasRealSymbol = change.tokenSymbol && !change.tokenSymbol.startsWith("0x");
  const displaySymbol = hasRealSymbol ? change.tokenSymbol : null;
  const displayAddress = formatAddress(change.tokenAddress);


  // Render a highlightable address span
  const renderHighlightable = (address: string, displayText: string, className: string) => {
    const normalized = normalizeValue(address);
    if (!normalized || !onHighlightChange) {
      return <span className={className}>{displayText}</span>;
    }
    const isHighlighted = highlightedValue === normalized;
    return (
      <span
        className={`${className} highlightable-value${isHighlighted ? " highlighted" : ""}`}
        data-highlight-value={normalized}
        onMouseEnter={() => onHighlightChange(normalized)}
        onMouseLeave={() => onHighlightChange(null)}
      >
        {displayText}
      </span>
    );
  };

  // Get token icon URL
  const iconUrl = getTokenIconUrl(change.tokenAddress, chainId);

  // Calculate USD value
  const usdValue = useMemo(() => {
    if (!price?.price) return null;
    const absAmount = parseFloat(change.formattedDelta);
    if (isNaN(absAmount)) return null;
    return absAmount * price.price;
  }, [price, change.formattedDelta]);

  // Format USD value
  const formatUsd = (value: number | null): string => {
    if (value === null) return "—";
    if (value < 0.01 && value > 0) return "<$0.01";
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <TableRow className="token-movement-row">
      <TableCell className="address-cell">
        <span className={`address-icon ${isNegative ? "icon-out" : "icon-in"}`}>
          {isNegative ? "↗" : "↘"}
        </span>
        {renderHighlightable(change.address, formatAddress(change.address), "address-value")}
        {change.label && <span className="address-label">[{change.label}]</span>}
      </TableCell>
      <TableCell className="token-cell">
        <span className="token-cell-content">
          {!iconError ? (
            <img
              src={iconUrl}
              alt=""
              className="token-icon-img"
              width={16}
              height={16}
              onError={() => setIconError(true)}
              loading="lazy"
            />
          ) : (
            <span className="token-icon-fallback">●</span>
          )}
          {displaySymbol ? (
            renderHighlightable(change.tokenAddress, displaySymbol, "token-symbol")
          ) : (
            renderHighlightable(change.tokenAddress, displayAddress, "token-address-fallback")
          )}
        </span>
      </TableCell>
      {/* NFTs: show Token ID as separate column, then Balance Change (no USD) */}
      {isNft ? (
        <>
          <TableCell className="token-id-cell">
            {change.tokenId ? `#${change.tokenId}` : "—"}
          </TableCell>
          <TableCell className={`delta-cell ${deltaClass}`}>
            {change.delta}
          </TableCell>
        </>
      ) : (
        <>
          <TableCell className={`delta-cell ${deltaClass}`}>
            {change.delta}
          </TableCell>
          <TableCell className={`usd-cell ${usdValue !== null ? deltaClass : ""}`}>
            {formatUsd(usdValue)}
          </TableCell>
        </>
      )}
    </TableRow>
  );
};

interface TokenMovementChronologicalRowProps {
  movement: TokenMovement;
  formatAddress: (addr: string) => string;
  highlightedValue?: string | null;
  onHighlightChange?: (value: string | null) => void;
  normalizeHighlightValue: (value: string | undefined | null) => string | null;
  senderAddress?: string;
  tokenSymbol?: string;
}

const TokenMovementChronologicalRow: React.FC<TokenMovementChronologicalRowProps> = ({
  movement,
  formatAddress,
  highlightedValue,
  onHighlightChange,
  normalizeHighlightValue,
  senderAddress,
  tokenSymbol,
}) => {
  const senderLower = senderAddress?.toLowerCase();

  const renderHighlightable = (value: string, displayText: string, className: string) => {
    const normalized = normalizeHighlightValue(value);
    if (!normalized || !onHighlightChange) {
      return <span className={className}>{displayText}</span>;
    }
    const isHighlighted = highlightedValue === normalized;
    return (
      <span
        className={`${className} highlightable-value${isHighlighted ? " highlighted" : ""}`}
        data-highlight-value={normalized}
        onMouseEnter={() => onHighlightChange(normalized)}
        onMouseLeave={() => onHighlightChange(null)}
      >
        {displayText}
      </span>
    );
  };

  const formatParty = (address: string, mode: "from" | "to") => {
    const normalized = address.toLowerCase();
    if (normalized === ZERO_ADDRESS) {
      return mode === "from" ? "Minted" : "Burned";
    }
    return formatAddress(address);
  };

  const toLabel = movement.to.toLowerCase() === senderLower ? "Sender" : "";
  const fromLabel = movement.from.toLowerCase() === senderLower ? "Sender" : "";
  const displaySymbol = tokenSymbol && !tokenSymbol.startsWith("0x")
    ? tokenSymbol
    : `${movement.tokenAddress.slice(0, 8)}…${movement.tokenAddress.slice(-6)}`;

  return (
    <TableRow className="token-movement-row">
      <TableCell className="address-cell">
        {renderHighlightable(movement.from, formatParty(movement.from, "from"), "address-value")}
        {fromLabel && <span className="address-label">[{fromLabel}]</span>}
      </TableCell>
      <TableCell className="address-cell">
        {renderHighlightable(movement.to, formatParty(movement.to, "to"), "address-value")}
        {toLabel && <span className="address-label">[{toLabel}]</span>}
      </TableCell>
      <TableCell className="delta-cell">
        {movement.amount}
      </TableCell>
      <TableCell className="token-cell">
        {renderHighlightable(movement.tokenAddress, displaySymbol, "token-symbol")}
      </TableCell>
      <TableCell className="token-id-cell">{movement.tokenType}</TableCell>
      <TableCell className="token-id-cell">
        {movement.tokenId ? `#${movement.tokenId}` : "—"}
      </TableCell>
    </TableRow>
  );
};

export default TokenMovementsPanel;
