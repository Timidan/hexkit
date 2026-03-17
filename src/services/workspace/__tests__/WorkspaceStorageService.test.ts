import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceStorageService } from '../WorkspaceStorageService';

// Use fake-indexeddb for testing
import 'fake-indexeddb/auto';

describe('WorkspaceStorageService', () => {
  let service: WorkspaceStorageService;

  beforeEach(async () => {
    service = new WorkspaceStorageService();
    await service.clear();
  });

  it('saves and retrieves deployed contracts', async () => {
    const contract = {
      name: 'MyToken',
      address: '0x1234',
      abi: [{ type: 'function', name: 'transfer' }],
      bytecode: '0x60806040',
      deployTxHash: '0xabc',
      deployBlock: 1,
    };
    await service.saveDeployedContract(contract);
    const contracts = await service.getDeployedContracts();
    expect(contracts).toHaveLength(1);
    expect((contracts[0] as Record<string, unknown>).name).toBe('MyToken');
  });

  it('saves and retrieves compilation artifacts', async () => {
    const artifact = {
      contractName: 'MyToken',
      abi: [],
      bytecode: '0x',
      deployedBytecode: '0x',
      sourceMap: '',
      deployedSourceMap: '',
      ast: {},
      sourceFile: 'MyToken.sol',
      compilerVersion: '0.8.24',
      contentHash: 'abc123',
    };
    await service.saveArtifact(artifact);
    const artifacts = await service.getArtifacts();
    expect(artifacts).toHaveLength(1);
    expect((artifacts[0] as Record<string, unknown>).contractName).toBe('MyToken');
  });

  it('saves and retrieves transaction history', async () => {
    const tx = {
      hash: '0xdef',
      from: '0x1',
      to: '0x2',
      value: '0x0',
      data: '0x',
      blockNumber: 5,
      status: 'success' as const,
      gasUsed: '0x5208',
      timestamp: Date.now(),
    };
    await service.saveTransaction(tx);
    const txns = await service.getTransactions();
    expect(txns).toHaveLength(1);
  });
});
