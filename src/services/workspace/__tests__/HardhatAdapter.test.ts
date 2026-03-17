import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HardhatAdapter } from '../adapters/HardhatAdapter';

function makeJsonResponse(result: unknown, error?: { message: string }) {
  return {
    ok: true,
    json: () => Promise.resolve(error ? { error } : { result }),
  } as unknown as Response;
}

describe('HardhatAdapter', () => {
  let adapter: HardhatAdapter;

  beforeEach(() => {
    adapter = new HardhatAdapter('http://localhost:8545');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has type "hardhat"', () => {
    expect(adapter.type).toBe('hardhat');
  });

  describe('detect()', () => {
    it('returns true when web3_clientVersion contains "hardhat"', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeJsonResponse('HardhatNetwork/2.22.0'),
      );
      expect(await adapter.detect()).toBe(true);
    });

    it('returns true when web3_clientVersion check fails but hardhat_metadata succeeds', async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeJsonResponse(null, { message: 'method not found' }))
        .mockResolvedValueOnce(makeJsonResponse({ clientVersion: 'HardhatNetwork/2.22.0' }));
      expect(await adapter.detect()).toBe(true);
    });

    it('returns false when both web3_clientVersion and hardhat_metadata fail', async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeJsonResponse('geth/v1.10.0'))
        .mockResolvedValueOnce(makeJsonResponse(null, { message: 'method not found' }));
      expect(await adapter.detect()).toBe(false);
    });

    it('returns false when network errors occur on both calls', async () => {
      (fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'));
      expect(await adapter.detect()).toBe(false);
    });
  });

  describe('mine()', () => {
    it('calls hardhat_mine with ["0x1"] by default', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.mine();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_mine');
      expect(body.params).toEqual(['0x1']);
    });

    it('calls hardhat_mine with hex string for blocks=5', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.mine(5);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_mine');
      expect(body.params).toEqual(['0x5']);
    });
  });

  describe('setBalance()', () => {
    it('calls hardhat_setBalance with address and hex wei', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.setBalance('0xabc', 1000n);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_setBalance');
      expect(body.params).toEqual(['0xabc', '0x3e8']);
    });
  });

  describe('setCode()', () => {
    it('calls hardhat_setCode with address and bytecode', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.setCode('0xabc', '0x6000');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_setCode');
      expect(body.params).toEqual(['0xabc', '0x6000']);
    });
  });

  describe('setNonce()', () => {
    it('calls hardhat_setNonce with address and hex nonce', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.setNonce('0xabc', 10);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_setNonce');
      expect(body.params).toEqual(['0xabc', '0xa']);
    });
  });

  describe('setStorageAt()', () => {
    it('calls hardhat_setStorageAt with address, slot, and value', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.setStorageAt('0xabc', '0x1', '0xcafe');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_setStorageAt');
      expect(body.params).toEqual(['0xabc', '0x1', '0xcafe']);
    });
  });

  describe('impersonate()', () => {
    it('calls hardhat_impersonateAccount with address', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.impersonate('0xabc');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_impersonateAccount');
      expect(body.params).toEqual(['0xabc']);
    });
  });

  describe('stopImpersonating()', () => {
    it('calls hardhat_stopImpersonatingAccount with address', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.stopImpersonating('0xabc');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_stopImpersonatingAccount');
      expect(body.params).toEqual(['0xabc']);
    });
  });

  describe('reset()', () => {
    it('calls hardhat_reset with empty object when no options provided', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.reset();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_reset');
      expect(body.params).toEqual([{}]);
    });

    it('calls hardhat_reset with forking options', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      const options = { forking: { jsonRpcUrl: 'https://mainnet.example.com', blockNumber: 18000000 } };
      await adapter.reset(options);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('hardhat_reset');
      expect(body.params).toEqual([options]);
    });
  });
});
