import type { NodeBackend, ChainInfo } from './types';
import { getSimulatorBridgeUrl, getBridgeHeaders } from '@/utils/env';

const DEFAULT_PORTS = [8545, 8546, 8547, 7545];
const HEARTBEAT_INTERVAL_MS = 5000;
const MAX_HEARTBEAT_FAILURES = 3;

export class ChainManager {
  private _nodeType: NodeBackend | null = null;
  private _rpcUrl: string | null = null;
  private _chainInfo: ChainInfo | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _heartbeatFailures = 0;
  private _onDisconnect?: () => void;
  private _onReconnect?: () => void;
  private _onChainUpdate?: (info: ChainInfo) => void;

  get nodeType(): NodeBackend | null { return this._nodeType; }
  get rpcUrl(): string | null { return this._rpcUrl; }
  get chainInfo(): ChainInfo | null { return this._chainInfo; }
  get isConnected(): boolean { return this._nodeType !== null; }

  on(event: 'disconnect' | 'reconnect' | 'chainUpdate', cb: (info?: ChainInfo) => void): void {
    if (event === 'disconnect') this._onDisconnect = cb;
    if (event === 'reconnect') this._onReconnect = cb;
    if (event === 'chainUpdate') this._onChainUpdate = cb as (info: ChainInfo) => void;
  }

  /**
   * Connect to a local node via the bridge server.
   * Bridge detects backend and proxies all future RPC calls.
   */
  async connect(rpcUrl: string): Promise<{ type: NodeBackend }> {
    const bridgeUrl = getSimulatorBridgeUrl();
    const res = await fetch(`${bridgeUrl}/chain/connect`, {
      method: 'POST',
      headers: getBridgeHeaders(),
      body: JSON.stringify({ rpcUrl }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || `Could not connect to ${rpcUrl}`);

    const clientVersion = (data.clientVersion || '').toLowerCase();
    let type: NodeBackend = 'unknown';
    if (clientVersion.includes('anvil')) type = 'anvil';
    else if (clientVersion.includes('hardhat')) type = 'hardhat';
    else if (clientVersion.includes('ganache') || clientVersion.includes('testrpc')) type = 'ganache';

    this._nodeType = type;
    this._rpcUrl = rpcUrl;
    this._chainInfo = {
      chainId: parseInt(data.chainId, 16),
      blockNumber: parseInt(data.blockNumber, 16),
      automine: true,
    };
    this._heartbeatFailures = 0;
    this.startHeartbeat();
    return { type };
  }

  /** Send an RPC call through the bridge proxy */
  async bridgeRpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const bridgeUrl = getSimulatorBridgeUrl();
    const res = await fetch(`${bridgeUrl}/chain/rpc`, {
      method: 'POST',
      headers: getBridgeHeaders(),
      body: JSON.stringify({ method, params }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.result as T;
  }

  /** Auto-detect a local node on common ports */
  async autoDetect(): Promise<{ type: NodeBackend } | null> {
    for (const port of DEFAULT_PORTS) {
      try {
        return await this.connect(`http://localhost:${port}`);
      } catch { /* port not reachable */ }
    }
    return null;
  }

  disconnect(): void {
    this.stopHeartbeat();
    this._nodeType = null;
    this._rpcUrl = null;
    this._chainInfo = null;
    // Notify bridge
    const bridgeUrl = getSimulatorBridgeUrl();
    fetch(`${bridgeUrl}/chain/disconnect`, {
      method: 'POST',
      headers: getBridgeHeaders(),
      body: '{}',
    }).catch(() => {});
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this._heartbeatTimer = setInterval(async () => {
      try {
        const blockHex = await this.bridgeRpc<string>('eth_blockNumber');
        const newInfo: ChainInfo = {
          ...this._chainInfo!,
          blockNumber: parseInt(blockHex, 16),
        };
        if (this._heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
          this._onReconnect?.();
        }
        this._heartbeatFailures = 0;
        this._chainInfo = newInfo;
        this._onChainUpdate?.(newInfo);
      } catch {
        this._heartbeatFailures++;
        if (this._heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
          this._onDisconnect?.();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }
}
