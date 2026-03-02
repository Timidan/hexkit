import React, { useMemo } from "react";
import type { SimulationResult } from "../../types/transaction";
import type { StorageLayoutResponse } from "../../types/debug";
import { useStorageLayout, type LayoutEntry } from "./useStorageLayout";
import {
  buildSlotDescriptors,
  matchSlot,
  decodeDiffFields,
  extractKnownKeys,
  type SlotMatch,
  type DecodedField,
  type SlotDescriptor,
} from "../../utils/storageLayoutDecode";
import { formatTokenValue } from "../../utils/displayFormatters";
import "./StateTab.css";

/** Format a decoded value, optionally applying token decimal formatting */
function formatDecodedValue(val: string | null, decimals?: number | null): string {
  if (val == null) return '???';
  if (decimals != null && decimals > 0 && /^-?\d+$/.test(val)) {
    return formatTokenValue(val, decimals);
  }
  return val;
}

interface StateTabProps {
  result: SimulationResult;
  artifacts: any;
  contractContext: any;
}

/** Normalize hex for comparison: lowercase, strip leading zeros after 0x */
function normalizeHex(hex: string | undefined): string {
  if (!hex) return "0x0";
  const s = hex.toLowerCase().trim();
  if (!s.startsWith("0x")) return s;
  const stripped = s.slice(2).replace(/^0+/, "") || "0";
  return "0x" + stripped;
}

/** Produce highlighted JSX for a hex value by diffing char-by-char against the other value. */
function renderHighlightedHex(
  hex: string,
  otherHex: string,
  mode: "before" | "after"
): React.ReactNode {
  const norm = hex.startsWith("0x") ? hex : `0x${hex}`;
  const otherNorm = otherHex.startsWith("0x") ? otherHex : `0x${otherHex}`;

  // Strip 0x prefix for char comparison
  const a = norm.slice(2);
  const b = otherNorm.slice(2);

  // Pad shorter to match length of longer
  const maxLen = Math.max(a.length, b.length);
  const padA = a.padStart(maxLen, "0");
  const padB = b.padStart(maxLen, "0");

  const hiClass = mode === "before" ? "hi-red" : "hi-green";

  // Build spans: group consecutive same/diff chars
  const spans: React.ReactNode[] = [];
  spans.push(<span key="prefix" className="dim">0x</span>);

  let i = 0;
  // Leading zeros that are padding — dim them
  let leadingZeros = 0;
  while (leadingZeros < padA.length && padA[leadingZeros] === "0" && padB[leadingZeros] === "0") {
    leadingZeros++;
  }
  if (leadingZeros > 0) {
    spans.push(<span key="lead" className="dim">{padA.slice(0, leadingZeros)}</span>);
    i = leadingZeros;
  }

  while (i < maxLen) {
    // Always display padA — the first arg (hex) is the value we're rendering
    const isDiff = padA[i] !== padB[i];
    const startI = i;
    // Collect consecutive chars of same diff-status
    while (i < maxLen && (padA[i] !== padB[i]) === isDiff) {
      i++;
    }
    const chunk = padA.slice(startI, i);
    if (isDiff) {
      spans.push(<span key={startI} className={hiClass}>{chunk}</span>);
    } else {
      spans.push(<span key={startI}>{chunk}</span>);
    }
  }

  return <>{spans}</>;
}

export const StateTab: React.FC<StateTabProps> = ({ result, artifacts, contractContext }) => {
  // Memoize parsed rawTrace to avoid JSON.parse on every render
  const parsedRawTrace = useMemo(() => {
    const rawTrace = (result as any)?.rawTrace;
    try {
      return typeof rawTrace === 'string' ? JSON.parse(rawTrace) : rawTrace;
    } catch {
      return rawTrace;
    }
  }, [(result as any)?.rawTrace]);

  const rtArtifacts = useMemo(
    () => parsedRawTrace?.artifacts || {},
    [parsedRawTrace?.artifacts]
  );
  const rtSources = parsedRawTrace?.sources || {};

  // Stable reference: avoid creating a new [] on every render when no diffs
  const storageDiffs = useMemo(
    () => artifacts?.storageDiffs || [],
    [artifacts?.storageDiffs]
  );

  // EDB session for layout fetching
  const sessionId = (result as any)?.debugSession?.sessionId || null;

  // Collect unique addresses from diffs
  const diffAddresses = useMemo(() => {
    const addrs = new Set<string>();
    for (const diff of storageDiffs) {
      if (diff.address) addrs.add(diff.address);
    }
    return Array.from(addrs);
  }, [storageDiffs]);

  // Fetch layouts from EDB session (fallback — only works when debug is enabled)
  const { layouts: sessionLayouts } = useStorageLayout(sessionId, diffAddresses);

  // Extract storage layouts from rawTrace artifacts (primary — works without EDB session)
  const inlineLayouts = useMemo(() => {
    const found: Record<string, LayoutEntry> = {};
    for (const addr of diffAddresses) {
      const normalizedAddr = addr.toLowerCase();
      const artifact = rtArtifacts[addr] || rtArtifacts[normalizedAddr];
      if (!artifact || typeof artifact !== 'object') continue;

      // Try top-level storageLayout (set by bridge stripping) first,
      // then nested output.contracts[file][name].storageLayout as fallback
      let sl = artifact.storageLayout;
      if (!sl && artifact.output?.contracts) {
        const contracts = artifact.output.contracts;
        const contractName = artifact.meta?.ContractName || artifact.meta?.Name;
        outer: for (const fileContracts of Object.values(contracts) as any[]) {
          if (!fileContracts || typeof fileContracts !== 'object') continue;
          // Prefer named match
          if (contractName && fileContracts[contractName]?.storageLayout) {
            sl = fileContracts[contractName].storageLayout;
            break;
          }
          for (const c of Object.values(fileContracts) as any[]) {
            if (c?.storageLayout?.storage) { sl = c.storageLayout; break outer; }
          }
        }
      }

      // Runtime type guard: must have storage array and types object
      if (
        sl &&
        typeof sl === 'object' &&
        Array.isArray(sl.storage) &&
        sl.types && typeof sl.types === 'object'
      ) {
        found[normalizedAddr] = {
          layout: sl as StorageLayoutResponse,
          status: 'loaded',
        };
      }
    }
    return found;
  }, [diffAddresses, rtArtifacts]);

  // Merge: EDB session layouts win when loaded (authoritative), inline layouts fill the gaps
  const layouts = useMemo(() => {
    const merged: Record<string, LayoutEntry> = { ...sessionLayouts };
    for (const [addr, entry] of Object.entries(inlineLayouts)) {
      if (!merged[addr] || merged[addr].status !== 'loaded') {
        merged[addr] = entry;
      }
    }
    return merged;
  }, [sessionLayouts, inlineLayouts]);

  // Known keys for mapping resolution
  const knownKeys = useMemo(
    () => extractKnownKeys(result, storageDiffs, contractContext?.address),
    [result, storageDiffs, contractContext?.address]
  );

  // Descriptor indices per address
  const descriptorIndices = useMemo(() => {
    const indices = new Map<string, Map<string, SlotDescriptor[]>>();
    for (const [addr, entry] of Object.entries(layouts)) {
      if (entry.layout) {
        indices.set(addr.toLowerCase(), buildSlotDescriptors(entry.layout));
      }
    }
    return indices;
  }, [layouts]);

  const getStateName = (addr: string): string | undefined => {
    if (!addr) return undefined;
    const normalizedAddr = addr.toLowerCase();
    const artifact = rtArtifacts[addr] || rtArtifacts[normalizedAddr];
    if (artifact?.meta?.Name) return artifact.meta.Name;
    if (artifact?.meta?.ContractName) return artifact.meta.ContractName;
    const compilationTarget = artifact?.input?.settings?.compilationTarget;
    if (compilationTarget) {
      const name = Object.values(compilationTarget)[0];
      if (typeof name === 'string') return name;
    }
    if (normalizedAddr === contractContext?.address?.toLowerCase()) {
      return contractContext.name;
    }
    const facet = contractContext?.diamondFacets?.find(
      (f: any) => f.address.toLowerCase() === normalizedAddr
    );
    if (facet?.name) return facet.name;
    return undefined;
  };

  const isStateVerified = (addr: string): boolean => {
    if (!addr) return false;
    const normalizedAddr = addr.toLowerCase();
    const source = rtSources[addr] || rtSources[normalizedAddr];
    if (source?.Source) return true;
    const artifact = rtArtifacts[addr] || rtArtifacts[normalizedAddr];
    if (artifact?.input?.sources || artifact?.meta) return true;
    return false;
  };

  const getStateTokenType = (addr: string): string | null => {
    if (!addr) return null;
    const normalizedAddr = addr.toLowerCase();
    if (normalizedAddr === contractContext?.address?.toLowerCase()) {
      return contractContext?.tokenType || null;
    }
    const artifact = rtArtifacts[addr] || rtArtifacts[normalizedAddr];
    const abi = artifact?.meta?.ABI;
    if (abi) {
      const abiStr = typeof abi === 'string' ? abi : JSON.stringify(abi);
      if (abiStr.includes('tokenURI') || abiStr.includes('ownerOf')) return 'ERC721';
      if (abiStr.includes('balanceOf(address,uint256)')) return 'ERC1155';
      if (abiStr.includes('decimals') && abiStr.includes('totalSupply')) return 'ERC20';
    }
    return null;
  };

  const formatHex = (hex: string | undefined): string => {
    if (!hex) return '0x0';
    return hex;
  };

  const getDecodedInfo = (diff: any): { match: SlotMatch; fields: DecodedField[] } | null => {
    const addr = (diff.address || '').toLowerCase();
    const layoutEntry = layouts[addr];
    if (!layoutEntry?.layout) return null;

    const index = descriptorIndices.get(addr);
    if (!index) return null;

    const slot = diff.slot || diff.key || '';
    const match = matchSlot(slot, layoutEntry.layout, index, knownKeys);
    if (match.matchType === 'none') return null;

    const beforeHex = formatHex(diff.before);
    const afterHex = formatHex(diff.after || diff.value);
    const fields = decodeDiffFields(beforeHex, afterHex, match);
    if (fields.length === 0) return null;

    return { match, fields };
  };

  // Group diffs by contract address
  const groupedByContract = (() => {
    const map = new Map<string, {
      address: string;
      name?: string;
      verified: boolean;
      tokenType: string | null;
      decimals: number | null;
      layoutStatus: string;
      diffs: typeof storageDiffs;
    }>();

    storageDiffs.forEach((diff: any) => {
      // Skip unchanged slots (SSTORE that wrote same value back)
      const bNorm = normalizeHex(diff.before);
      const aNorm = normalizeHex(diff.after || diff.value);
      if (bNorm === aNorm) return;

      const addr = (diff.address || 'unknown').toLowerCase();
      if (!map.has(addr)) {
        const tokenType = getStateTokenType(diff.address);
        // Resolve token decimals: use contractContext for primary contract
        let decimals: number | null = null;
        if (tokenType === 'ERC20') {
          if (addr === contractContext?.address?.toLowerCase()) {
            decimals = contractContext?.tokenDecimals ?? null;
          }
        }
        map.set(addr, {
          address: diff.address || 'Unknown',
          name: getStateName(diff.address),
          verified: isStateVerified(diff.address),
          tokenType,
          decimals,
          layoutStatus: layouts[addr]?.status || (sessionId ? 'loading' : 'unavailable'),
          diffs: []
        });
      }
      map.get(addr)!.diffs.push(diff);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.address.toLowerCase() === contractContext?.address?.toLowerCase()) return -1;
      if (b.address.toLowerCase() === contractContext?.address?.toLowerCase()) return 1;
      return (a.name || a.address).localeCompare(b.name || b.address);
    });
  })();

  const tokenBadgeClass = (t: string | null) => {
    if (t === 'ERC20') return 'state-token-badge erc20';
    if (t === 'ERC721') return 'state-token-badge erc721';
    if (t === 'ERC1155') return 'state-token-badge erc1155';
    return 'state-token-badge';
  };

  return (
    <section className="sim-panel">
      {(() => {
        // Total filtered diff count for the badge
        const totalDiffs = groupedByContract.reduce((sum, c) => sum + c.diffs.length, 0);
        return (
          <div className="state-header">
            <h2 style={{ margin: 0 }}>State Changes</h2>
            {totalDiffs > 0 && (
              <span className="state-count-badge">
                {totalDiffs} change{totalDiffs !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        );
      })()}

      {groupedByContract.length > 0 ? (
        <div className="state-groups">
          {groupedByContract.map((contract, contractIdx) => (
            <details
              key={contractIdx}
              open
              className="state-contract-group"
            >
              <summary className="state-contract-summary">
                <span className="state-summary-arrow">&#9654;</span>
                <span className="state-contract-name">
                  {contract.name || "Unknown Contract"}
                </span>
                {contract.tokenType && (
                  <span className={tokenBadgeClass(contract.tokenType)}>
                    {contract.tokenType}
                  </span>
                )}
                {contract.layoutStatus === 'loading' && (
                  <span className="state-layout-badge loading">
                    <span className="state-layout-spinner" /> Loading layout...
                  </span>
                )}
                {contract.layoutStatus === 'loaded' && (
                  <span className="state-layout-badge loaded">Decoded</span>
                )}
                <code className="state-contract-addr">
                  {contract.address}
                </code>
                <span className="state-change-count">
                  ({contract.diffs.length} change{contract.diffs.length !== 1 ? "s" : ""})
                </span>
              </summary>

              <div className="state-cards-body">
                {contract.diffs.map((diff: any, diffIdx: number) => {
                  const beforeHex = formatHex(diff.before);
                  const afterHex = formatHex(diff.after || diff.value);
                  const decoded = getDecodedInfo(diff);

                  return (
                    <div key={diffIdx} className="state-diff-card">
                      <div className="state-card-top">
                        <span className="state-slot-label">Slot</span>
                        <span className="state-slot-val">
                          {formatHex(diff.slot || diff.key)}
                        </span>
                      </div>

                      {/* Decoded variable name row */}
                      {decoded && decoded.fields.length > 0 && (
                        <div className="state-var-row">
                          {decoded.fields.length === 1 ? (
                            <>
                              <span className="state-var-label">{decoded.fields[0].label}</span>
                              {decoded.fields[0].typeLabel && (
                                <span className="state-type-chip">{decoded.fields[0].typeLabel}</span>
                              )}
                              <span className={`state-confidence-badge ${decoded.fields[0].confidence}`}>
                                {decoded.fields[0].confidence}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="state-var-label">Packed slot</span>
                              <span className="state-type-chip">{decoded.fields.length} fields</span>
                            </>
                          )}
                        </div>
                      )}

                      <div className="state-diff-row">
                        <div className="state-val-block">
                          <span className="state-val-label">Before</span>
                          <span className="state-hex before-val">
                            {renderHighlightedHex(beforeHex, afterHex, "before")}
                          </span>
                        </div>
                        <div className="state-arrow-col">&#10132;</div>
                        <div className="state-val-block">
                          <span className="state-val-label">After</span>
                          <span className="state-hex after-val">
                            {renderHighlightedHex(afterHex, beforeHex, "after")}
                          </span>
                        </div>
                      </div>

                      {/* Single-field decoded values */}
                      {decoded && decoded.fields.length === 1 && (() => {
                        const f = decoded.fields[0];
                        const isUint = /^uint\d*$/i.test(f.typeLabel);
                        const dec = isUint ? contract.decimals : null;
                        return (
                          <div className="state-decoded-row">
                            <div className="state-val-block">
                              <span className="state-decoded-label">Decoded</span>
                              <span className="state-decoded-val before-val">
                                {formatDecodedValue(f.beforeDecoded, dec)}
                              </span>
                            </div>
                            <div className="state-arrow-col">&#10132;</div>
                            <div className="state-val-block">
                              <span className="state-decoded-label">Decoded</span>
                              <span className="state-decoded-val after-val">
                                {formatDecodedValue(f.afterDecoded, dec)}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Packed slot: multiple decoded fields */}
                      {decoded && decoded.fields.length > 1 && (
                        <div className="state-packed-fields">
                          {decoded.fields.map((field, fi) => {
                            const isUint = /^uint\d*$/i.test(field.typeLabel);
                            const dec = isUint ? contract.decimals : null;
                            return (
                              <div key={fi} className="state-packed-field">
                                <span className="state-packed-name">{field.label}</span>
                                <span className="state-packed-before">{formatDecodedValue(field.beforeDecoded, dec)}</span>
                                <span className="state-packed-arrow">&#10132;</span>
                                <span className="state-packed-after">{formatDecodedValue(field.afterDecoded, dec)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="state-empty">
          <div className="state-empty-icon">Storage</div>
          <div>No storage slots were modified during this simulation</div>
        </div>
      )}
    </section>
  );
};
