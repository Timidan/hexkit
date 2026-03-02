/**
 * RPC Log Scanner — resilient eth_getLogs fetcher with adaptive block chunking.
 *
 * SLO targets:
 *   - First discovered mapping key visible: <3s for last 20k blocks on healthy RPC.
 *   - No main-thread stalls > 50ms during discovery.
 *
 * Features:
 *   - Adaptive block window sizing (start 2k, shrink on errors, grow on fast/sparse).
 *   - Bounded concurrency (2–4 in-flight calls max).
 *   - Exponential backoff with jitter on 429/5xx.
 *   - Dedup log processing by (txHash, logIndex).
 *   - Cancellation via AbortController.
 *   - Incremental callback commits every N logs.
 */

import type { ethers } from 'ethers';

// ─── Types ───────────────────────────────────────────────────────────

export interface LogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface ScanRange {
  fromBlock: number;
  toBlock: number;
}

export interface ScanProgress {
  scannedBlocks: number;
  totalBlocks: number;
  logsFound: number;
  currentChunkSize: number;
  phase: 'scanning' | 'done' | 'error';
}

export interface RpcLogScannerOptions {
  provider: ethers.providers.JsonRpcProvider;
  contractAddress: string;
  topics: (string | string[] | null)[];
  fromBlock: number;
  toBlock: number;
  signal: AbortSignal;
  /** Called with each batch of new logs (incremental commits) */
  onLogs: (logs: LogEntry[]) => void;
  /** Called with progress updates */
  onProgress?: (progress: ScanProgress) => void;
  /** Initial block chunk size (default 2000) */
  initialChunkSize?: number;
  /** Max concurrent in-flight requests (default 3) */
  maxConcurrency?: number;
  /** Max logs per incremental commit (default 50) */
  commitBatchSize?: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 2000;
const MIN_CHUNK_SIZE = 10;
const MAX_CHUNK_SIZE = 10000;
const DEFAULT_MAX_CONCURRENCY = 2;
const DEFAULT_COMMIT_BATCH = 50;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 500;

// ─── Scanner ─────────────────────────────────────────────────────────

export async function scanLogs(opts: RpcLogScannerOptions): Promise<void> {
  const {
    provider,
    contractAddress,
    topics,
    fromBlock,
    toBlock,
    signal,
    onLogs,
    onProgress,
    initialChunkSize = DEFAULT_CHUNK_SIZE,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    commitBatchSize = DEFAULT_COMMIT_BATCH,
  } = opts;

  if (fromBlock > toBlock) return;

  const seen = new Set<string>();
  let chunkSize = initialChunkSize;
  let totalLogsFound = 0;
  let scannedBlocks = 0;
  const totalBlocks = toBlock - fromBlock + 1;

  // Dynamic cursor: workers grab the next range using current chunkSize
  let cursor = fromBlock;

  async function processChunk(range: ScanRange, depth = 0): Promise<LogEntry[]> {
    if (signal.aborted) return [];

    const MAX_SUBDIVIDE_DEPTH = 6;
    let retries = 0;

    while (retries <= MAX_RETRIES) {
      if (signal.aborted) return [];

      try {
        const t0 = performance.now();

        const rawLogs = await provider.getLogs({
          address: contractAddress,
          topics,
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        });

        // Adaptive chunk sizing based on response characteristics
        const elapsed = performance.now() - t0;
        if (elapsed < 500 && rawLogs.length < 100) {
          chunkSize = Math.min(chunkSize * 2, MAX_CHUNK_SIZE);
        } else if (elapsed > 3000 || rawLogs.length > 500) {
          chunkSize = Math.max(Math.floor(chunkSize / 2), MIN_CHUNK_SIZE);
        }

        // Deduplicate
        const entries: LogEntry[] = [];
        for (const log of rawLogs) {
          const key = `${log.transactionHash}:${log.logIndex}`;
          if (seen.has(key)) continue;
          seen.add(key);
          entries.push({
            address: log.address,
            topics: log.topics,
            data: log.data,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
          });
        }

        return entries;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        const isRateLimit =
          msg.includes('429') ||
          msg.includes('rate') ||
          msg.includes('too many') ||
          msg.includes('limit');
        const isResponseSizeExceeded =
          msg.includes('exceeded') ||
          msg.includes('query returned more than') ||
          msg.includes('response size') ||
          msg.includes('too large') ||
          msg.includes('10000 results');
        const isServerError = /\b50[0-9]\b/.test(msg);

        // Response size exceeded: SUBDIVIDE the range instead of retrying same range
        if (isResponseSizeExceeded && depth < MAX_SUBDIVIDE_DEPTH) {
          const span = range.toBlock - range.fromBlock;
          if (span <= 0) return [];

          // Shrink future chunk sizes aggressively
          chunkSize = Math.max(Math.floor(span / 4), MIN_CHUNK_SIZE);

          const mid = range.fromBlock + Math.floor(span / 2);
          const leftEntries = await processChunk(
            { fromBlock: range.fromBlock, toBlock: mid },
            depth + 1,
          );
          if (signal.aborted) return leftEntries;
          const rightEntries = await processChunk(
            { fromBlock: mid + 1, toBlock: range.toBlock },
            depth + 1,
          );
          return [...leftEntries, ...rightEntries];
        }

        // Rate limit / server errors: backoff and retry same range
        if ((isRateLimit || isServerError) && retries < MAX_RETRIES) {
          chunkSize = Math.max(Math.floor(chunkSize / 2), MIN_CHUNK_SIZE);
          const delay = BASE_BACKOFF_MS * Math.pow(2, retries) + Math.random() * 200;
          await new Promise((resolve) => setTimeout(resolve, delay));
          retries++;
          continue;
        }

        // Generic errors: retry a few times then give up
        if (retries < MAX_RETRIES) {
          chunkSize = Math.max(Math.floor(chunkSize / 2), MIN_CHUNK_SIZE);
          retries++;
          continue;
        }

        return [];
      }
    }
    return [];
  }

  // Bounded concurrency executor
  const pendingBuffer: LogEntry[] = [];

  function flushBuffer() {
    if (pendingBuffer.length === 0) return;
    // Send in bounded batches to avoid overwhelming consumers
    while (pendingBuffer.length > 0) {
      const batch = pendingBuffer.splice(0, commitBatchSize);
      onLogs(batch);
      if (signal.aborted) break;
    }
  }

  const workers: Promise<void>[] = [];

  async function worker() {
    while (cursor <= toBlock) {
      if (signal.aborted) return;

      // Atomically claim a range using the current (adapted) chunkSize
      const rangeStart = cursor;
      if (rangeStart > toBlock) return;
      const rangeEnd = Math.min(rangeStart + chunkSize - 1, toBlock);
      cursor = rangeEnd + 1;

      const range: ScanRange = { fromBlock: rangeStart, toBlock: rangeEnd };
      const entries = await processChunk(range);

      if (signal.aborted) return;

      totalLogsFound += entries.length;
      scannedBlocks += range.toBlock - range.fromBlock + 1;

      // Buffer logs and commit incrementally
      pendingBuffer.push(...entries);
      if (pendingBuffer.length >= commitBatchSize) {
        flushBuffer();
      }

      onProgress?.({
        scannedBlocks,
        totalBlocks,
        logsFound: totalLogsFound,
        currentChunkSize: chunkSize,
        phase: 'scanning',
      });

      // Yield to main thread to prevent UI stalls (SLO: <50ms stall)
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  for (let i = 0; i < maxConcurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  // Flush remaining
  flushBuffer();

  if (!signal.aborted) {
    onProgress?.({
      scannedBlocks: totalBlocks,
      totalBlocks,
      logsFound: totalLogsFound,
      currentChunkSize: chunkSize,
      phase: 'done',
    });
  }
}
