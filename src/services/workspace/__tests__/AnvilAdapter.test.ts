import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnvilAdapter } from '../adapters/AnvilAdapter';

function makeJsonResponse(result: unknown, error?: { message: string }) {
  return {
    ok: true,
    json: () => Promise.resolve(error ? { error } : { result }),
  } as unknown as Response;
}

describe('AnvilAdapter', () => {
  let adapter: AnvilAdapter;

  beforeEach(() => {
    adapter = new AnvilAdapter('http://localhost:8545');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has type "anvil"', () => {
    expect(adapter.type).toBe('anvil');
  });

  describe('detect()', () => {
    it('returns true when web3_clientVersion contains "anvil"', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeJsonResponse('Anvil/v0.2.0'),
      );
      expect(await adapter.detect()).toBe(true);
    });

    it('returns true when web3_clientVersion check fails but anvil_nodeInfo succeeds', async () => {
      // First call: web3_clientVersion throws RPC error
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeJsonResponse(null, { message: 'method not found' }))
        // Second call: anvil_nodeInfo succeeds
        .mockResolvedValueOnce(makeJsonResponse({}));
      expect(await adapter.detect()).toBe(true);
    });

    it('returns false when both web3_clientVersion and anvil_nodeInfo fail', async () => {
      (fetch as ReturnType<typeof vi.fn>)
        // web3_clientVersion returns a non-anvil version
        .mockResolvedValueOnce(makeJsonResponse('geth/v1.10.0'))
        // anvil_nodeInfo throws RPC error
        .mockResolvedValueOnce(makeJsonResponse(null, { message: 'method not found' }));
      expect(await adapter.detect()).toBe(false);
    });

    it('returns false when web3_clientVersion is non-anvil and both fallbacks fail', async () => {
      // First call: fetch itself throws (network error)
      (fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'));
      expect(await adapter.detect()).toBe(false);
    });
  });

  describe('mine()', () => {
    it('calls anvil_mine with [1] by default', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.mine();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_mine');
      expect(body.params).toEqual([1]);
    });

    it('calls anvil_mine with [5] when blocks=5', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.mine(5);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_mine');
      expect(body.params).toEqual([5]);
    });
  });

  describe('setBalance()', () => {
    it('calls anvil_setBalance with address and hex wei', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.setBalance('0xabc', 1000n);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_setBalance');
      expect(body.params).toEqual(['0xabc', '0x3e8']);
    });
  });

  describe('setCode()', () => {
    it('calls anvil_setCode with address and bytecode', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.setCode('0xabc', '0x6000');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_setCode');
      expect(body.params).toEqual(['0xabc', '0x6000']);
    });
  });

  describe('setNonce()', () => {
    it('calls anvil_setNonce with address and hex nonce', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.setNonce('0xabc', 5);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_setNonce');
      expect(body.params).toEqual(['0xabc', '0x5']);
    });
  });

  describe('setStorageAt()', () => {
    it('calls anvil_setStorageAt with address, slot, and value', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.setStorageAt('0xabc', '0x0', '0xdeadbeef');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_setStorageAt');
      expect(body.params).toEqual(['0xabc', '0x0', '0xdeadbeef']);
    });
  });

  describe('impersonate()', () => {
    it('calls anvil_impersonateAccount with address', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.impersonate('0xabc');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_impersonateAccount');
      expect(body.params).toEqual(['0xabc']);
    });
  });

  describe('stopImpersonating()', () => {
    it('calls anvil_stopImpersonatingAccount with address', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.stopImpersonating('0xabc');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_stopImpersonatingAccount');
      expect(body.params).toEqual(['0xabc']);
    });
  });

  describe('reset()', () => {
    it('calls anvil_reset with empty object when no options provided', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.reset();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_reset');
      expect(body.params).toEqual([{}]);
    });

    it('calls anvil_reset with forking options', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      const options = { forking: { jsonRpcUrl: 'https://mainnet.example.com', blockNumber: 12345 } };
      await adapter.reset(options);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('anvil_reset');
      expect(body.params).toEqual([options]);
    });
  });
});
