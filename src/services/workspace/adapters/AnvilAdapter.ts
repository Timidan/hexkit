import { BaseNodeAdapter } from '../LocalNodeAdapter';
import type { NodeBackend } from '../types';

export class AnvilAdapter extends BaseNodeAdapter {
  readonly type: NodeBackend = 'anvil';

  async detect(): Promise<boolean> {
    try {
      const clientVersion = await this.rpc<string>('web3_clientVersion');
      if (clientVersion.toLowerCase().includes('anvil')) return true;
    } catch { /* ignore */ }
    try {
      await this.rpc('anvil_nodeInfo');
      return true;
    } catch { /* ignore */ }
    return false;
  }

  async mine(blocks = 1): Promise<void> {
    await this.rpc('anvil_mine', [blocks]);
  }

  async setBalance(addr: string, wei: bigint): Promise<void> {
    await this.rpc('anvil_setBalance', [addr, '0x' + wei.toString(16)]);
  }

  async setCode(addr: string, bytecode: string): Promise<void> {
    await this.rpc('anvil_setCode', [addr, bytecode]);
  }

  async setNonce(addr: string, nonce: number): Promise<void> {
    await this.rpc('anvil_setNonce', [addr, '0x' + nonce.toString(16)]);
  }

  async setStorageAt(addr: string, slot: string, value: string): Promise<void> {
    await this.rpc('anvil_setStorageAt', [addr, slot, value]);
  }

  async impersonate(addr: string): Promise<void> {
    await this.rpc('anvil_impersonateAccount', [addr]);
  }

  async stopImpersonating(addr: string): Promise<void> {
    await this.rpc('anvil_stopImpersonatingAccount', [addr]);
  }

  async reset(options?: { forking?: { jsonRpcUrl: string; blockNumber?: number } }): Promise<void> {
    await this.rpc('anvil_reset', [options ?? {}]);
  }
}
