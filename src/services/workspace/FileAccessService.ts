// src/services/workspace/FileAccessService.ts

import { getSimulatorBridgeUrl } from '@/utils/env';

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

  close(): void {
    this.backend = null;
    this.sessionToken = null;
    this.projectRoot = null;
    this.directoryHandle = null;
  }
}
