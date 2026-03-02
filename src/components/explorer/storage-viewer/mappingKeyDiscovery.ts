/**
 * Mapping Key Discovery Engine — event-driven auto-discovery of mapping keys.
 *
 * Scans `eth_getLogs` for canonical events (ERC20 Approval, ERC721 ApprovalForAll,
 * Transfer, etc.) and derives mapping slot keys from indexed args, then confirms
 * with `eth_getStorageAt`.
 *
 * SLO targets:
 *   - First slot table paint after fetch: <1.5s on warm cache.
 *   - First discovered mapping key visible: <3s for last 20k blocks on healthy RPC.
 *   - No main-thread stalls > 50ms during discovery.
 *
 * Zero dependency on EDB debug sessions — works with standard RPC only.
 */

import { ethers } from 'ethers';
import type { StorageLayoutResponse } from '../../../types/debug';
import type { MappingEntry } from './useSlotResolution';
import { computeMappingSlot, computeNestedMappingSlot, formatSlotHex } from '../../../utils/storageSlotCalculator';
import { scanLogs, type LogEntry, type ScanProgress } from './rpcLogScanner';

// ─── Types ───────────────────────────────────────────────────────────

export interface DiscoveredKey {
  key: string;
  keyType: string;
  derivedSlot: string;
  value: string | null;
  variable: string;
  baseSlot: string;
  /** Optional second-level key for nested mappings */
  nestedKey?: string;
  nestedKeyType?: string;
}

export interface DiscoveryResult {
  /** baseSlot (lowercase hex) -> discovered keys */
  keys: Map<string, DiscoveredKey[]>;
  /** Total logs processed */
  logsProcessed: number;
  /** Last block scanned */
  lastScannedBlock: number;
  /** Timing info */
  durationMs: number;
}

export interface DiscoveryProgress {
  phase: 'init' | 'scanning' | 'verifying' | 'done' | 'error';
  scannedBlocks: number;
  totalBlocks: number;
  keysFound: number;
  message?: string;
}

export interface DiscoveryOptions {
  chainId: number;
  contractAddress: string;
  layout: StorageLayoutResponse;
  mappingEntries: MappingEntry[];
  abi?: ethers.utils.Fragment[];
  fromBlock: number;
  toBlock: number;
  provider: ethers.providers.JsonRpcProvider;
  signal: AbortSignal;
  onProgress?: (progress: DiscoveryProgress) => void;
  onKeys?: (keys: Map<string, DiscoveredKey[]>) => void;
  /** Hard cap on total logs processed before aborting scan (prevents OOM on busy contracts) */
  maxLogs?: number;
}

/** Default max logs — prevents browser OOM for contracts like USDT.
 *  With subdivision in rpcLogScanner, this is a hard cap on total logs processed. */
const DEFAULT_MAX_LOGS = 5_000;

/** Max unique candidate keys to verify (prevents excessive RPC calls) */
const MAX_CANDIDATES = 500;

/** Concurrent verification batch size */
const VERIFY_CONCURRENCY = 8;

// ─── Canonical Event Signatures ──────────────────────────────────────

/** Well-known event topic hashes for key extraction */
const CANONICAL_EVENTS = {
  // ERC20
  Transfer: ethers.utils.id('Transfer(address,address,uint256)'),
  Approval: ethers.utils.id('Approval(address,address,uint256)'),
  // ERC721
  ApprovalForAll: ethers.utils.id('ApprovalForAll(address,address,bool)'),
  // ERC721 Transfer is same topic as ERC20 Transfer
  // ERC1155
  TransferSingle: ethers.utils.id('TransferSingle(address,address,address,uint256,uint256)'),
  TransferBatch: ethers.utils.id('TransferBatch(address,address,address,uint256[],uint256[])'),
  // Common DeFi
  Deposit: ethers.utils.id('Deposit(address,uint256)'),
  Withdrawal: ethers.utils.id('Withdrawal(address,uint256)'),
} as const;

// ─── Type Resolution ────────────────────────────────────────────────

/**
 * Resolve a layout typeId to its canonical Solidity key type.
 * Looks up the type definition's `label` first (most reliable),
 * then falls back to parsing the typeId string.
 */
function resolveKeyType(
  typeId: string,
  layout: StorageLayoutResponse,
): string | null {
  // Try the type definition's label first — this is the canonical Solidity type
  const typeDef = layout.types[typeId];
  if (typeDef?.label) {
    const label = typeDef.label.trim();
    // Contract types are addresses
    if (label.startsWith('contract ') || label.startsWith('interface ')) return 'address';
    // Enum types are uint8 in storage
    if (label.startsWith('enum ')) return 'uint8';
    // Direct Solidity type labels
    if (label === 'address' || label === 'address payable') return 'address';
    if (label === 'bool') return 'bool';
    if (label === 'string') return 'bytes32'; // string keys in mappings are hashed
    if (/^bytes\d{0,2}$/.test(label)) return label; // bytes1..bytes32
    if (/^uint\d+$/.test(label)) return label; // uint8..uint256
    if (/^int\d+$/.test(label)) return label; // int8..int256
  }
  // Fallback: parse the typeId string (e.g. "t_address", "t_uint256", "t_contract(IERC20)")
  if (!typeId) return null;
  if (typeId.startsWith('t_contract') || typeId.startsWith('t_address')) return 'address';
  if (typeId.startsWith('t_bool')) return 'bool';
  if (typeId.startsWith('t_enum')) return 'uint8';
  if (typeId.startsWith('t_string')) return 'bytes32';
  const bytesMatch = typeId.match(/^t_bytes(\d+)$/);
  if (bytesMatch) return `bytes${bytesMatch[1]}`;
  const uintMatch = typeId.match(/^t_uint(\d+)$/);
  if (uintMatch) return `uint${uintMatch[1]}`;
  const intMatch = typeId.match(/^t_int(\d+)$/);
  if (intMatch) return `int${intMatch[1]}`;
  return null;
}

// ─── Event-to-Key Extractors ─────────────────────────────────────────

interface KeyCandidate {
  key: string;
  keyType: string;
  /** For nested mappings: second-level key */
  nestedKey?: string;
  nestedKeyType?: string;
}

/**
 * Extract address candidates from a decoded log entry.
 * Returns candidate keys grouped by the events they relate to.
 */
function extractKeyCandidates(log: LogEntry): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  const topic0 = log.topics[0]?.toLowerCase();

  if (!topic0) return candidates;

  // Helper: decode address from indexed topic (32-byte hex, left-padded with zeros)
  const decodeTopicAddress = (topic: string): string | null => {
    if (!topic || topic.length < 42) return null;
    // Verify high 12 bytes are zero — topics with non-zero upper bytes are not addresses
    const upper = topic.startsWith('0x') ? topic.slice(2, 26) : topic.slice(0, 24);
    if (upper !== '0'.repeat(24)) return null;
    const addr = '0x' + topic.slice(26).toLowerCase();
    if (addr === '0x' + '0'.repeat(40)) return null; // skip zero address
    return addr;
  };

  // Helper: decode uint256 from indexed topic
  const decodeTopicUint = (topic: string): string | null => {
    if (!topic) return null;
    try {
      return BigInt(topic).toString();
    } catch {
      return null;
    }
  };

  if (topic0 === CANONICAL_EVENTS.Transfer.toLowerCase()) {
    // Transfer(address indexed from, address indexed to, uint256 value_or_tokenId)
    const from = decodeTopicAddress(log.topics[1]);
    const to = decodeTopicAddress(log.topics[2]);
    if (from) candidates.push({ key: from, keyType: 'address' });
    if (to) candidates.push({ key: to, keyType: 'address' });

    // For ERC721: tokenId is topic[3] if present, otherwise in data
    if (log.topics.length >= 4) {
      const tokenId = decodeTopicUint(log.topics[3]);
      if (tokenId) candidates.push({ key: tokenId, keyType: 'uint256' });
    }

    // For nested mappings like _allowances[from][to]
    if (from && to) {
      candidates.push({
        key: from,
        keyType: 'address',
        nestedKey: to,
        nestedKeyType: 'address',
      });
      candidates.push({
        key: to,
        keyType: 'address',
        nestedKey: from,
        nestedKeyType: 'address',
      });
    }
  }

  if (topic0 === CANONICAL_EVENTS.Approval.toLowerCase()) {
    // Approval(address indexed owner, address indexed spender, uint256 value)
    const owner = decodeTopicAddress(log.topics[1]);
    const spender = decodeTopicAddress(log.topics[2]);
    if (owner) candidates.push({ key: owner, keyType: 'address' });
    if (spender) candidates.push({ key: spender, keyType: 'address' });

    // Nested: _allowances[owner][spender]
    if (owner && spender) {
      candidates.push({
        key: owner,
        keyType: 'address',
        nestedKey: spender,
        nestedKeyType: 'address',
      });
    }
  }

  if (topic0 === CANONICAL_EVENTS.ApprovalForAll.toLowerCase()) {
    // ApprovalForAll(address indexed owner, address indexed operator, bool approved)
    const owner = decodeTopicAddress(log.topics[1]);
    const operator = decodeTopicAddress(log.topics[2]);
    if (owner) candidates.push({ key: owner, keyType: 'address' });
    if (operator) candidates.push({ key: operator, keyType: 'address' });

    // Nested: _operatorApprovals[owner][operator]
    if (owner && operator) {
      candidates.push({
        key: owner,
        keyType: 'address',
        nestedKey: operator,
        nestedKeyType: 'address',
      });
    }
  }

  if (topic0 === CANONICAL_EVENTS.TransferSingle.toLowerCase()) {
    // TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)
    const operator = decodeTopicAddress(log.topics[1]);
    const from = decodeTopicAddress(log.topics[2]);
    const to = decodeTopicAddress(log.topics[3]);
    if (operator) candidates.push({ key: operator, keyType: 'address' });
    if (from) candidates.push({ key: from, keyType: 'address' });
    if (to) candidates.push({ key: to, keyType: 'address' });

    // Try to decode tokenId from data
    if (log.data && log.data.length >= 66) {
      try {
        const decoded = ethers.utils.defaultAbiCoder.decode(['uint256', 'uint256'], log.data);
        const tokenId = decoded[0].toString();
        candidates.push({ key: tokenId, keyType: 'uint256' });

        // Nested: _balances[tokenId][from/to]
        if (from) {
          candidates.push({ key: tokenId, keyType: 'uint256', nestedKey: from, nestedKeyType: 'address' });
        }
        if (to) {
          candidates.push({ key: tokenId, keyType: 'uint256', nestedKey: to, nestedKeyType: 'address' });
        }
      } catch { /* ignore decode errors */ }
    }
  }

  if (
    topic0 === CANONICAL_EVENTS.Deposit.toLowerCase() ||
    topic0 === CANONICAL_EVENTS.Withdrawal.toLowerCase()
  ) {
    const addr = decodeTopicAddress(log.topics[1]);
    if (addr) candidates.push({ key: addr, keyType: 'address' });
  }

  // Generic: any indexed address topic is a candidate key
  for (let i = 1; i < log.topics.length; i++) {
    const addr = decodeTopicAddress(log.topics[i]);
    if (addr && !candidates.some((c) => c.key === addr && !c.nestedKey)) {
      candidates.push({ key: addr, keyType: 'address' });
    }
  }

  return candidates;
}

// ─── Slot Verification ───────────────────────────────────────────────

/**
 * Verify a candidate key against a mapping entry by computing the derived slot
 * and reading storage to confirm it's non-zero.
 */
async function verifyCandidate(
  provider: ethers.providers.JsonRpcProvider,
  contractAddress: string,
  mappingEntry: MappingEntry,
  candidate: KeyCandidate,
  layout: StorageLayoutResponse,
): Promise<DiscoveredKey | null> {
  try {
    const baseSlot = BigInt(mappingEntry.baseSlot);

    // Determine key type from layout type definition
    const keyTypeId = mappingEntry.keyTypeId;
    let keyType = candidate.keyType;
    if (keyTypeId) {
      const resolvedType = resolveKeyType(keyTypeId, layout);
      if (resolvedType) keyType = resolvedType;
    }

    // Skip if key type doesn't match candidate
    if (keyType === 'address' && candidate.keyType !== 'address') return null;
    if (keyType !== 'address' && candidate.keyType === 'address') return null;

    let derivedSlot: bigint;
    let derivedSlotHex: string;
    let resolvedNestedKeyType: string | undefined = candidate.nestedKeyType;

    if (candidate.nestedKey && candidate.nestedKeyType) {
      // Nested mapping: compute keccak256(key2, keccak256(key1, baseSlot))
      // Check if the value type is itself a mapping
      const valueTypeId = mappingEntry.valueTypeId;
      if (!valueTypeId) return null;
      const valueTypeDef = layout.types[valueTypeId];
      if (!valueTypeDef || valueTypeDef.encoding !== 'mapping') return null;

      // Determine nested key type using the same resolver
      const nestedKeyTypeId = valueTypeDef.key;
      if (nestedKeyTypeId) {
        const resolved = resolveKeyType(nestedKeyTypeId, layout);
        if (resolved) resolvedNestedKeyType = resolved;
      }

      const nestedType: string = resolvedNestedKeyType ?? candidate.nestedKeyType;
      derivedSlot = computeNestedMappingSlot(baseSlot, [
        { value: candidate.key, type: keyType },
        { value: candidate.nestedKey, type: nestedType },
      ]);
      derivedSlotHex = formatSlotHex(derivedSlot);
    } else {
      derivedSlot = computeMappingSlot(baseSlot, candidate.key, keyType);
      derivedSlotHex = formatSlotHex(derivedSlot);
    }

    // Read storage to verify
    const value = await provider.getStorageAt(contractAddress, derivedSlotHex);
    if (!value) return null;

    const normalized = value.startsWith('0x')
      ? '0x' + value.slice(2).padStart(64, '0')
      : '0x' + value.padStart(64, '0');

    // Only include non-zero values
    const ZERO = '0x' + '0'.repeat(64);
    if (normalized === ZERO) return null;

    return {
      key: candidate.key,
      keyType,
      derivedSlot: derivedSlotHex,
      value: normalized,
      variable: mappingEntry.variable,
      baseSlot: mappingEntry.baseSlot,
      nestedKey: candidate.nestedKey,
      nestedKeyType: resolvedNestedKeyType,
    };
  } catch {
    return null;
  }
}

// ─── Main Discovery Function ─────────────────────────────────────────

/**
 * Discover mapping keys by scanning contract event logs and verifying
 * derived storage slots.
 *
 * Flow:
 * 1. Extract mapping entries from layout
 * 2. Build topic filters for canonical events
 * 3. Scan logs via rpcLogScanner (adaptive chunking)
 * 4. For each log, extract key candidates
 * 5. Verify candidates against mapping entries via eth_getStorageAt
 * 6. Deduplicate and return
 */
export async function discoverMappingKeys(
  opts: DiscoveryOptions,
): Promise<DiscoveryResult> {
  const startTime = performance.now();

  const {
    contractAddress,
    layout,
    mappingEntries,
    fromBlock,
    toBlock,
    provider,
    signal,
    onProgress,
    onKeys,
    maxLogs = DEFAULT_MAX_LOGS,
  } = opts;

  // Internal abort controller that we can trigger when maxLogs is reached
  const internalAbort = new AbortController();
  signal.addEventListener('abort', () => internalAbort.abort(), { once: true });

  const result: DiscoveryResult = {
    keys: new Map(),
    logsProcessed: 0,
    lastScannedBlock: fromBlock,
    durationMs: 0,
  };

  if (mappingEntries.length === 0) {
    result.durationMs = performance.now() - startTime;
    return result;
  }

  onProgress?.({
    phase: 'init',
    scannedBlocks: 0,
    totalBlocks: toBlock - fromBlock + 1,
    keysFound: 0,
    message: 'Preparing discovery scan...',
  });

  // ─── Phase 1: Scan logs and collect unique candidate keys ──────────

  const allTopics = Object.values(CANONICAL_EVENTS);
  const topicFilter: (string | string[] | null)[] = [allTopics];

  // Collect unique candidates: Map<"baseSlot:key:nestedKey", {candidate, mapping}>
  const candidateMap = new Map<string, { candidate: KeyCandidate; mapping: MappingEntry }>();
  let totalKeysFound = 0;

  try {
    await scanLogs({
      provider,
      contractAddress,
      topics: topicFilter,
      fromBlock,
      toBlock,
      signal: internalAbort.signal,
      initialChunkSize: 200,
      onLogs: (logs: LogEntry[]) => {
        if (signal.aborted || internalAbort.signal.aborted) return;

        // Check cap BEFORE processing to avoid runaway accumulation
        if (result.logsProcessed >= maxLogs) {
          internalAbort.abort();
          return;
        }

        result.logsProcessed += logs.length;

        for (const log of logs) {
          const candidates = extractKeyCandidates(log);

          for (const candidate of candidates) {
            // Stop collecting if we have enough unique candidates
            if (candidateMap.size >= MAX_CANDIDATES) break;

            for (const mapping of mappingEntries) {
              const dedupeKey = `${mapping.baseSlot.toLowerCase()}:${candidate.key}:${candidate.nestedKey ?? ''}`;
              if (candidateMap.has(dedupeKey)) continue;
              candidateMap.set(dedupeKey, { candidate, mapping });
            }
          }
        }

        // Abort if candidate cap reached
        if (candidateMap.size >= MAX_CANDIDATES) {
          internalAbort.abort();
        }

        // Abort if log cap reached
        if (result.logsProcessed >= maxLogs) {
          internalAbort.abort();
        }
      },
      onProgress: (scanProgress: ScanProgress) => {
        result.lastScannedBlock = fromBlock + scanProgress.scannedBlocks - 1;
        onProgress?.({
          phase: 'scanning',
          scannedBlocks: scanProgress.scannedBlocks,
          totalBlocks: scanProgress.totalBlocks,
          keysFound: totalKeysFound,
          message: `Scanning blocks... (${scanProgress.logsFound} logs, ${candidateMap.size} candidates)`,
        });
      },
    });
  } catch (err) {
    if ((err as Error).name !== 'AbortError' && !signal.aborted) {
      // Scan error
    }
  }

  // ─── Phase 2: Verify candidates with bounded concurrency ──────────

  if (signal.aborted) {
    result.durationMs = performance.now() - startTime;
    return result;
  }

  const candidates = Array.from(candidateMap.values());

  onProgress?.({
    phase: 'verifying',
    scannedBlocks: toBlock - fromBlock + 1,
    totalBlocks: toBlock - fromBlock + 1,
    keysFound: 0,
    message: `Verifying ${candidates.length} candidates...`,
  });

  // Dedup verified keys
  const verifiedSet = new Set<string>();

  // Process in batches of VERIFY_CONCURRENCY
  for (let i = 0; i < candidates.length; i += VERIFY_CONCURRENCY) {
    if (signal.aborted) break;

    const batch = candidates.slice(i, i + VERIFY_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(({ candidate, mapping }) =>
        verifyCandidate(provider, contractAddress, mapping, candidate, layout),
      ),
    );

    for (const res of results) {
      if (res.status !== 'fulfilled' || !res.value) continue;
      const dk = res.value;
      const dedupeKey = `${dk.baseSlot.toLowerCase()}:${dk.key}:${dk.nestedKey ?? ''}`;
      if (verifiedSet.has(dedupeKey)) continue;
      verifiedSet.add(dedupeKey);

      const bucket = dk.baseSlot.toLowerCase();
      const existing = result.keys.get(bucket) || [];
      existing.push(dk);
      result.keys.set(bucket, existing);
      totalKeysFound++;
    }

    // Emit incremental updates every batch
    if (totalKeysFound > 0 && onKeys) {
      onKeys(new Map(result.keys));
    }

    onProgress?.({
      phase: 'verifying',
      scannedBlocks: toBlock - fromBlock + 1,
      totalBlocks: toBlock - fromBlock + 1,
      keysFound: totalKeysFound,
      message: `Verified ${Math.min(i + VERIFY_CONCURRENCY, candidates.length)}/${candidates.length} (${totalKeysFound} hits)`,
    });

    // Yield to main thread every batch
    await new Promise((r) => setTimeout(r, 0));
  }

  // ─── Finalize ──────────────────────────────────────────────────────

  result.lastScannedBlock = toBlock;
  result.durationMs = performance.now() - startTime;

  if (!signal.aborted) {
    onProgress?.({
      phase: 'done',
      scannedBlocks: toBlock - fromBlock + 1,
      totalBlocks: toBlock - fromBlock + 1,
      keysFound: totalKeysFound,
    });
  }

  return result;
}
