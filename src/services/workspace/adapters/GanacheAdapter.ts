import { BaseNodeAdapter } from '../LocalNodeAdapter';
import { UnsupportedOperationError } from '../types';
import type { NodeBackend } from '../types';

export class GanacheAdapter extends BaseNodeAdapter {
  readonly type: NodeBackend = 'ganache';

  async detect(): Promise<boolean> {
    try {
      const clientVersion = await this.rpc<string>('web3_clientVersion');
      const lower = clientVersion.toLowerCase();
      if (lower.includes('ganache') || lower.includes('testrpc')) return true;
    } catch { /* ignore */ }
    return false;
  }

  async mine(blocks = 1): Promise<void> {
    for (let i = 0; i < blocks; i++) {
      await this.rpc('evm_mine');
    }
  }

  async setBalance(_addr: string, _wei: bigint): Promise<void> {
    throw new UnsupportedOperationError('setBalance', this.type);
  }

  async setCode(_addr: string, _bytecode: string): Promise<void> {
    throw new UnsupportedOperationError('setCode', this.type);
  }

  async setNonce(_addr: string, _nonce: number): Promise<void> {
    throw new UnsupportedOperationError('setNonce', this.type);
  }

  async setStorageAt(_addr: string, _slot: string, _value: string): Promise<void> {
    throw new UnsupportedOperationError('setStorageAt', this.type);
  }

  async impersonate(_addr: string): Promise<void> {
    throw new UnsupportedOperationError('impersonate', this.type);
  }

  async stopImpersonating(_addr: string): Promise<void> {
    throw new UnsupportedOperationError('stopImpersonating', this.type);
  }

  async reset(_options?: { forking?: { jsonRpcUrl: string; blockNumber?: number } }): Promise<void> {
    throw new UnsupportedOperationError('reset', this.type);
  }
}
