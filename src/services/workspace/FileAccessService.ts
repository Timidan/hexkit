// src/services/workspace/FileAccessService.ts

import { getSimulatorBridgeUrl } from '@/utils/env';
import type { CompilationArtifact } from './types';

export type Toolchain = 'foundry' | 'hardhat' | 'none';

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: FileNode[];
}

type FileAccessBackend = 'fsapi' | 'bridge';

export class FileAccessService {
  private backend: FileAccessBackend | null = null;
  private sessionToken: string | null = null;
  private projectRoot: string | null = null;
  private directoryHandle: FileSystemDirectoryHandle | null = null;

  get activeBackend(): FileAccessBackend | null {
    return this.backend;
  }

  /** Check if the File System Access API is available */
  get isFsApiAvailable(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /** Open a project using the best available backend */
  async openProject(): Promise<{ tree: FileNode[]; projectRoot: string }> {
    // Try File System Access API first
    if (this.isFsApiAvailable) {
      try {
        return await this.openWithFsApi();
      } catch (err) {
        console.warn('[FileAccessService] FS API failed, trying bridge:', err);
      }
    }
    return this.openWithBridge();
  }

  private async openWithFsApi(): Promise<{ tree: FileNode[]; projectRoot: string }> {
    this.directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    this.backend = 'fsapi';
    this.projectRoot = this.directoryHandle!.name;
    const tree = await this.buildTreeFromHandle(this.directoryHandle!);
    return { tree, projectRoot: this.directoryHandle!.name };
  }

  private async openWithBridge(): Promise<{ tree: FileNode[]; projectRoot: string }> {
    const path = prompt('Enter project directory path:');
    if (!path) throw new Error('No path provided');

    const baseUrl = getSimulatorBridgeUrl();
    const res = await fetch(`${baseUrl}/files/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    this.backend = 'bridge';
    this.sessionToken = data.token;
    this.projectRoot = data.projectRoot;
    return { tree: data.tree, projectRoot: data.projectRoot };
  }

  async readFile(path: string): Promise<string> {
    if (this.backend === 'fsapi') {
      return this.readWithFsApi(path);
    }
    return this.readWithBridge(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (this.backend === 'fsapi') {
      return this.writeWithFsApi(path, content);
    }
    return this.writeWithBridge(path, content);
  }

  private async readWithFsApi(path: string): Promise<string> {
    const handle = await this.resolveFileHandle(path);
    const file = await handle.getFile();
    return file.text();
  }

  private async writeWithFsApi(path: string, content: string): Promise<void> {
    const handle = await this.resolveFileHandle(path);
    const writable = await (handle as any).createWritable();
    await writable.write(content);
    await writable.close();
  }

  private async readWithBridge(path: string): Promise<string> {
    const baseUrl = getSimulatorBridgeUrl();
    const res = await fetch(`${baseUrl}/files/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Token': this.sessionToken ?? '',
      },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.content;
  }

  private async writeWithBridge(path: string, content: string): Promise<void> {
    const baseUrl = getSimulatorBridgeUrl();
    const res = await fetch(`${baseUrl}/files/write`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Token': this.sessionToken ?? '',
      },
      body: JSON.stringify({ path, content }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
  }

  private async resolveFileHandle(path: string): Promise<FileSystemFileHandle> {
    if (!this.directoryHandle) throw new Error('No directory handle');
    const parts = path.split('/').filter(Boolean);
    let current: FileSystemDirectoryHandle = this.directoryHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]);
    }
    return current.getFileHandle(parts[parts.length - 1]);
  }

  private async buildTreeFromHandle(
    dirHandle: FileSystemDirectoryHandle,
    depth = 0,
  ): Promise<FileNode[]> {
    if (depth > 5) return [];
    const entries: FileNode[] = [];
    const skipDirs = new Set(['node_modules', '.git', 'cache', 'out', 'artifacts', 'dist']);

    for await (const [name, handle] of (dirHandle as any).entries()) {
      if (name.startsWith('.') && handle.kind === 'directory') continue;
      if (skipDirs.has(name)) continue;

      if (handle.kind === 'directory') {
        const children = await this.buildTreeFromHandle(handle, depth + 1);
        entries.push({ name, type: 'directory', path: name, children });
      } else {
        entries.push({ name, type: 'file', path: name });
      }
    }
    return entries;
  }

  /** Detect toolchain by checking for config files via the directory handle */
  async detectToolchainLocal(): Promise<Toolchain> {
    if (!this.directoryHandle) return 'none';

    try {
      await this.directoryHandle.getFileHandle('foundry.toml');
      return 'foundry';
    } catch { /* not foundry */ }

    for (const name of ['hardhat.config.ts', 'hardhat.config.js']) {
      try {
        await this.directoryHandle.getFileHandle(name);
        return 'hardhat';
      } catch { /* not this config */ }
    }

    return 'none';
  }

  /** Scan pre-compiled artifacts from out/ (Foundry) or artifacts/ (Hardhat) */
  async scanLocalArtifacts(): Promise<{ toolchain: Toolchain; artifacts: CompilationArtifact[] }> {
    if (!this.directoryHandle) return { toolchain: 'none', artifacts: [] };

    const toolchain = await this.detectToolchainLocal();
    if (toolchain === 'foundry') return { toolchain, artifacts: await this.scanFoundryOut() };
    if (toolchain === 'hardhat') return { toolchain, artifacts: await this.scanHardhatArtifacts() };
    return { toolchain: 'none', artifacts: [] };
  }

  /** Scan Foundry out/ directory for compiled contract JSON */
  private async scanFoundryOut(): Promise<CompilationArtifact[]> {
    let outDir: FileSystemDirectoryHandle;
    try {
      outDir = await this.directoryHandle!.getDirectoryHandle('out');
    } catch {
      return [];
    }

    // Determine which source dirs are test/script so we can skip their artifacts
    const testScriptDirs = new Set<string>();
    for (const dirName of ['test', 'script', 'scripts']) {
      try {
        await this.directoryHandle!.getDirectoryHandle(dirName);
        testScriptDirs.add(dirName);
      } catch { /* dir doesn't exist */ }
    }

    const results: CompilationArtifact[] = [];

    // out/<SourceFile>.sol/<ContractName>.json
    for await (const [solDirName, solDirHandle] of (outDir as any).entries()) {
      if (solDirHandle.kind !== 'directory' || !solDirName.endsWith('.sol')) continue;

      for await (const [jsonName, jsonHandle] of (solDirHandle as any).entries()) {
        if (jsonHandle.kind !== 'file' || !jsonName.endsWith('.json')) continue;

        try {
          const file = await (jsonHandle as FileSystemFileHandle).getFile();
          const data = JSON.parse(await file.text());
          if (!data.abi || !data.bytecode?.object) continue;

          const bytecodeHex: string = data.bytecode.object;

          // Skip empty bytecode (interfaces, abstract contracts, libraries with no code)
          if (!bytecodeHex || bytecodeHex === '0x' || bytecodeHex === '0x0' || bytecodeHex.length <= 4) continue;

          // Skip test/script artifacts by checking metadata source path
          const sourcePath: string = data.metadata?.settings?.compilationTarget
            ? Object.keys(data.metadata.settings.compilationTarget)[0] ?? ''
            : '';
          const isTestOrScript = sourcePath && testScriptDirs.has(sourcePath.split('/')[0]);
          if (isTestOrScript) continue;

          // Skip common test helper contracts by name
          const contractName = jsonName.replace('.json', '');
          if (contractName === 'Test' || contractName === 'Script' || contractName === 'Vm' ||
              contractName === 'StdAssertions' || contractName === 'StdCheats' ||
              contractName === 'StdError' || contractName === 'StdInvariant' ||
              contractName === 'StdStorage' || contractName === 'StdUtils' ||
              contractName === 'StdStyle' || contractName === 'console' ||
              contractName === 'console2' || contractName.startsWith('Std')) continue;

          results.push({
            contractName,
            abi: data.abi,
            bytecode: bytecodeHex.startsWith('0x') ? bytecodeHex : `0x${bytecodeHex}`,
            deployedBytecode: data.deployedBytecode?.object ?? '',
            sourceMap: data.bytecode?.sourceMap ?? '',
            deployedSourceMap: data.deployedBytecode?.sourceMap ?? '',
            ast: data.ast ?? null,
            storageLayout: data.storageLayout ?? null,
            sourceFile: solDirName,
            compilerVersion: data.metadata?.compiler?.version ?? '',
            contentHash: data.metadata?.contentHash ?? '',
          });
        } catch { /* skip unparseable files */ }
      }
    }

    return results;
  }

  /** Scan Hardhat artifacts/contracts/ directory for compiled contract JSON */
  private async scanHardhatArtifacts(): Promise<CompilationArtifact[]> {
    let artifactsDir: FileSystemDirectoryHandle;
    try {
      artifactsDir = await this.directoryHandle!.getDirectoryHandle('artifacts');
    } catch {
      return [];
    }

    let contractsDir: FileSystemDirectoryHandle;
    try {
      contractsDir = await artifactsDir.getDirectoryHandle('contracts');
    } catch {
      return [];
    }

    const results: CompilationArtifact[] = [];

    // artifacts/contracts/<SourceFile>.sol/<ContractName>.json
    for await (const [solDirName, solDirHandle] of (contractsDir as any).entries()) {
      if (solDirHandle.kind !== 'directory' || !solDirName.endsWith('.sol')) continue;

      for await (const [jsonName, jsonHandle] of (solDirHandle as any).entries()) {
        if (jsonHandle.kind !== 'file' || !jsonName.endsWith('.json')) continue;
        if (jsonName.endsWith('.dbg.json')) continue;

        try {
          const file = await (jsonHandle as FileSystemFileHandle).getFile();
          const data = JSON.parse(await file.text());
          if (!data.abi || !data.bytecode) continue;

          const bytecodeHex: string = data.bytecode;
          // Skip empty bytecodes (interfaces, abstract contracts)
          if (!bytecodeHex || bytecodeHex === '0x' || bytecodeHex === '0x0' || bytecodeHex.length <= 4) continue;

          results.push({
            contractName: data.contractName ?? jsonName.replace('.json', ''),
            abi: data.abi,
            bytecode: bytecodeHex.startsWith('0x') ? bytecodeHex : `0x${bytecodeHex}`,
            deployedBytecode: data.deployedBytecode ?? '',
            sourceMap: '',
            deployedSourceMap: '',
            ast: null,
            storageLayout: null,
            sourceFile: data.sourceName ?? solDirName,
            compilerVersion: '',
            contentHash: '',
          });
        } catch { /* skip unparseable files */ }
      }
    }

    return results;
  }

  close(): void {
    this.backend = null;
    this.sessionToken = null;
    this.projectRoot = null;
    this.directoryHandle = null;
  }
}
