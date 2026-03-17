import { BaseNodeAdapter } from '../LocalNodeAdapter';
import type { NodeBackend } from '../types';

export class HardhatAdapter extends BaseNodeAdapter {
  readonly type: NodeBackend = 'hardhat';

  async detect(): Promise<boolean> {
    try {
      const clientVersion = await this.rpc<string>('web3_clientVersion');
      if (clientVersion.toLowerCase().includes('hardhat')) return true;
    } catch { /* ignore */ }
    try {
      await this.rpc('hardhat_metadata');
      return true;
    } catch { /* ignore */ }
    return false;
  }

  async mine(blocks = 1): Promise<void> {
    await this.rpc('hardhat_mine', ['0x' + blocks.toString(16)]);
  }

  async setBalance(addr: string, wei: bigint): Promise<void> {
    await this.rpc('hardhat_setBalance', [addr, '0x' + wei.toString(16)]);
  }

  async setCode(addr: string, bytecode: string): Promise<void> {
    await this.rpc('hardhat_setCode', [addr, bytecode]);
  }

  async setNonce(addr: string, nonce: number): Promise<void> {
    await this.rpc('hardhat_setNonce', [addr, '0x' + nonce.toString(16)]);
  }

  async setStorageAt(addr: string, slot: string, value: string): Promise<void> {
    await this.rpc('hardhat_setStorageAt', [addr, slot, value]);
  }

  async impersonate(addr: string): Promise<void> {
    await this.rpc('hardhat_impersonateAccount', [addr]);
  }

  async stopImpersonating(addr: string): Promise<void> {
    await this.rpc('hardhat_stopImpersonatingAccount', [addr]);
  }

  async reset(options?: { forking?: { jsonRpcUrl: string; blockNumber?: number } }): Promise<void> {
    await this.rpc('hardhat_reset', [options ?? {}]);
  }
}
