/**
 * SimulationHistoryPage - Display list of past simulations
 * Allows filtering, viewing details, and cloning simulations
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  simulationHistoryService, 
  type StoredSimulation, 
  type SimulationHistoryFilter 
} from '../services/SimulationHistoryService';
import { traceVaultService, recomputeHierarchy } from '../services/TraceVaultService';
import { useSimulation } from '../contexts/SimulationContext';
import { SUPPORTED_CHAINS } from '../utils/chains';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import { Checkbox } from './ui/checkbox';
import { shortenAddress } from './shared/AddressDisplay';
import '../styles/SimulationHistory.css';

// Helper to format timestamp
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

// shortenAddress imported from shared/AddressDisplay.tsx

// Network badge component
const NetworkBadge: React.FC<{ networkId: number; networkName: string }> = ({ networkId, networkName }) => {
  const chain = SUPPORTED_CHAINS.find(c => c.id === networkId);
  // Color may be defined on some chains (type annotation may be incomplete)
  const color = (chain as any)?.color || '#6b7280';
  
  return (
    <span 
      className="sim-history-network-badge"
      style={{ 
        borderColor: color,
        color: color,
      }}
    >
      {networkName || `Chain ${networkId}`}
    </span>
  );
};

// Status badge component
const StatusBadge: React.FC<{ status: 'success' | 'failed' | 'reverted' }> = ({ status }) => {
  const config = {
    success: { label: 'Success', color: '#22c55e', icon: '✓' },
    failed: { label: 'Failed', color: '#ef4444', icon: '✗' },
    reverted: { label: 'Reverted', color: '#ef4444', icon: '⟲' },
  };
  
  const { label, color, icon } = config[status];
  
  return (
    <span 
      className="sim-history-status-badge"
      style={{ color }}
    >
      <span className="sim-history-status-icon">{icon}</span>
      {label}
    </span>
  );
};

// sectionCardStyle replaced by .tool-content-container CSS class

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "#888",
  marginBottom: "16px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

// Pagination options
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type PageSize = typeof PAGE_SIZE_OPTIONS[number];

const SimulationHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSimulation, clearSimulation, setDecodedTraceRows, setSimulationId, setSourceTexts, setDecodedTraceMeta } = useSimulation();

  const [simulations, setSimulations] = useState<StoredSimulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<SimulationHistoryFilter>({});
  const [showFilters, setShowFilters] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const formattedTimestamps = useMemo(() => {
    const map = new Map<string, string>();
    simulations.forEach((sim) => {
      map.set(sim.id, formatTimestamp(sim.timestamp));
    });
    return map;
  }, [simulations]);

  // Pagination calculations
  const totalPages = useMemo(() => Math.ceil(simulations.length / pageSize), [simulations.length, pageSize]);

  const paginatedSimulations = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return simulations.slice(startIndex, startIndex + pageSize);
  }, [simulations, currentPage, pageSize]);

  // Reset to page 1 when filter changes or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, pageSize]);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  // Handle page size change
  const handlePageSizeChange = useCallback((newSize: PageSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  // Load simulations - use lightweight mode to avoid loading huge result/contractContext
  const loadSimulations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Use lightweight=true to avoid loading full result/contractContext into memory
      const sims = await simulationHistoryService.getSimulations(filter, true);
      setSimulations(sims);
    } catch {
      setError('Failed to load simulation history');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadSimulations();
  }, [loadSimulations]);

  // Handle view simulation - fetch full data when viewing
  const handleViewSimulation = useCallback(async (sim: StoredSimulation) => {
    // In lightweight mode, we don't have result/contractContext - need to fetch
    try {
      const fullSim = await simulationHistoryService.getSimulation(sim.id);
      if (fullSim?.result && fullSim?.contractContext) {
        // Set simulation in context and navigate to results
        // Pass skipHistorySave to avoid creating duplicate history entries
        setSimulation(fullSim.result, fullSim.contractContext, { skipHistorySave: true });

        let restoredFromVault = false;
        const hasInternalInfo = (rows?: any[]) =>
          Array.isArray(rows) &&
          rows.some(
            (row) =>
              row?.jumpMarker ||
              row?.destFn ||
              row?.isInternalCall ||
              row?.hasChildren
          );
        try {
          const traceBundle = await traceVaultService.loadDecodedTrace(sim.id, {
            includeHeavy: false,
          });

          const opfsRowCount = traceBundle?.rows?.length ?? 0;
          const indexedDbRowCount = fullSim.decodedTraceRows?.length ?? 0;
          const opfsHasInternal = hasInternalInfo(traceBundle?.rows);
          const indexedDbHasInternal = hasInternalInfo(fullSim.decodedTraceRows);

          // Prefer OPFS if it has rows with hierarchy info
          // Fall back to IndexedDB only if OPFS is empty/missing hierarchy but IndexedDB has it
          let rowsToUse: any[] | undefined;
          let sourceLabel: string = 'unknown';

          if (opfsRowCount > 0 && opfsHasInternal) {
            // OPFS has full data with hierarchy - use it
            rowsToUse = traceBundle!.rows;
            sourceLabel = 'OPFS';
          } else if (indexedDbRowCount > 0 && indexedDbHasInternal) {
            // IndexedDB has hierarchy but OPFS doesn't - use IndexedDB
            rowsToUse = fullSim.decodedTraceRows;
            sourceLabel = 'IndexedDB';
          } else if (opfsRowCount > 0) {
            // OPFS has rows (even without hierarchy) - use it
            rowsToUse = traceBundle!.rows;
            sourceLabel = 'OPFS (no hierarchy)';
          } else if (indexedDbRowCount > 0) {
            // IndexedDB has rows as last resort
            rowsToUse = fullSim.decodedTraceRows;
            sourceLabel = 'IndexedDB (no hierarchy)';
          }

          if (rowsToUse && rowsToUse.length > 0) {
            // Recompute hierarchy from depth relationships to fix traces where
            // hasChildren wasn't computed correctly for nested call frames
            const fixedRows = recomputeHierarchy(rowsToUse);
            setDecodedTraceRows(fixedRows);
            if (traceBundle?.sourceTexts && Object.keys(traceBundle.sourceTexts).length > 0) {
              setSourceTexts(traceBundle.sourceTexts);
            }
            // Set trace metadata including rawEvents for TokenMovementsPanel
            setDecodedTraceMeta({
              sourceLines: traceBundle?.sourceLines ?? [],
              callMeta: traceBundle?.callMeta,
              rawEvents: traceBundle?.rawEvents ?? [],
              implementationToProxy: traceBundle?.implementationToProxy ?? new Map<string, string>(),
            });
            restoredFromVault = true;
          }
        } catch {
          // Fallback: restore decoded rows from IndexedDB on OPFS failure
          if (fullSim.decodedTraceRows && fullSim.decodedTraceRows.length > 0) {
            const fixedRows = recomputeHierarchy(fullSim.decodedTraceRows);
            setDecodedTraceRows(fixedRows);
            restoredFromVault = true;
          }
        }

        // Final fallback: restore legacy decoded rows from IndexedDB (should rarely hit this)
        if (!restoredFromVault && fullSim.decodedTraceRows && fullSim.decodedTraceRows.length > 0) {
          const fixedRows = recomputeHierarchy(fullSim.decodedTraceRows);
          setDecodedTraceRows(fixedRows);
        }

        // Set the simulation ID in context for consistency
        setSimulationId(sim.id);

        navigate(`/simulation/${sim.id}`);
      } else {
        // Fallback: just navigate, let the page try to load from storage
        navigate(`/simulation/${sim.id}`);
      }
    } catch {
      // Fallback: just navigate
      navigate(`/simulation/${sim.id}`);
    }
  }, [setSimulation, setDecodedTraceRows, setSimulationId, setSourceTexts, setDecodedTraceMeta, navigate]);

  // Handle clone simulation (re-simulate with same params)
  const handleCloneSimulation = useCallback(async (sim: StoredSimulation) => {
    // Clear current simulation and set contract context for builder
    clearSimulation();

    // Pass simulation ID via URL query parameter.
    // Avoids localStorage entirely since it can be full (QuotaExceededError).
    // The builder fetches full contractContext from IndexedDB using this ID.
    navigate(`/builder?clone=${encodeURIComponent(sim.id)}`);
  }, [clearSimulation, navigate]);

  // Handle delete simulation
  const handleDeleteSimulation = useCallback(async (id: string) => {
    try {
      await simulationHistoryService.deleteSimulation(id);
      setSimulations(prev => prev.filter(s => s.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      // Failed to delete
    }
  }, []);

  // Handle delete selected
  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    
    const confirmed = window.confirm(`Delete ${selectedIds.size} simulation(s)?`);
    if (!confirmed) return;
    
    try {
      await simulationHistoryService.deleteSimulations(Array.from(selectedIds));
      setSimulations(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } catch {
      // Failed to delete selected
    }
  }, [selectedIds]);

  // Handle clear all
  const handleClearAll = useCallback(async () => {
    const confirmed = window.confirm('Delete all simulations? This cannot be undone.');
    if (!confirmed) return;
    
    try {
      await simulationHistoryService.clearAll();
      setSimulations([]);
      setSelectedIds(new Set());
    } catch {
      // Failed to clear all
    }
  }, []);

  // Handle select all
  // Check if all items on current page are selected
  const allPageItemsSelected = useMemo(() => {
    if (paginatedSimulations.length === 0) return false;
    return paginatedSimulations.every(s => selectedIds.has(s.id));
  }, [paginatedSimulations, selectedIds]);

  const handleSelectAll = useCallback(() => {
    if (allPageItemsSelected) {
      // Deselect all items on current page
      setSelectedIds(prev => {
        const next = new Set(prev);
        paginatedSimulations.forEach(s => next.delete(s.id));
        return next;
      });
    } else {
      // Select all items on current page
      setSelectedIds(prev => {
        const next = new Set(prev);
        paginatedSimulations.forEach(s => next.add(s.id));
        return next;
      });
    }
  }, [allPageItemsSelected, paginatedSimulations]);

  // Handle toggle select
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Handle new simulation
  const handleNewSimulation = useCallback(() => {
    clearSimulation();
    navigate('/builder');
  }, [clearSimulation, navigate]);

  // Unique networks for filter dropdown
  const uniqueNetworks = React.useMemo(() => {
    const networks = new Map<number, string>();
    simulations.forEach(s => {
      if (!networks.has(s.networkId)) {
        networks.set(s.networkId, s.networkName);
      }
    });
    return Array.from(networks.entries());
  }, [simulations]);

  return (
    <div className="sim-history-page" style={{ padding: "20px", background: "#0a0a0a", minHeight: "100vh", color: "#fff" }}>
      <div className="tool-content-container">
        <h3 style={sectionTitleStyle}>Simulation History</h3>
        {/* Header */}
        <header className="sim-history-header">
          <div className="sim-history-title-section">
            <h1 className="sim-history-title">Simulator</h1>
            <span className="sim-history-count">
              {simulations.length} simulation{simulations.length !== 1 ? 's' : ''}
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

      {/* Toolbar */}
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
            className={`sim-history-btn sim-history-btn-ghost ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>
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

      {/* Filters */}
      {showFilters && (
        <div className="sim-history-filters">
          <div className="sim-history-filter-group">
            <label>Status</label>
            <Select
              value={filter.status || '__all__'}
              onValueChange={(v) => setFilter(prev => ({
                ...prev,
                status: v === '__all__' ? undefined : v as any
              }))}
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
            <label>Network</label>
            <Select
              value={filter.networkId ? String(filter.networkId) : '__all__'}
              onValueChange={(v) => setFilter(prev => ({
                ...prev,
                networkId: v === '__all__' ? undefined : Number(v)
              }))}
            >
              <SelectTrigger className="h-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Networks</SelectItem>
                {uniqueNetworks.map(([id, name]) => (
                  <SelectItem key={id} value={String(id)}>{name}</SelectItem>
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

      {/* Content */}
      {loading ? (
        <div className="sim-history-loading">
          <div className="sim-history-spinner" />
          Loading simulations…
        </div>
      ) : error ? (
        <div className="sim-history-error">
          <span className="sim-history-error-icon">⚠</span>
          {error}
          <Button type="button" variant="ghost" size="sm" onClick={loadSimulations}>
            Retry
          </Button>
        </div>
      ) : simulations.length === 0 ? (
        <div className="sim-history-empty">
          <div className="sim-history-empty-icon">--</div>
          <h2>No simulations yet</h2>
          <p>Run your first simulation to see it here</p>
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
        <div className="sim-history-table-container">
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
                <TableHead>Block</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="sim-history-th-actions">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedSimulations.map((sim) => (
                <TableRow
                  key={sim.id}
                  className={selectedIds.has(sim.id) ? 'selected' : ''}
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
                      {sim.id.length > 12 ? `${sim.id.slice(0, 8)}…` : sim.id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="sim-history-address" title={sim.from}>
                      {shortenAddress(sim.from)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="sim-history-to-cell">
                      <span className="sim-history-address" title={sim.to}>
                        {shortenAddress(sim.to)}
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
                      {sim.functionName || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <NetworkBadge networkId={sim.networkId} networkName={sim.networkName} />
                  </TableCell>
                  <TableCell className="sim-history-td-block">
                    {sim.blockNumber?.toLocaleString() || '—'}
                  </TableCell>
                  <TableCell className="sim-history-td-time">
                    <span title={new Date(sim.timestamp).toLocaleString()}>
                      {formattedTimestamps.get(sim.id) || formatTimestamp(sim.timestamp)}
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
                      style={{ background: 'none', border: 'none', boxShadow: 'none' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="icon-borderless"
                      size="icon-inline"
                      className="sim-history-action-btn"
                      onClick={() => handleCloneSimulation(sim)}
                      title="Clone & Re-simulate"
                      style={{ background: 'none', border: 'none', boxShadow: 'none' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="icon-borderless"
                      size="icon-inline"
                      className="sim-history-action-btn sim-history-action-btn-danger"
                      onClick={() => handleDeleteSimulation(sim.id)}
                      title="Delete"
                      style={{ background: 'none', border: 'none', boxShadow: 'none' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="sim-history-pagination">
              <div className="sim-history-pagination-info">
                Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, simulations.length)} of {simulations.length}
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
                  onValueChange={(v) => handlePageSizeChange(Number(v) as PageSize)}
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

export default SimulationHistoryPage;
