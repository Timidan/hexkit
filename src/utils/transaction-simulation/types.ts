import type { ethers } from 'ethers';

export interface SourcifySourceEntry {
  path: string;
  content: string;
}

export interface SourcifyArtifact {
  contractName: string;
  compilerVersion: string | null;
  sources: SourcifySourceEntry[];
  abi: string | null;
  sourceProvider?: 'sourcify' | 'etherscan' | 'blockscout';
  address?: string;
  settings?: {
    optimizer?: { enabled: boolean; runs: number };
    evmVersion?: string;
    compilationTarget?: Record<string, string>;
    libraries?: Record<string, Record<string, string>>;
    outputSelection?: Record<string, Record<string, string[]>>;
  };
  missingSettings?: boolean;
}

export interface SourcifyMetadataResult {
  artifacts: SourcifyArtifact[] | null;
  metadata: Record<string, unknown> | null;
}

export type ArtifactCacheEntry = {
  cachedAt: number;
  result: SourcifyMetadataResult;
};

export interface BlockscoutSourceFile {
  file_path: string;
  source_code: string;
}

export interface BlockscoutImplementation {
  address_hash: string;
  name: string | null;
}

export interface BlockscoutContractResponse {
  name?: string;
  is_verified?: boolean;
  compiler_version?: string;
  source_code?: string;
  additional_sources?: BlockscoutSourceFile[];
  abi?: any[];
  proxy_type?: string;
  implementations?: BlockscoutImplementation[];
}

export interface BridgeSimulationResponsePayload {
  mode?: string;
  success?: boolean;
  error?: string | null;
  warnings?: string[] | null;
  revertReason?: string | null;
  gasUsed?: string | null;
  gasLimitSuggested?: string | null;
  rawTrace?: unknown;
  debugSession?: {
    sessionId: string;
    rpcPort: number;
    snapshotCount: number;
  } | null;
  chainId?: number | null;
  debugLevel?: string | null;
  // ── V2 Trace Schema Fields ──
  traceSchemaVersion?: number | null;
  traceLite?: { version: number; rows: unknown[] } | null;
  traceMeta?: { sourceFiles: unknown[]; contracts: unknown[] } | null;
  traceQuality?: { stats: Record<string, number> } | null;
  traceDetailHandle?: { id: string; fields: string[]; expiresAt: number } | null;
  // ── V3 Rendered Trace (Rust EDB engine decoded rows) ──
  renderedTrace?: { schemaVersion: number; rows: unknown[]; sourceTexts: Record<string, string>; sourceLines: string[]; callMeta?: unknown; rawEvents: unknown[]; implementationToProxy: Record<string, string>; quality?: unknown } | null;
}

export interface BridgeAnalysisOptions {
  quickMode?: boolean;
  collectCallTree?: boolean;
  collectEvents?: boolean;
  collectStorageDiff?: boolean;
  collectStorageDiffs?: boolean;
  collectSnapshots?: boolean;
  etherscanApiKey?: string;
  artifactSourcePriority?: Array<'sourcify' | 'etherscan' | 'blockscout'>;
}

export type SerializableTransactionField =
  | string
  | number
  | ethers.BigNumber
  | undefined
  | null;

export interface RevertDetails {
  message: string | null;
  encodedData: string | null;
  errorSignature: string | null;
  errorName: string | null;
  errorArgs: unknown[] | null;
}

export const PANIC_CODE_MESSAGES: Record<number, string> = {
  0x01: 'Assertion failed',
  0x11: 'Arithmetic overflow or underflow',
  0x12: 'Division or modulo by zero',
  0x21: 'Invalid enum value',
  0x22: 'Incorrect storage byte array',
  0x31: 'Pop on empty array',
  0x32: 'Array out-of-bounds access',
  0x41: 'Memory allocation overflow',
  0x51: 'Invalid internal function',
};

export const normalizeBlockTag = (value?: string | number): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
};
