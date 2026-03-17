import type { NodeBackend, ChainInfo, AccountInfo, StructLog } from './types';

export interface CallParams {
  from?: string;
  to: string;
  data: string;
  value?: string;
  gas?: string;
}

/**
 * Unified interface for local dev chain operations.
 * All RPC calls go through the bridge server, not directly from browser.
 */
export interface ILocalNodeAdapter {
  readonly type: NodeBackend;

  // Detection
  detect(): Promise<boolean>;

  // Chain Info
  getChainInfo(): Promise<ChainInfo>;
  getAccounts(): Promise<AccountInfo[]>;

  // Chain Control
  snapshot(): Promise<string>;
  revert(id: string): Promise<void>;
  mine(blocks?: number): Promise<void>;
  setAutomine(enabled: boolean): Promise<void>;
  setIntervalMining(ms: number): Promise<void>;

  // Time Travel
  increaseTime(seconds: number): Promise<void>;
  setNextBlockTimestamp(ts: number): Promise<void>;

  // State Surgery
  setBalance(addr: string, wei: bigint): Promise<void>;
  setCode(addr: string, bytecode: string): Promise<void>;
  setNonce(addr: string, nonce: number): Promise<void>;
  setStorageAt(addr: string, slot: string, value: string): Promise<void>;

  // Account Control
  impersonate(addr: string): Promise<void>;
  stopImpersonating(addr: string): Promise<void>;

  // Tracing
  traceTransaction(hash: string): Promise<StructLog[]>;
  traceCall(tx: CallParams, block?: string): Promise<StructLog[]>;

  // Reset
  reset(options?: {
    forking?: { jsonRpcUrl: string; blockNumber?: number };
  }): Promise<void>;
}

/**
 * Base adapter with JSON-RPC helper. Subclasses override method names per backend.
 *
 * ARCHITECTURE NOTE: Per the spec (section I6), all local node RPC calls route
 * through the bridge server to avoid CORS. The browser-side ChainManager does NOT
 * instantiate adapters directly. Instead, it calls bridge endpoints like:
 *   POST /chain/connect  { rpcUrl }  → bridge detects backend, creates adapter server-side
 *   POST /chain/rpc      { method, params }  → bridge proxies to local node
 *
 * These adapter classes are used server-side in the bridge (chain-control.mjs) and
 * in unit tests. The browser uses a thin client that delegates to /chain/* endpoints.
 */
export abstract class BaseNodeAdapter implements ILocalNodeAdapter {
  abstract readonly type: NodeBackend;

  private static _rpcIdCounter = 0;

  protected rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  /** Send a JSON-RPC call to the local node */
  protected async rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const id = ++BaseNodeAdapter._rpcIdCounter;
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const json = await res.json();
    if (json.error) {
      throw new Error(`RPC error (${method}): ${json.error.message ?? JSON.stringify(json.error)}`);
    }
    return json.result as T;
  }

  abstract detect(): Promise<boolean>;

  async getChainInfo(): Promise<ChainInfo> {
    const [chainIdHex, blockHex] = await Promise.all([
      this.rpc<string>('eth_chainId'),
      this.rpc<string>('eth_blockNumber'),
    ]);
    return {
      chainId: parseInt(chainIdHex, 16),
      blockNumber: parseInt(blockHex, 16),
      automine: true,
    };
  }

  async getAccounts(): Promise<AccountInfo[]> {
    const addresses = await this.rpc<string[]>('eth_accounts');
    const infos = await Promise.all(
      addresses.map(async (address) => {
        const balanceHex = await this.rpc<string>('eth_getBalance', [address, 'latest']);
        const nonceHex = await this.rpc<string>('eth_getTransactionCount', [address, 'latest']);
        return {
          address,
          balance: BigInt(balanceHex),
          nonce: parseInt(nonceHex, 16),
          isImpersonated: false,
        };
      }),
    );
    return infos;
  }

  async snapshot(): Promise<string> {
    return this.rpc<string>('evm_snapshot');
  }

  async revert(id: string): Promise<void> {
    await this.rpc('evm_revert', [id]);
  }

  async setAutomine(enabled: boolean): Promise<void> {
    await this.rpc('evm_setAutomine', [enabled]);
  }

  async setIntervalMining(ms: number): Promise<void> {
    await this.rpc('evm_setIntervalMining', [ms]);
  }

  async increaseTime(seconds: number): Promise<void> {
    await this.rpc('evm_increaseTime', [seconds]);
  }

  async setNextBlockTimestamp(ts: number): Promise<void> {
    await this.rpc('evm_setNextBlockTimestamp', [ts]);
  }

  async traceTransaction(hash: string): Promise<StructLog[]> {
    const result = await this.rpc<{ structLogs: StructLog[] }>(
      'debug_traceTransaction',
      [hash, { disableStorage: false, disableMemory: false, disableStack: false }],
    );
    return result.structLogs;
  }

  async traceCall(tx: CallParams, block = 'latest'): Promise<StructLog[]> {
    const result = await this.rpc<{ structLogs: StructLog[] }>(
      'debug_traceCall',
      [tx, block, { disableStorage: false, disableMemory: false, disableStack: false }],
    );
    return result.structLogs;
  }

  // Abstract — subclasses MUST implement
  abstract mine(blocks?: number): Promise<void>;
  abstract setBalance(addr: string, wei: bigint): Promise<void>;
  abstract setCode(addr: string, bytecode: string): Promise<void>;
  abstract setNonce(addr: string, nonce: number): Promise<void>;
  abstract setStorageAt(addr: string, slot: string, value: string): Promise<void>;
  abstract impersonate(addr: string): Promise<void>;
  abstract stopImpersonating(addr: string): Promise<void>;
  abstract reset(options?: { forking?: { jsonRpcUrl: string; blockNumber?: number } }): Promise<void>;
}
