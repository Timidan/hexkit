import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GanacheAdapter } from '../adapters/GanacheAdapter';
import { UnsupportedOperationError } from '../types';

function makeJsonResponse(result: unknown, error?: { message: string }) {
  return {
    ok: true,
    json: () => Promise.resolve(error ? { error } : { result }),
  } as unknown as Response;
}

describe('GanacheAdapter', () => {
  let adapter: GanacheAdapter;

  beforeEach(() => {
    adapter = new GanacheAdapter('http://localhost:8545');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has type "ganache"', () => {
    expect(adapter.type).toBe('ganache');
  });

  describe('detect()', () => {
    it('returns true when web3_clientVersion contains "ganache"', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeJsonResponse('Ganache/v7.9.1/EthereumJS TestRPC'),
      );
      expect(await adapter.detect()).toBe(true);
    });

    it('returns true when web3_clientVersion contains "testrpc"', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeJsonResponse('TestRPC/v2.13.2'),
      );
      expect(await adapter.detect()).toBe(true);
    });

    it('returns false when web3_clientVersion is non-ganache', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeJsonResponse('geth/v1.10.0'),
      );
      expect(await adapter.detect()).toBe(false);
    });

    it('returns false when fetch throws a network error', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network error'));
      expect(await adapter.detect()).toBe(false);
    });

    it('returns false when RPC returns an error', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeJsonResponse(null, { message: 'method not found' }),
      );
      expect(await adapter.detect()).toBe(false);
    });
  });

  describe('mine()', () => {
    it('calls evm_mine once with default blocks=1', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.mine();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('evm_mine');
    });

    it('calls evm_mine 3 times when blocks=3', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(makeJsonResponse(null))
        .mockResolvedValueOnce(makeJsonResponse(null))
        .mockResolvedValueOnce(makeJsonResponse(null));
      vi.stubGlobal('fetch', mockFetch);
      await adapter.mine(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      for (let i = 0; i < 3; i++) {
        const body = JSON.parse(mockFetch.mock.calls[i][1].body);
        expect(body.method).toBe('evm_mine');
      }
    });
  });

  describe('unsupported operations', () => {
    it('setBalance throws UnsupportedOperationError', async () => {
      await expect(adapter.setBalance('0xabc', 1000n)).rejects.toThrow(UnsupportedOperationError);
      await expect(adapter.setBalance('0xabc', 1000n)).rejects.toThrow('"setBalance" is not supported on ganache');
    });

    it('setCode throws UnsupportedOperationError', async () => {
      await expect(adapter.setCode('0xabc', '0x6000')).rejects.toThrow(UnsupportedOperationError);
    });

    it('setNonce throws UnsupportedOperationError', async () => {
      await expect(adapter.setNonce('0xabc', 5)).rejects.toThrow(UnsupportedOperationError);
    });

    it('setStorageAt throws UnsupportedOperationError', async () => {
      await expect(adapter.setStorageAt('0xabc', '0x0', '0x1')).rejects.toThrow(UnsupportedOperationError);
    });

    it('impersonate throws UnsupportedOperationError', async () => {
      await expect(adapter.impersonate('0xabc')).rejects.toThrow(UnsupportedOperationError);
      await expect(adapter.impersonate('0xabc')).rejects.toThrow('"impersonate" is not supported on ganache');
    });

    it('stopImpersonating throws UnsupportedOperationError', async () => {
      await expect(adapter.stopImpersonating('0xabc')).rejects.toThrow(UnsupportedOperationError);
    });

    it('reset throws UnsupportedOperationError', async () => {
      await expect(adapter.reset()).rejects.toThrow(UnsupportedOperationError);
      await expect(adapter.reset()).rejects.toThrow('"reset" is not supported on ganache');
    });
  });
});
