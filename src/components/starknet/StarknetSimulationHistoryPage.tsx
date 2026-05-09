/**
 * StarknetSimulationHistoryPage — past Starknet sims rendered from
 * `starknetSimulationHistoryService`. Mirrors the EVM
 * `<SimulationHistoryPage>` exactly: same toolbar, filters toggle,
 * bulk-select, icon actions, paginated table, shared CSS — only the
 * column set diverges where Cairo has its own concepts (source variant,
 * L2 gas instead of EVM gas, entrypoint instead of function selector).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  starknetSimulationHistoryService,
  type StarknetSimulationHistoryFilter,
  type StarknetStoredSimulation,
} from "../../services/StarknetSimulationHistoryService";
import { useStarknetSimulation } from "../../contexts/StarknetSimulationContext";
import type { StarknetSimulationEntry } from "../../contexts/StarknetSimulationContext";
import "../../styles/SimulationHistory.css";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "#888",
  marginBottom: "16px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function shortHex(hex: string | undefined, headChars = 6, tailChars = 4): string {
  if (!hex) return "—";
  if (hex.length <= headChars + tailChars + 2) return hex;
  return `${hex.slice(0, headChars + 2)}…${hex.slice(-tailChars)}`;
}

/** Function-column formatter. New rows store decoded names in `entrypoint`
 *  and the raw hex selector in `selector`. Legacy rows (saved before the
 *  decoder fallback was removed) sometimes carried the selector inside
 *  `entrypoint`; treat any 0x-prefixed hex blob as a selector and shorten
 *  it so the column stays readable. */
function formatEntrypoint(
  entrypoint: string | undefined,
  selector: string | undefined,
): string {
  const looksLikeHex = (v: string | undefined): boolean =>
    typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v) && v.length > 12;
  if (entrypoint && !looksLikeHex(entrypoint)) return entrypoint;
  const hex = looksLikeHex(entrypoint) ? entrypoint : selector;
  return shortHex(hex, 4, 4);
}

function formatGas(value: string | undefined): string {
  if (!value) return "—";
  try {
    const n = BigInt(value);
    return n.toLocaleString("en-US");
  } catch {
    return value;
  }
}

const StatusBadge: React.FC<{ status: StarknetStoredSimulation["status"] }> = ({
  status,
}) => {
  const config: Record<string, { label: string; color: string; icon: string }> =
    {
      success: { label: "Success", color: "#22c55e", icon: "✓" },
      failed: { label: "Failed", color: "#ef4444", icon: "✗" },
      reverted: { label: "Reverted", color: "#ef4444", icon: "⟲" },
    };
  const { label, color, icon } =
    config[status] ?? { label: status ?? "Unknown", color: "#888", icon: "•" };
  return (
    <span className="sim-history-status-badge" style={{ color }}>
      <span className="sim-history-status-icon">{icon}</span>
      {label}
    </span>
  );
};

const NetworkBadge: React.FC<{ network: string }> = ({ network }) => {
  const color = network === "mainnet" ? "#a069ff" : "#34d399";
  return (
    <span
      className="sim-history-network-badge"
      style={{ borderColor: color, color }}
    >
      {network === "mainnet" ? "Starknet Mainnet" : "Starknet Sepolia"}
    </span>
  );
};

const StarknetSimulationHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSimulation, clearSimulation } = useStarknetSimulation();

  const [simulations, setSimulations] = useState<StarknetStoredSimulation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<StarknetSimulationHistoryFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const formattedTimestamps = useMemo(() => {
    const map = new Map<string, string>();
    simulations.forEach((sim) => map.set(sim.id, formatTimestamp(sim.timestamp)));
    return map;
  }, [simulations]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(simulations.length / pageSize)),
    [simulations.length, pageSize],
  );

  const paginatedSimulations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return simulations.slice(start, start + pageSize);
  }, [simulations, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, pageSize]);

  const handlePageChange = useCallback(
    (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages))),
    [totalPages],
  );

  const handlePageSizeChange = useCallback((newSize: PageSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  const loadSimulations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const sims = await starknetSimulationHistoryService.getSimulations(
        filter,
        true,
      );
      setSimulations(sims);
    } catch (err) {
      console.error("[StarknetSimulationHistoryPage] Load failed:", err);
      setError("Failed to load simulation history");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadSimulations();
  }, [loadSimulations]);

  const handleViewSimulation = useCallback(
    async (sim: StarknetStoredSimulation) => {
      try {
        const full = await starknetSimulationHistoryService.getSimulation(
          sim.id,
        );
        if (full && full.response) {
          const entry: StarknetSimulationEntry = {
            id: full.id,
            source: full.source,
            response: full.response,
            txHash: full.txHash,
            chainId: full.chainId ?? null,
            bridgeGitSha: full.bridgeGitSha ?? null,
            network: full.network,
            formSnapshot: full.formSnapshot,
            createdAt: full.timestamp,
          };
          setSimulation(entry, { skipHistorySave: true });
        }
        navigate(`/starknet/simulation/${sim.id}`, {
          state: { fromSimulation: true },
        });
      } catch (err) {
        console.error("[StarknetSimulationHistoryPage] View failed:", err);
        navigate(`/starknet/simulation/${sim.id}`);
      }
    },
    [navigate, setSimulation],
  );

  const handleResimulate = useCallback(
    (sim: StarknetStoredSimulation) => {
      clearSimulation();
      navigate(
        `/starknet/builder?mode=simulation&clone=${encodeURIComponent(sim.id)}`,
      );
    },
    [clearSimulation, navigate],
  );

  const handleDeleteSimulation = useCallback(async (id: string) => {
    try {
      await starknetSimulationHistoryService.deleteSimulation(id);
      setSimulations((prev) => prev.filter((s) => s.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error("[StarknetSimulationHistoryPage] Delete failed:", err);
    }
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(
      `Delete ${selectedIds.size} simulation(s)?`,
    );
    if (!confirmed) return;
    try {
      await starknetSimulationHistoryService.deleteSimulations(
        Array.from(selectedIds),
      );
      setSimulations((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } catch (err) {
      console.error("[StarknetSimulationHistoryPage] Bulk delete failed:", err);
    }
  }, [selectedIds]);

  const handleClearAll = useCallback(async () => {
    const confirmed = window.confirm(
      "Delete all Starknet simulations? This cannot be undone.",
    );
    if (!confirmed) return;
    try {
      await starknetSimulationHistoryService.clearAll();
      setSimulations([]);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("[StarknetSimulationHistoryPage] Clear all failed:", err);
    }
  }, []);

  const allPageItemsSelected = useMemo(() => {
    if (paginatedSimulations.length === 0) return false;
    return paginatedSimulations.every((s) => selectedIds.has(s.id));
  }, [paginatedSimulations, selectedIds]);

  const handleSelectAll = useCallback(() => {
    if (allPageItemsSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedSimulations.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedSimulations.forEach((s) => next.add(s.id));
        return next;
      });
    }
  }, [allPageItemsSelected, paginatedSimulations]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleNewSimulation = useCallback(() => {
    clearSimulation();
    navigate("/starknet/builder?mode=simulation");
  }, [clearSimulation, navigate]);

  const uniqueNetworks = useMemo(() => {
    const networks = new Set<string>();
    simulations.forEach((s) => networks.add(s.network));
    return Array.from(networks);
  }, [simulations]);

  return (
    <div
      className="sim-history-page"
      style={{
        padding: "20px",
        background: "#0a0a0a",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      <div className="tool-content-container">
        <h3 style={sectionTitleStyle}>Starknet Simulation History</h3>

        <header className="sim-history-header">
          <div className="sim-history-title-section">
            <h1 className="sim-history-title">Simulator</h1>
            <span className="sim-history-count">
              {simulations.length} simulation
              {simulations.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="sim-history-actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sim-history-btn sim-history-btn-primary"
              onClick={handleNewSimulation}
            >
              <span className="sim-history-btn-icon">+</span>
              New Simulation
            </Button>
          </div>
        </header>

        <div className="sim-history-toolbar">
          <div className="sim-history-toolbar-left">
            {selectedIds.size > 0 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="sim-history-btn sim-history-btn-danger"
                  onClick={handleDeleteSelected}
                >
                  Delete ({selectedIds.size})
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="sim-history-btn sim-history-btn-ghost"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear Selection
                </Button>
              </>
            )}
          </div>
          <div className="sim-history-toolbar-right">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`sim-history-btn sim-history-btn-ghost ${showFilters ? "active" : ""}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" />
              </svg>
              Filters
            </Button>
            {simulations.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="sim-history-btn sim-history-btn-ghost sim-history-btn-danger-text"
                onClick={handleClearAll}
              >
                Clear All
              </Button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="sim-history-filters">
            <div className="sim-history-filter-group">
              <label>Status</label>
              <Select
                value={filter.status || "__all__"}
                onValueChange={(v) =>
                  setFilter((prev) => ({
                    ...prev,
                    status:
                      v === "__all__"
                        ? undefined
                        : (v as StarknetStoredSimulation["status"]),
                  }))
                }
              >
                <SelectTrigger className="h-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="reverted">Reverted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sim-history-filter-group">
              <label>Source</label>
              <Select
                value={filter.source || "__all__"}
                onValueChange={(v) =>
                  setFilter((prev) => ({
                    ...prev,
                    source:
                      v === "__all__"
                        ? undefined
                        : (v as StarknetStoredSimulation["source"]),
                  }))
                }
              >
                <SelectTrigger className="h-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="trace">Trace</SelectItem>
                  <SelectItem value="synthetic">Synthetic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sim-history-filter-group">
              <label>Network</label>
              <Select
                value={filter.network || "__all__"}
                onValueChange={(v) =>
                  setFilter((prev) => ({
                    ...prev,
                    network:
                      v === "__all__"
                        ? undefined
                        : (v as "mainnet" | "sepolia"),
                  }))
                }
              >
                <SelectTrigger className="h-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Networks</SelectItem>
                  {uniqueNetworks.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n === "mainnet" ? "Starknet Mainnet" : "Starknet Sepolia"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sim-history-btn sim-history-btn-ghost"
              onClick={() => setFilter({})}
            >
              Clear Filters
            </Button>
          </div>
        )}

        {loading ? (
          <div className="sim-history-loading">
            <div className="sim-history-spinner" />
            Loading simulations…
          </div>
        ) : error ? (
          <div className="sim-history-error">
            <span className="sim-history-error-icon">⚠</span>
            {error}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadSimulations}
            >
              Retry
            </Button>
          </div>
        ) : simulations.length === 0 ? (
          <div className="sim-history-empty">
            <div className="sim-history-empty-icon">--</div>
            <h2>No simulations yet</h2>
            <p>Run your first Starknet simulation to see it here</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sim-history-btn sim-history-btn-primary"
              onClick={handleNewSimulation}
            >
              New Simulation
            </Button>
          </div>
        ) : (
          <div className="sim-history-table-container responsive-scroll">
            <Table className="sim-history-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="sim-history-th-checkbox">
                    <Checkbox
                      checked={allPageItemsSelected}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Id</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Function</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>L2 Gas</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="sim-history-th-actions">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSimulations.map((sim) => (
                  <TableRow
                    key={sim.id}
                    className={selectedIds.has(sim.id) ? "selected" : ""}
                    onClick={() => handleViewSimulation(sim)}
                  >
                    <TableCell
                      className="sim-history-td-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedIds.has(sim.id)}
                        onCheckedChange={() => handleToggleSelect(sim.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={sim.status} />
                    </TableCell>
                    <TableCell className="sim-history-td-id">
                      <span className="sim-history-id" title={sim.id}>
                        {sim.id.length > 12
                          ? `${sim.id.slice(0, 8)}…`
                          : sim.id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="sim-history-address"
                        title={sim.senderAddress}
                      >
                        {shortHex(sim.senderAddress)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="sim-history-to-cell">
                        <span
                          className="sim-history-address"
                          title={sim.txHash ?? sim.contractAddress}
                        >
                          {sim.txHash
                            ? shortHex(sim.txHash, 6, 6)
                            : shortHex(sim.contractAddress)}
                        </span>
                        {sim.contractName && (
                          <span className="sim-history-contract-name">
                            {sim.contractName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="sim-history-function">
                        {formatEntrypoint(sim.entrypoint, sim.selector)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <NetworkBadge network={sim.network} />
                    </TableCell>
                    <TableCell className="sim-history-td-block">
                      {formatGas(sim.l2GasConsumed)}
                    </TableCell>
                    <TableCell className="sim-history-td-time">
                      <span title={new Date(sim.timestamp).toLocaleString()}>
                        {formattedTimestamps.get(sim.id) ??
                          formatTimestamp(sim.timestamp)}
                      </span>
                    </TableCell>
                    <TableCell
                      className="sim-history-td-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="icon-borderless"
                        size="icon-inline"
                        className="sim-history-action-btn"
                        onClick={() => handleViewSimulation(sim)}
                        title="View Details"
                        style={{
                          background: "none",
                          border: "none",
                          boxShadow: "none",
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </Button>
                      <Button
                        type="button"
                        variant="icon-borderless"
                        size="icon-inline"
                        className="sim-history-action-btn"
                        onClick={() => handleResimulate(sim)}
                        title="Re-Simulate"
                        style={{
                          background: "none",
                          border: "none",
                          boxShadow: "none",
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      </Button>
                      <Button
                        type="button"
                        variant="icon-borderless"
                        size="icon-inline"
                        className="sim-history-action-btn sim-history-action-btn-danger"
                        onClick={() => handleDeleteSimulation(sim.id)}
                        title="Delete"
                        style={{
                          background: "none",
                          border: "none",
                          boxShadow: "none",
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="sim-history-pagination">
                <div className="sim-history-pagination-info">
                  Showing {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, simulations.length)} of{" "}
                  {simulations.length}
                </div>

                <div className="sim-history-pagination-controls">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="sim-history-pagination-btn"
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    title="First page"
                  >
                    ⟨⟨
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="sim-history-pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    title="Previous page"
                  >
                    ⟨
                  </Button>

                  <span className="sim-history-pagination-pages">
                    Page {currentPage} of {totalPages}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="sim-history-pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    title="Next page"
                  >
                    ⟩
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="sim-history-pagination-btn"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    title="Last page"
                  >
                    ⟩⟩
                  </Button>
                </div>

                <div className="sim-history-pagination-size">
                  <span>Per page:</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) =>
                      handlePageSizeChange(Number(v) as PageSize)
                    }
                  >
                    <SelectTrigger className="h-auto" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StarknetSimulationHistoryPage;
