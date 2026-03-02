import React from "react";
import { useNavigate } from "react-router-dom";
import type { SimulationResult } from "../../types/transaction";
import { shortenAddress } from "../shared/AddressDisplay";
import { SourceBadge } from "../shared/ContractBadges";

type SourceProvider = 'etherscan' | 'sourcify' | 'blockscout' | null;

interface ContractsTabProps {
  result: SimulationResult;
  contractContext: any;
}

type ExplorerConfig = {
  etherscan: string;
  etherscanName: string;
  blockscout?: string;
  blockscoutName?: string;
};

const explorerBase: Record<number, ExplorerConfig> = {
  1: { etherscan: 'https://etherscan.io', etherscanName: 'Etherscan', blockscout: 'https://eth.blockscout.com', blockscoutName: 'Blockscout' },
  137: { etherscan: 'https://polygonscan.com', etherscanName: 'Polygonscan', blockscout: 'https://polygon.blockscout.com', blockscoutName: 'Blockscout' },
  42161: { etherscan: 'https://arbiscan.io', etherscanName: 'Arbiscan', blockscout: 'https://arbitrum.blockscout.com', blockscoutName: 'Blockscout' },
  10: { etherscan: 'https://optimistic.etherscan.io', etherscanName: 'Optimism Etherscan', blockscout: 'https://optimism.blockscout.com', blockscoutName: 'Blockscout' },
  8453: { etherscan: 'https://basescan.org', etherscanName: 'Basescan', blockscout: 'https://base.blockscout.com', blockscoutName: 'Blockscout' },
  84532: { etherscan: 'https://sepolia.basescan.org', etherscanName: 'Base Sepolia Scan', blockscout: 'https://base-sepolia.blockscout.com', blockscoutName: 'Blockscout' },
  11155111: { etherscan: 'https://sepolia.etherscan.io', etherscanName: 'Sepolia Etherscan', blockscout: 'https://sepolia.blockscout.com', blockscoutName: 'Blockscout' },
  43114: { etherscan: 'https://snowtrace.io', etherscanName: 'Snowtrace' },
  56: { etherscan: 'https://bscscan.com', etherscanName: 'BscScan' },
  250: { etherscan: 'https://ftmscan.com', etherscanName: 'FTMScan' },
  100: { etherscan: 'https://gnosisscan.io', etherscanName: 'Gnosisscan', blockscout: 'https://gnosis.blockscout.com', blockscoutName: 'Blockscout' },
};

export const ContractsTab: React.FC<ContractsTabProps> = ({ result, contractContext }) => {
  const navigate = useNavigate();

  const rawTrace = (result as any)?.rawTrace;
  let parsedRawTrace: any = null;
  try {
    parsedRawTrace = typeof rawTrace === 'string' ? JSON.parse(rawTrace) : rawTrace;
  } catch {
    parsedRawTrace = rawTrace;
  }
  const traceArtifacts = parsedRawTrace?.artifacts || {};
  const traceOpcodeLines = parsedRawTrace?.opcodeLines || {};

  const getFallbackFileCount = (addr: string): number => {
    if (!addr) return 0;
    const normalized = addr.toLowerCase();
    const artifact = traceArtifacts[addr] || traceArtifacts[normalized];
    if (!artifact) return 0;

    const inputSources = artifact.input?.sources;
    if (inputSources && typeof inputSources === 'object') {
      const count = Object.keys(inputSources).length;
      if (count > 0) return count;
    }

    const directSources = artifact.sources;
    if (directSources && typeof directSources === 'object') {
      const count = Object.keys(directSources).length;
      if (count > 0) return count;
    }

    const outputContracts = artifact.output?.contracts;
    if (outputContracts && typeof outputContracts === 'object') {
      const count = Object.keys(outputContracts).length;
      if (count > 0) return count;
    }

    return 0;
  };

  // Re-derive verification status from raw trace artifacts for saved results
  // that may have been stored with incorrect verified=false
  const deriveVerificationFromArtifacts = (addr: string): { verified: boolean; sourceProvider: SourceProvider } => {
    const normalized = addr.toLowerCase();
    const artifact = traceArtifacts[addr] || traceArtifacts[normalized];
    const hasOpcodeLines = !!(traceOpcodeLines[addr] || traceOpcodeLines[normalized]);

    if (hasOpcodeLines || (artifact && (artifact.sourceProvider || artifact.meta || (artifact.sources && typeof artifact.sources === 'object' && Object.keys(artifact.sources).length > 0) || (artifact.input?.sources && typeof artifact.input.sources === 'object' && Object.keys(artifact.input.sources).length > 0)))) {
      // Determine source provider
      if (artifact?.sourceProvider && (artifact.sourceProvider === 'sourcify' || artifact.sourceProvider === 'etherscan' || artifact.sourceProvider === 'blockscout')) {
        return { verified: true, sourceProvider: artifact.sourceProvider };
      }
      if (artifact?.meta) {
        if (artifact.meta.CompilerVersion || artifact.meta.SwarmSource !== undefined) {
          return { verified: true, sourceProvider: 'etherscan' };
        }
        if (artifact.meta.compiler_version) {
          return { verified: true, sourceProvider: 'blockscout' };
        }
        return { verified: true, sourceProvider: 'sourcify' };
      }
      return { verified: true, sourceProvider: 'sourcify' };
    }

    return { verified: false, sourceProvider: null };
  };

  const rawSimulationContracts = (result as any)?.contracts as Array<{
    address: string;
    name?: string;
    verified: boolean;
    sourceProvider: SourceProvider;
    fileCount?: number;
  }> || [];

  // Patch contracts: re-derive verification from trace artifacts when saved data is stale
  const simulationContracts = rawSimulationContracts.map(c => {
    if (c.verified) return c;
    const derived = deriveVerificationFromArtifacts(c.address);
    if (derived.verified) {
      return { ...c, verified: true, sourceProvider: derived.sourceProvider };
    }
    return c;
  });

  const chainId = (result as any)?.chainId || contractContext?.networkId || 1;
  const chainExplorer = explorerBase[chainId] || explorerBase[1];

  const getExplorerDisplayName = (provider: SourceProvider): string | null => {
    if (provider === 'sourcify') return 'Sourcify';
    if (provider === 'blockscout') return chainExplorer.blockscoutName || 'Blockscout';
    if (provider === 'etherscan') return chainExplorer.etherscanName;
    return null;
  };

  const getExplorerUrl = (addr: string, provider: SourceProvider): string | null => {
    if (provider === 'sourcify') {
      return `https://repo.sourcify.dev/contracts/full_match/${chainId}/${addr}/`;
    } else if (provider === 'blockscout' && chainExplorer.blockscout) {
      return `${chainExplorer.blockscout}/address/${addr}`;
    } else {
      return `${chainExplorer.etherscan}/address/${addr}#code`;
    }
  };

  const contracts = simulationContracts.map(c => ({
    ...c,
    fileCount: c.fileCount && c.fileCount > 0 ? c.fileCount : getFallbackFileCount(c.address),
  })).sort((a, b) => {
    if (contractContext?.address) {
      if (a.address.toLowerCase() === contractContext.address.toLowerCase()) return -1;
      if (b.address.toLowerCase() === contractContext.address.toLowerCase()) return 1;
    }
    if (a.verified && !b.verified) return -1;
    if (!a.verified && b.verified) return 1;
    const aHasName = !!a.name && !a.name.startsWith('0x');
    const bHasName = !!b.name && !b.name.startsWith('0x');
    if (aHasName && !bHasName) return -1;
    if (!aHasName && bHasName) return 1;
    return (a.name || a.address).localeCompare(b.name || b.address);
  });

  return (
    <section className="sim-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0 }}>Contracts</h2>
        {contracts.length > 0 && (
          <span style={{
            padding: "4px 12px",
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: "4px",
            fontSize: "0.875rem",
            color: "#ffffff"
          }}>
            {contracts.length} contract{contracts.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {contracts.length > 0 ? (
        <div style={{
          background: "rgba(0, 0, 0, 0.2)",
          border: "1px solid #2a2b30",
          borderRadius: "8px",
          overflow: "hidden"
        }}>
          {/* Table Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 150px 60px",
            padding: "12px 16px",
            borderBottom: "1px solid #2a2b30",
            background: "rgba(0, 0, 0, 0.3)",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#9a9aac",
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}>
            <span>Contract</span>
            <span>Verification</span>
            <span style={{ textAlign: "right" }}>Files</span>
          </div>

          {/* Table Rows */}
          {contracts.map((contract, index) => {
            const explorerUrl = contract.verified ? getExplorerUrl(contract.address, contract.sourceProvider) : null;
            const sourceLabel = getExplorerDisplayName(contract.sourceProvider);

            return (
              <div
                key={index}
                onClick={() => {
                  navigate(`/explorer?address=${contract.address}&chainId=${chainId}`);
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 150px 60px",
                  padding: "14px 16px",
                  borderBottom: index < contracts.length - 1 ? "1px solid #2a2b30" : "none",
                  alignItems: "center",
                  background: contract.verified ? "transparent" : "rgba(251, 191, 36, 0.02)",
                  cursor: "pointer",
                  transition: "background 0.15s ease"
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={e => (e.currentTarget.style.background = contract.verified ? "transparent" : "rgba(251, 191, 36, 0.02)")}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: contract.verified ? "#f6f6fb" : "#fbbf24"
                  }}>
                    {contract.name || shortenAddress(contract.address)}
                  </span>
                  <code style={{
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    fontFamily: "monospace"
                  }}>
                    {contract.address}
                  </code>
                </div>

                {contract.verified ? (
                  <a
                    href={explorerUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center hover:opacity-80 transition-opacity"
                  >
                    <SourceBadge source={contract.sourceProvider} size="sm" />
                  </a>
                ) : (
                  <span className="text-xs text-yellow-400">
                    Unverified
                  </span>
                )}

                <span style={{
                  fontSize: "0.875rem",
                  color: contract.fileCount > 0 ? "#f6f6fb" : "#6b7280",
                  textAlign: "right",
                  fontWeight: 500
                }}>
                  {contract.fileCount > 0 ? contract.fileCount : "\u2014"}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          padding: "40px",
          textAlign: "center",
          color: "rgba(246, 246, 251, 0.5)",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px dashed #2a2b30",
          borderRadius: "8px"
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "8px", opacity: 0.5 }}>Page</div>
          <div>No contracts detected in simulation</div>
        </div>
      )}
    </section>
  );
};
