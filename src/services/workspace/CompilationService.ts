// src/services/workspace/CompilationService.ts

import { getSimulatorBridgeUrl, getBridgeHeaders } from '@/utils/env';

export type Toolchain = 'foundry' | 'hardhat' | 'solc' | 'browser-solcjs' | 'none';

export interface ToolchainInfo {
  detected: Toolchain;
  version: string | null;
}

export interface CompilationResult {
  ok: boolean;
  contracts: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export class CompilationService {
  private _projectRoot: string | null = null;
  private _toolchain: ToolchainInfo | null = null;

  get toolchain(): ToolchainInfo | null {
    return this._toolchain;
  }

  set projectRoot(root: string | null) {
    this._projectRoot = root;
    this._toolchain = null;
  }

  /** Detect available compilation toolchain via bridge */
  async detectToolchain(): Promise<ToolchainInfo> {
    if (!this._projectRoot) {
      return { detected: 'none', version: null };
    }

    const baseUrl = getSimulatorBridgeUrl();
    try {
      const res = await fetch(`${baseUrl}/compile/toolchain`, {
        method: 'POST',
        headers: getBridgeHeaders(),
        body: JSON.stringify({ projectRoot: this._projectRoot }),
      });
      const data = await res.json();
      if (data.ok) {
        this._toolchain = { detected: data.detected, version: data.version };
        return this._toolchain;
      }
    } catch {
      // Bridge not available
    }

    // Fallback: browser solc-js is always available
    this._toolchain = { detected: 'browser-solcjs', version: null };
    return this._toolchain;
  }

  /** Compile the project using the detected toolchain */
  async compile(): Promise<CompilationResult> {
    if (!this._projectRoot) {
      return { ok: false, contracts: {}, errors: ['No project root set'], warnings: [] };
    }

    const toolchain = this._toolchain ?? await this.detectToolchain();

    if (toolchain.detected === 'none') {
      return { ok: false, contracts: {}, errors: ['No toolchain detected'], warnings: [] };
    }

    // Local toolchain via bridge
    if (toolchain.detected === 'foundry' || toolchain.detected === 'hardhat') {
      return this.compileViaBridge(toolchain.detected);
    }

    // Browser solc-js fallback (placeholder — full implementation in a later chunk)
    if (toolchain.detected === 'browser-solcjs' || toolchain.detected === 'solc') {
      return {
        ok: false,
        contracts: {},
        errors: ['Browser solc-js compilation not yet implemented. Use Foundry or Hardhat.'],
        warnings: [],
      };
    }

    return { ok: false, contracts: {}, errors: [`Unknown toolchain: ${toolchain.detected}`], warnings: [] };
  }

  private async compileViaBridge(toolchain: string): Promise<CompilationResult> {
    const baseUrl = getSimulatorBridgeUrl();
    const res = await fetch(`${baseUrl}/compile`, {
      method: 'POST',
      headers: getBridgeHeaders(),
      body: JSON.stringify({ projectRoot: this._projectRoot, toolchain }),
    });
    const data = await res.json();
    return {
      ok: data.ok ?? false,
      contracts: data.contracts ?? {},
      errors: data.errors ?? [],
      warnings: data.warnings ?? [],
    };
  }
}
