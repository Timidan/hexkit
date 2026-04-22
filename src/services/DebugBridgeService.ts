/**
 * Debug Bridge Service
 *
 * Service for communicating with the EDB debug bridge.
 * Protocol parsing and EDB type conversion live in ./debugBridgeProtocol.ts.
 */

import type {
  StartDebugSessionRequest,
  StartDebugSessionResponse,
  GetSnapshotRequest,
  GetSnapshotResponse,
  GetSnapshotBatchRequest,
  GetSnapshotBatchResponse,
  EvalExpressionRequest,
  EvalExpressionResponse,
  GetStorageDiffRequest,
  GetStorageDiffResponse,
  GetBreakpointHitsRequest,
  GetBreakpointHitsResponse,
  NavigateCallRequest,
  NavigateCallResponse,
  EndDebugSessionRequest,
  EndDebugSessionResponse,
  PrepareStatusResponse,
  DebugSnapshot,
  SnapshotListItem,
  StorageDiffEntry,
  StorageLayoutResponse,
  TraceEntry,
  OpcodeSnapshotDetail,
  HookSnapshotDetail,
} from '../types/debug';
import { networkConfigManager } from '../config/networkConfig';
import { getSimulatorBridgeUrl, getBridgeHeaders } from '../utils/env';
import { extractInlineArtifacts } from '../utils/debugArtifacts';
import { setLimitedCacheEntry } from '../utils/cache/limitedCache';
import {
  transformEdbSnapshot,
  toSolValue,
  artifactsNeedTraceDetailHydration,
} from './debugBridgeProtocol';

// Bridge URL - derived from env config with fallback
const getBridgeUrl = () => getSimulatorBridgeUrl() || '/api/edb';

const STORAGE_CACHE_MAX_ENTRIES = 5000;
const DEBUG_SESSION_START_TIMEOUT_MS = 90_000;

interface StartSessionOptions {
  includeTrace?: boolean;
  preferDebugStart?: boolean;
}

type StorageTouchedResult = Record<string, Array<{
  slot: string;
  reads: Array<{ snapshotId: number; value: string }>;
  writes: Array<{ snapshotId: number; before: string; after: string }>;
}>>;

type StorageProofResult = {
  storageProof: Array<{ key: string; value: string; proof: string[] }>;
};

type StorageRangeAtResult = {
  storage: Record<string, { key: string; value: string }>;
  nextKey: string | null;
};

type SerializedBreakpoint =
  | {
      loc: {
        Opcode: {
          bytecode_address: string;
          pc: number;
        };
      };
      condition: string | null;
    }
  | {
      loc: {
        Source: {
          bytecode_address: string;
          file_path: string;
          line_number: number;
        };
      };
      condition: string | null;
    };

function buildDebugAnalysisOptions(chainId: number): Record<string, unknown> {
  const etherscanApiKey = networkConfigManager.getEtherscanApiKey(chainId);

  return {
    quickMode: false,
    collectCallTree: true,
    collectEvents: true,
    collectStorageDiff: true,
    collectStorageDiffs: true,
    collectSnapshots: true,
    artifactSourcePriority: networkConfigManager.getSourcePriority(),
    ...(etherscanApiKey ? { etherscanApiKey } : {}),
  };
}

function serializeBreakpoint(breakpoint: GetBreakpointHitsRequest['breakpoints'][number]): SerializedBreakpoint {
  const condition = breakpoint.condition ?? null;
  if (breakpoint.location.type === 'opcode') {
    return {
      loc: {
        Opcode: {
          bytecode_address: breakpoint.location.bytecodeAddress,
          pc: breakpoint.location.pc,
        },
      },
      condition,
    };
  }

  return {
    loc: {
      Source: {
        bytecode_address: breakpoint.location.bytecodeAddress,
        file_path: breakpoint.location.filePath,
        line_number: breakpoint.location.lineNumber,
      },
    },
    condition,
  };
}

class DebugBridgeService {
  private storageValueCache = new Map<string, string>();

  private putStorageCache(cacheKey: string, value: string): void {
    setLimitedCacheEntry(this.storageValueCache, cacheKey, value, STORAGE_CACHE_MAX_ENTRIES);
  }

  private clearStorageCacheForSession(sessionId: string): void {
    if (!sessionId || this.storageValueCache.size === 0) return;
    const prefix = `${sessionId}:`;
    for (const key of this.storageValueCache.keys()) {
      if (key.startsWith(prefix)) {
        this.storageValueCache.delete(key);
      }
    }
  }

  /**
   * Make a raw RPC call to the debug session
   */
  private async rpcCall(sessionId: string, method: string, params: unknown[] = []): Promise<unknown> {
    const response = await fetch(`${getBridgeUrl()}/debug/rpc`, {
      method: 'POST',
      headers: getBridgeHeaders(),
      body: JSON.stringify({ sessionId, method, params }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`RPC call failed: ${errorText}`);
    }

    const data = await response.json();

    // Check for RPC-level errors
    if (data.error) {
      const errorMsg = typeof data.error === 'string'
        ? data.error
        : data.error.message || JSON.stringify(data.error);
      throw new Error(`RPC error: ${errorMsg}`);
    }

    return data.result;
  }

  private async loadArtifactsFromTraceDetail(
    traceDetailHandleId?: string
  ): Promise<Record<string, unknown> | null> {
    if (!traceDetailHandleId) return null;

    try {
      const response = await fetch(`${getBridgeUrl()}/trace/detail`, {
        method: 'POST',
        headers: getBridgeHeaders(),
        body: JSON.stringify({ id: traceDetailHandleId }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return null;

      const data = await response.json().catch(() => null);
      if (!data || typeof data !== 'object') return null;

      const rawTrace = (data as { rawTrace?: unknown }).rawTrace ?? data;
      return extractInlineArtifacts(rawTrace);
    } catch {
      return null;
    }
  }

  private async sessionHasHookSnapshots(sessionId: string, snapshotCount: number): Promise<boolean> {
    if (!sessionId || snapshotCount <= 0) return false;

    const sampleIds = new Set<number>();
    const sampleCount = Math.min(64, snapshotCount);
    const denominator = Math.max(1, sampleCount - 1);

    for (let i = 0; i < sampleCount; i += 1) {
      sampleIds.add(Math.floor(((snapshotCount - 1) * i) / denominator));
    }

    for (const snapshotId of sampleIds) {
      try {
        const rawSnapshot = await this.rpcCall(sessionId, 'edb_getSnapshotInfo', [snapshotId]);
        const snapshot = transformEdbSnapshot(rawSnapshot);
        if (snapshot.type === 'hook') {
          return true;
        }
      } catch {
        // Ignore sampling errors and continue probing.
      }
    }

    return false;
  }

  /**
   * Start a new debug session
   */
  async startSession(
    request: StartDebugSessionRequest,
    options: StartSessionOptions = {}
  ): Promise<StartDebugSessionResponse> {
    const includeTrace = options.includeTrace !== false;
    const preferDebugStart = options.preferDebugStart !== false;

    const bridgeRequest = {
      rpcUrl: request.rpcUrl,
      chainId: request.chainId,
      blockTag: request.blockTag || 'latest',
      transaction: request.transaction,
      ...(request.txHash ? { txHash: request.txHash, mode: 'onchain' as const } : {}),
      analysisOptions: buildDebugAnalysisOptions(request.chainId),
    };

    let artifactsInline =
      request.artifacts && !Array.isArray(request.artifacts)
        ? (request.artifacts as Record<string, unknown>)
        : null;
    const artifactsList = Array.isArray(request.artifacts) ? request.artifacts : null;

    if (!artifactsList && request.traceDetailHandleId && artifactsNeedTraceDetailHydration(artifactsInline)) {
      const traceDetailArtifacts = await this.loadArtifactsFromTraceDetail(request.traceDetailHandleId);
      if (traceDetailArtifacts) {
        artifactsInline = artifactsInline
          ? { ...artifactsInline, ...traceDetailArtifacts }
          : traceDetailArtifacts;
      }
    }

    let sessionId: string | null = null;
    let snapshotCount = 0;
    let sourceFiles: Record<string, string> = {};
    let debugStartFailure: string | null = null;
    let simulateFailure: string | null = null;

    const clip = (value: string): string =>
      value.length > 400 ? `${value.slice(0, 397)}...` : value;

    const parseErrorText = async (response: Response): Promise<string> => {
      const bodyText = await response.text().catch(() => '');
      if (!bodyText) return response.statusText || 'Unknown error';
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed?.error && typeof parsed.error === 'string') {
          const details =
            parsed?.details && typeof parsed.details === 'string' ? ` (${parsed.details})` : '';
          return clip(`${parsed.error}${details}`);
        }
      } catch {
        // Fall through to raw text when body is not JSON.
      }
      return clip(bodyText);
    };

    const startFromDebugEndpoint = async (): Promise<boolean> => {
      try {
        const response = await fetch(`${getBridgeUrl()}/debug/start`, {
          method: 'POST',
          headers: getBridgeHeaders(),
          body: JSON.stringify({
            ...bridgeRequest,
            ...(artifactsInline ? { artifacts_inline: artifactsInline } : {}),
            ...(artifactsList ? { artifacts: artifactsList } : {}),
          }),
          signal: AbortSignal.timeout(DEBUG_SESSION_START_TIMEOUT_MS),
        });

        if (!response.ok) {
          const reason = await parseErrorText(response);
          debugStartFailure = `/debug/start ${response.status}: ${reason}`;
          return false;
        }

        const data = await response.json();
        if (!data?.sessionId) {
          debugStartFailure = '/debug/start returned no sessionId';
          return false;
        }

        sessionId = data.sessionId;
        snapshotCount = data.snapshotCount || 0;
        sourceFiles = data.sourceFiles || {};

        if (!sessionId) return false;

        const hasHookSnapshots = await this.sessionHasHookSnapshots(sessionId, snapshotCount);
        if (!hasHookSnapshots) {
          debugStartFailure = '/debug/start session has no hook snapshots';
          try {
            await this.endSession({ sessionId });
          } catch {
            // Ignore cleanup failures and let caller continue with fallback strategy.
          }
          sessionId = null;
          snapshotCount = 0;
          sourceFiles = {};
          return false;
        }

        return true;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        debugStartFailure = `/debug/start request failed: ${clip(reason)}`;
        return false;
      }
    };

    const startFromSimulate = async (): Promise<boolean> => {
      try {
        const simResponse = await fetch(`${getBridgeUrl()}/simulate`, {
          method: 'POST',
          headers: getBridgeHeaders(),
          body: JSON.stringify({
            mode: 'local',
            ...bridgeRequest,
            enableDebug: true,
            analysisOptions: buildDebugAnalysisOptions(request.chainId),
            ...(artifactsInline ? { artifacts_inline: artifactsInline } : {}),
            ...(artifactsList ? { artifacts: artifactsList } : {}),
          }),
          signal: AbortSignal.timeout(DEBUG_SESSION_START_TIMEOUT_MS),
        });

        if (!simResponse.ok) {
          const reason = await parseErrorText(simResponse);
          simulateFailure = `/simulate ${simResponse.status}: ${reason}`;
          return false;
        }

        const simData = await simResponse.json();
        if (!simData?.debugSession?.sessionId) {
          const simError =
            typeof simData?.error === 'string'
              ? simData.error
              : 'simulate response did not include debugSession';
          simulateFailure = `/simulate did not produce debug session: ${clip(simError)}`;
          return false;
        }

        sessionId = simData.debugSession.sessionId;
        snapshotCount = simData.debugSession.snapshotCount || 0;
        sourceFiles = simData.sourceFiles || {};

        if (!sessionId) return false;

        // Verify the /simulate session has hook snapshots (same as /debug/start path)
        const hasHookSnapshots = await this.sessionHasHookSnapshots(sessionId, snapshotCount);
        if (!hasHookSnapshots) {
          simulateFailure = '/simulate session has no hook snapshots';
          try {
            await this.endSession({ sessionId });
          } catch {
            // Ignore cleanup failures
          }
          sessionId = null;
          snapshotCount = 0;
          sourceFiles = {};
          return false;
        }
        return true;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        simulateFailure = `/simulate request failed: ${clip(reason)}`;
        return false;
      }
    };

    const started = preferDebugStart
      ? ((await startFromDebugEndpoint()) || (await startFromSimulate()))
      : ((await startFromSimulate()) || (await startFromDebugEndpoint()));

    if (!started || !sessionId) {
      const failureParts: string[] = [];
      if (debugStartFailure) failureParts.push(debugStartFailure);
      if (simulateFailure) failureParts.push(simulateFailure);
      const failureDetails = failureParts.join(' | ');
      throw new Error(
        'Failed to start debug session: could not establish a session with source-level snapshots via either path. ' +
        'Check that the EDB bridge is running and the contract has available source code.' +
        (failureDetails ? ` Details: ${failureDetails}` : '')
      );
    }

    let trace: { entries?: TraceEntry[]; rootId?: number } | null = null;
    let resolvedSnapshotCount = snapshotCount;
    if (includeTrace) {
      const [traceResult, snapshotCountResult] = await Promise.all([
        this.rpcCall(sessionId, 'edb_getTrace', []),
        this.rpcCall(sessionId, 'edb_getSnapshotCount', []),
      ]);

      trace = traceResult as { entries?: TraceEntry[]; rootId?: number } | null;
      resolvedSnapshotCount = (snapshotCountResult as number) || snapshotCount || 0;
    } else if (!resolvedSnapshotCount) {
      try {
        const snapshotCountResult = await this.rpcCall(sessionId, 'edb_getSnapshotCount', []);
        resolvedSnapshotCount = (snapshotCountResult as number) || 0;
      } catch {
        resolvedSnapshotCount = snapshotCount;
      }
    }

    return {
      sessionId,
      snapshotCount: resolvedSnapshotCount || 0,
      sourceFiles,
      trace: {
        entries: trace?.entries || [],
        rootId: trace?.rootId ?? 0,
      },
    };
  }

  /**
   * Get a single snapshot by ID
   */
  async getSnapshot(request: GetSnapshotRequest): Promise<GetSnapshotResponse> {
    const result = await this.rpcCall(request.sessionId, 'edb_getSnapshotInfo', [request.snapshotId]);
    const snapshot = transformEdbSnapshot(result);
    return { snapshot };
  }

  /**
   * Get a batch of snapshots for list display
   */
  async getSnapshotBatch(request: GetSnapshotBatchRequest): Promise<GetSnapshotBatchResponse> {
    // Fetch individual snapshots with bounded concurrency to avoid request storms
    const snapshotIds = Array.from({ length: request.count }, (_, i) => request.startId + i);
    const CONCURRENCY = 25;
    const allResults: PromiseSettledResult<{ id: number; value: unknown }>[] = [];
    for (let i = 0; i < snapshotIds.length; i += CONCURRENCY) {
      const slice = snapshotIds.slice(i, i + CONCURRENCY);
      const sliceResults = await Promise.allSettled(
        slice.map((id) =>
          this.rpcCall(request.sessionId, 'edb_getSnapshotInfo', [id]).then((value) => ({ id, value })),
        ),
      );
      allResults.push(...sliceResults);
    }

    const snapshots: SnapshotListItem[] = allResults
      .filter(
        (r): r is PromiseFulfilledResult<{ id: number; value: unknown }> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => {
        const { id: snapshotId, value } = r.value;
        // Transform the raw EDB response
        const snap = transformEdbSnapshot(value);
        const detail = snap.detail;

        if (snap.type === 'opcode') {
          const opcodeDetail = detail as OpcodeSnapshotDetail;
          return {
            id: snapshotId,
            frameId: snap.frameId,
            type: 'opcode' as const,
            pc: opcodeDetail.pc,
            opcodeName: opcodeDetail.opcodeName,
            gasRemaining: opcodeDetail.gasRemaining,
          };
        } else {
          const hookDetail = detail as HookSnapshotDetail;
          return {
            id: snapshotId,
            frameId: snap.frameId,
            type: 'hook' as const,
            filePath: hookDetail.filePath,
            line: hookDetail.line,
            functionName: hookDetail.functionName,
          };
        }
      });

    // Check if there are more snapshots
    const totalCount = await this.rpcCall(request.sessionId, 'edb_getSnapshotCount', []);
    const hasMore = request.startId + request.count < (totalCount as number);

    return { snapshots, hasMore };
  }

  /**
   * Evaluate an expression at a snapshot
   */
  async evaluateExpression(request: EvalExpressionRequest): Promise<EvalExpressionResponse> {
    try {
      const result = await this.rpcCall(request.sessionId, 'edb_evalOnSnapshot', [
        request.snapshotId,
        request.expression,
      ]);

      // EDB returns a Rust Result type: {"Ok": value} or {"Err": "message"}
      const resultObj = result as { Ok?: unknown; Err?: string };

      if (Object.prototype.hasOwnProperty.call(resultObj, 'Ok')) {
        return {
          result: {
            success: true,
            value: toSolValue(resultObj.Ok),
          },
        };
      } else if (Object.prototype.hasOwnProperty.call(resultObj, 'Err')) {
        return {
          result: {
            success: false,
            error: resultObj.Err,
          },
        };
      }

      // Unexpected response shape -- report as error rather than silently succeeding
      return {
        result: {
          success: false,
          error: `Unexpected eval response shape: ${JSON.stringify(result).slice(0, 200)}`,
        },
      };
    } catch (err) {
      return {
        result: {
          success: false,
          error: err instanceof Error ? err.message : 'Evaluation failed',
        },
      };
    }
  }

  /**
   * Get storage diffs at a snapshot
   */
  async getStorageDiff(request: GetStorageDiffRequest): Promise<GetStorageDiffResponse> {
    const result = await this.rpcCall(request.sessionId, 'edb_getStorageDiff', [request.snapshotId]);
    return { diffs: (result as StorageDiffEntry[]) || [] };
  }

  /**
   * Get storage layout for a contract address
   * Returns slot positions, offsets, and type definitions for state variables including struct fields
   */
  async getStorageLayout(
    sessionId: string,
    address: string,
    contractName?: string,
  ): Promise<StorageLayoutResponse | null> {
    try {
      const params = contractName ? [address, contractName] : [address];
      const result = await this.rpcCall(sessionId, 'edb_getStorageLayout', params);
      return result as StorageLayoutResponse;
    } catch {
      return null;
    }
  }

  /**
   * Read a storage slot value at a specific snapshot
   */
  async getStorage(
    sessionId: string,
    snapshotId: number,
    slot: string | bigint,
  ): Promise<string | null> {
    try {
      const slotHex = (typeof slot === 'bigint' ? `0x${slot.toString(16)}` : slot).toLowerCase();
      const cacheKey = `${sessionId}:${snapshotId}:${slotHex}`;
      const cached = this.storageValueCache.get(cacheKey);
      if (cached) {
        this.storageValueCache.delete(cacheKey);
        this.storageValueCache.set(cacheKey, cached);
        return cached;
      }
      const result = await this.rpcCall(sessionId, 'edb_getStorage', [snapshotId, slotHex]);

      if (!result || typeof result !== 'string') {
        return null;
      }

      let hex = result.startsWith('0x') ? result.slice(2) : result;
      hex = hex.padStart(64, '0');
      const normalized = `0x${hex}`;
      this.putStorageCache(cacheKey, normalized);
      return normalized;
    } catch (err) {
      console.error(`[DebugBridgeService.getStorage] Error reading slot:`, err);
      return null;
    }
  }

  /** Get all SLOAD/SSTORE-touched storage slots across the entire execution trace. */
  async getStorageTouched(sessionId: string, address?: string): Promise<StorageTouchedResult | null> {
    try {
      const params = address ? [address] : [];
      const result = await this.rpcCall(sessionId, 'edb_getStorageTouched', params);
      return result as StorageTouchedResult;
    } catch (err) {
      console.error('[getStorageTouched] Error:', err);
      return null;
    }
  }

  /**
   * Batch read all cached storage slots for an address at end of execution.
   */
  async getStorageRange(
    sessionId: string,
    address: string,
  ): Promise<Record<string, string> | null> {
    try {
      const result = await this.rpcCall(sessionId, 'edb_getStorageRange', [address]);
      return result as Record<string, string>;
    } catch (err) {
      console.error('[getStorageRange] Error:', err);
      return null;
    }
  }

  /** Read storage directly from blockchain RPC (bypasses EDB snapshots). */
  async getStorageFromRpc(
    rpcUrl: string, address: string, slot: string | bigint, blockTag: string | number = 'latest',
  ): Promise<string | null> {
    try {
      const slotHex = typeof slot === 'bigint'
        ? '0x' + slot.toString(16).padStart(64, '0')
        : slot.startsWith('0x') ? slot : '0x' + slot;
      const blockHex = typeof blockTag === 'number' ? '0x' + blockTag.toString(16) : blockTag;
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getStorageAt', params: [address, slotHex, blockHex], id: 1 }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data.error) return null;
      const result = data.result as string;
      if (!result) return null;
      let hex = result.startsWith('0x') ? result.slice(2) : result;
      hex = hex.padStart(64, '0');
      return '0x' + hex;
    } catch {
      return null;
    }
  }

  /**
   * Get breakpoint hits
   */
  async getBreakpointHits(request: GetBreakpointHitsRequest): Promise<GetBreakpointHitsResponse> {
    const enabledBreakpoints = request.breakpoints
      .filter((breakpoint) => !!breakpoint.location)
      .map(serializeBreakpoint);

    if (enabledBreakpoints.length === 0) {
      return { hits: [] };
    }

    const results = await Promise.all(
      enabledBreakpoints.map((breakpoint) =>
        this.rpcCall(request.sessionId, 'edb_getBreakpointHits', [breakpoint])
          .then((result) => (Array.isArray(result) ? result : []))
          .catch(() => [])
      )
    );

    const hits = Array.from(new Set(results.flat().filter((id): id is number => Number.isInteger(id))))
      .sort((a, b) => a - b);

    return { hits };
  }

  /**
   * Navigate to next/prev call
   */
  async navigateCall(request: NavigateCallRequest): Promise<NavigateCallResponse> {
    const method = request.direction === 'next' ? 'edb_getNextCall' : 'edb_getPrevCall';
    const result = await this.rpcCall(request.sessionId, method, [request.snapshotId]);
    return { snapshotId: (result as number | null) ?? null };
  }

  /**
   * End a debug session
   */
  async endSession(request: EndDebugSessionRequest): Promise<EndDebugSessionResponse> {
    const response = await fetch(`${getBridgeUrl()}/debug/end`, {
      method: 'POST',
      headers: getBridgeHeaders(),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to end session: ${response.statusText}`);
    }

    this.clearStorageCacheForSession(request.sessionId);
    return response.json();
  }

  /** Generic RPC call to any Ethereum JSON-RPC endpoint. */
  async callRpcMethod(rpcUrl: string, method: string, params: unknown[] = []): Promise<unknown> {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`RPC request failed: ${response.statusText}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.result;
  }

  /** Get storage proof via eth_getProof for selected storage keys. */
  async getStorageProofFromRpc(
    rpcUrl: string, address: string, storageKeys: string[], blockTag: string | number = 'latest',
  ): Promise<StorageProofResult | null> {
    try {
      const blockHex = typeof blockTag === 'number' ? '0x' + blockTag.toString(16) : blockTag;
      const result = await this.callRpcMethod(rpcUrl, 'eth_getProof', [address, storageKeys, blockHex]);
      return result as StorageProofResult;
    } catch (err) {
      console.error('[getStorageProofFromRpc] Error:', err);
      return null;
    }
  }

  /** Page through storage via debug_storageRangeAt (Geth-compatible nodes only). */
  async getStorageRangeAtFromRpc(
    rpcUrl: string, blockHash: string, txIndex: number,
    address: string, keyStart: string, maxResult: number,
  ): Promise<StorageRangeAtResult | null> {
    try {
      const result = await this.callRpcMethod(rpcUrl, 'debug_storageRangeAt', [
        blockHash, txIndex, address, keyStart, maxResult,
      ]);
      return result as StorageRangeAtResult;
    } catch (err) {
      console.error('[getStorageRangeAtFromRpc] Error:', err);
      return null;
    }
  }

  /**
   * Get source code for a contract address
   */
  async getSourceCode(
    sessionId: string,
    address: string,
  ): Promise<{ sources: Record<string, string>; abi?: unknown[] }> {
    if (!address || !address.startsWith('0x') || address.length !== 42) {
      return { sources: {} };
    }
    try {
      const result = await this.rpcCall(sessionId, 'edb_getArtifactByAddress', [address]);
      const artifact = result as {
        input?: { sources?: Record<string, { content?: string }> };
        output?: { abi?: unknown[] };
      };
      const sources: Record<string, string> = {};
      const inputSources = artifact?.input?.sources || {};
      for (const [path, source] of Object.entries(inputSources)) {
        if (source && typeof source.content === 'string') {
          sources[path] = source.content;
        }
      }
      return {
        sources,
        abi: artifact?.output?.abi,
      };
    } catch {
      return { sources: {} };
    }
  }

  /**
   * Get the call trace for the transaction
   */
  async getTrace(sessionId: string): Promise<{ entries: TraceEntry[]; rootId: number }> {
    try {
      const result = await this.rpcCall(sessionId, 'edb_getTrace', []);
      const trace = result as { inner?: TraceEntry[]; entries?: TraceEntry[]; rootId?: number };
      const entries = trace.entries || trace.inner || [];
      const rootId =
        trace.rootId ??
        entries.find((entry) => (entry as any).parentId == null && (entry as any).parent_id == null)
          ?.id ??
        0;
      return { entries, rootId };
    } catch {
      return { entries: [], rootId: 0 };
    }
  }

  /**
   * Get snapshot count for a session
   */
  async getSnapshotCount(sessionId: string): Promise<number> {
    try {
      const result = await this.rpcCall(sessionId, 'edb_getSnapshotCount', []);
      return (result as number) || 0;
    } catch {
      return 0;
    }
  }

  // ===========================================================================
  // Async Debug Preparation
  // ===========================================================================

  /** Start async debug preparation. */
  async prepareDebug(params: {
    rpcUrl: string; chainId: number; blockTag?: string;
    transaction?: Record<string, unknown>; txHash?: string;
    artifacts?: unknown[]; artifacts_inline?: Record<string, unknown>;
  }): Promise<{ prepareId: string }> {
    const response = await fetch(`${getBridgeUrl()}/debug/prepare`, {
      method: 'POST',
      headers: getBridgeHeaders(),
      body: JSON.stringify({
        ...params,
        analysisOptions: buildDebugAnalysisOptions(params.chainId),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Failed to start debug preparation: ${response.status}`);
    }
    return response.json();
  }

  /** Connect to SSE stream for debug preparation progress. */
  connectPrepareEvents(prepareId: string): EventSource {
    return new EventSource(`${getBridgeUrl()}/debug/prepare/${prepareId}/events`);
  }

  /** Poll debug preparation status (fallback when SSE is unavailable). */
  async getPrepareStatus(prepareId: string): Promise<PrepareStatusResponse> {
    const response = await fetch(`${getBridgeUrl()}/debug/prepare/${prepareId}`, {
      headers: getBridgeHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Failed to get prepare status: ${response.status}`);
    }
    return response.json();
  }
}

// Export singleton instance
export const debugBridgeService = new DebugBridgeService();
export default debugBridgeService;
