import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChainManager } from '../ChainManager';

vi.mock('@/utils/env', () => ({
  getSimulatorBridgeUrl: () => 'http://localhost:5789',
  getBridgeHeaders: () => ({ 'Content-Type': 'application/json' }),
}));

const mockFetch = vi.fn(() =>
  Promise.resolve({ json: () => Promise.resolve({ ok: true }) } as Response)
);
global.fetch = mockFetch;

function makeConnectResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    clientVersion: 'anvil/v0.2.0',
    chainId: '0x7a69',
    blockNumber: '0x0',
    ...overrides,
  };
}

function makeFetchResponse(body: unknown) {
  return Promise.resolve({
    json: () => Promise.resolve(body),
  } as Response);
}

describe('ChainManager', () => {
  let manager: ChainManager;

  beforeEach(() => {
    manager = new ChainManager();
    mockFetch.mockReset();
    // Restore default implementation after reset (used by disconnect() in afterEach)
    mockFetch.mockImplementation(() =>
      Promise.resolve({ json: () => Promise.resolve({ ok: true }) } as Response)
    );
  });

  afterEach(() => {
    // Clean up any running heartbeat
    manager.disconnect();
    vi.clearAllTimers();
  });

  it('isConnected is false initially', () => {
    expect(manager.isConnected).toBe(false);
    expect(manager.nodeType).toBeNull();
    expect(manager.rpcUrl).toBeNull();
    expect(manager.chainInfo).toBeNull();
  });

  it('connect() sends POST to bridge /chain/connect with rpcUrl', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse()));
    // disconnect call also fetches
    mockFetch.mockReturnValue(makeFetchResponse({ ok: true }));

    await manager.connect('http://localhost:8545');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5789/chain/connect',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rpcUrl: 'http://localhost:8545' }),
      })
    );
  });

  it('connect() parses response and sets state', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse({
      clientVersion: 'anvil/v0.2.0',
      chainId: '0x7a69',   // 31337
      blockNumber: '0xa',  // 10
    })));
    mockFetch.mockReturnValue(makeFetchResponse({ ok: true }));

    const result = await manager.connect('http://localhost:8545');

    expect(result.type).toBe('anvil');
    expect(manager.isConnected).toBe(true);
    expect(manager.nodeType).toBe('anvil');
    expect(manager.rpcUrl).toBe('http://localhost:8545');
    expect(manager.chainInfo?.chainId).toBe(31337);
    expect(manager.chainInfo?.blockNumber).toBe(10);
  });

  it('connect() detects "anvil" from clientVersion', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse({
      clientVersion: 'Anvil/v0.1.0',
    })));
    mockFetch.mockReturnValue(makeFetchResponse({ ok: true }));

    const result = await manager.connect('http://localhost:8545');
    expect(result.type).toBe('anvil');
  });

  it('connect() detects "hardhat" from clientVersion', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse({
      clientVersion: 'HardhatNetwork/2.0.0',
    })));
    mockFetch.mockReturnValue(makeFetchResponse({ ok: true }));

    const result = await manager.connect('http://localhost:8545');
    expect(result.type).toBe('hardhat');
  });

  it('connect() detects "ganache" from clientVersion', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse({
      clientVersion: 'Ganache/7.0.0',
    })));
    mockFetch.mockReturnValue(makeFetchResponse({ ok: true }));

    const result = await manager.connect('http://localhost:8545');
    expect(result.type).toBe('ganache');
  });

  it('connect() sets "unknown" for unrecognized clientVersion', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse({
      clientVersion: 'SomeOtherNode/1.0',
    })));
    mockFetch.mockReturnValue(makeFetchResponse({ ok: true }));

    const result = await manager.connect('http://localhost:8545');
    expect(result.type).toBe('unknown');
  });

  it('connect() throws on bridge error response', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({
      ok: false,
      error: 'Connection refused',
    }));

    await expect(manager.connect('http://localhost:8545')).rejects.toThrow('Connection refused');
    expect(manager.isConnected).toBe(false);
  });

  it('connect() throws with default message when no error field', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({ ok: false }));

    await expect(manager.connect('http://localhost:9999')).rejects.toThrow(
      'Could not connect to http://localhost:9999'
    );
  });

  it('disconnect() clears state and notifies bridge', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse()));
    mockFetch.mockReturnValue(makeFetchResponse({ ok: true }));

    await manager.connect('http://localhost:8545');
    expect(manager.isConnected).toBe(true);

    manager.disconnect();

    expect(manager.isConnected).toBe(false);
    expect(manager.nodeType).toBeNull();
    expect(manager.rpcUrl).toBeNull();
    expect(manager.chainInfo).toBeNull();

    // The disconnect fetch should have been called
    const disconnectCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/chain/disconnect')
    );
    expect(disconnectCall).toBeDefined();
  });

  it('bridgeRpc() sends POST to /chain/rpc with method and params', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({
      ok: true,
      result: '0x10',
    }));

    const result = await manager.bridgeRpc<string>('eth_blockNumber', []);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5789/chain/rpc',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'eth_blockNumber', params: [] }),
      })
    );
    expect(result).toBe('0x10');
  });

  it('bridgeRpc() throws when bridge returns ok: false', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({
      ok: false,
      error: 'RPC error',
    }));

    await expect(manager.bridgeRpc('eth_blockNumber')).rejects.toThrow('RPC error');
  });

  it('bridgeRpc() defaults params to empty array', async () => {
    mockFetch.mockReturnValueOnce(makeFetchResponse({
      ok: true,
      result: '0x1',
    }));

    await manager.bridgeRpc('eth_chainId');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5789/chain/rpc',
      expect.objectContaining({
        body: JSON.stringify({ method: 'eth_chainId', params: [] }),
      })
    );
  });

  describe('heartbeat', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('heartbeat updates chainInfo blockNumber on success', async () => {
      mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse({
        blockNumber: '0x0',
      })));
      // heartbeat bridgeRpc response
      mockFetch.mockReturnValueOnce(makeFetchResponse({ ok: true, result: '0x5' }));
      mockFetch.mockReturnValue(makeFetchResponse({ ok: true }));

      await manager.connect('http://localhost:8545');
      expect(manager.chainInfo?.blockNumber).toBe(0);

      await vi.advanceTimersByTimeAsync(5000);

      expect(manager.chainInfo?.blockNumber).toBe(5);
    });

    it('heartbeat fires onDisconnect after MAX_HEARTBEAT_FAILURES consecutive failures', async () => {
      mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse()));
      // All heartbeat calls fail
      mockFetch.mockRejectedValue(new Error('network error'));

      const onDisconnect = vi.fn();
      manager.on('disconnect', onDisconnect);

      await manager.connect('http://localhost:8545');

      // 3 failures needed
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      expect(onDisconnect).toHaveBeenCalledTimes(1);
    });

    it('heartbeat fires onChainUpdate on each successful tick', async () => {
      mockFetch.mockReturnValueOnce(makeFetchResponse(makeConnectResponse()));
      mockFetch.mockReturnValueOnce(makeFetchResponse({ ok: true, result: '0x1' }));
      mockFetch.mockReturnValueOnce(makeFetchResponse({ ok: true, result: '0x2' }));
      mockFetch.mockReturnValue(makeFetchResponse({ ok: true }));

      const onChainUpdate = vi.fn();
      manager.on('chainUpdate', onChainUpdate);

      await manager.connect('http://localhost:8545');

      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      expect(onChainUpdate).toHaveBeenCalledTimes(2);
    });
  });
});
