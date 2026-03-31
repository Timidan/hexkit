import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { ChainManager } from '@/services/workspace/ChainManager';
import { FileAccessService } from '@/services/workspace/FileAccessService';
import { WorkspaceStorageService } from '@/services/workspace/WorkspaceStorageService';
import { CompilationService } from '@/services/workspace/CompilationService';
import type {
  ChainInfo,
  AccountInfo,
  DeployedContract,
  CompilationArtifact,
  NamedSnapshot,
  WatchExpression,
  NodeBackend,
} from '@/services/workspace/types';
import type { FileNode } from '@/services/workspace/FileAccessService';

export interface ConsoleEntry {
  id: string;
  type: 'info' | 'error' | 'warning' | 'success';
  message: string;
  timestamp: number;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
}

interface WorkspaceContextValue {
  // Connection state
  isConnected: boolean;
  nodeType: NodeBackend | null;
  chainInfo: ChainInfo | null;
  accounts: AccountInfo[];
  rpcUrl: string | null;

  // File state
  fileTree: FileNode[];
  projectRoot: string | null;
  openFiles: OpenFile[];
  activeFile: OpenFile | null;

  // Compilation
  artifacts: CompilationArtifact[];
  isCompiling: boolean;
  compilationErrors: string[];

  // Deployed contracts
  deployedContracts: DeployedContract[];
  isDeploying: boolean;

  // Snapshots
  snapshots: NamedSnapshot[];

  // Watches
  watches: WatchExpression[];

  // Console
  consoleLogs: ConsoleEntry[];

  // Actions
  connectToNode: (rpcUrl: string) => Promise<void>;
  autoDetectNode: () => Promise<boolean>;
  disconnect: () => void;
  openProject: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  setActiveFilePath: (path: string) => void;
  readFile: (path: string) => Promise<string>;
  compile: () => Promise<void>;
  deploy: (contractName: string) => Promise<void>;
  callContract: (address: string, abi: unknown[], functionName: string, args: unknown[]) => Promise<unknown>;
  sendTransaction: (address: string, abi: unknown[], functionName: string, args: unknown[]) => Promise<string>;
  clearConsole: () => void;
  addDeployedContract: (contract: DeployedContract) => void;
  addSnapshot: (snapshot: NamedSnapshot) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function detectLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    sol: 'solidity', ts: 'typescript', tsx: 'typescript', js: 'javascript',
    jsx: 'javascript', json: 'json', md: 'markdown', toml: 'toml',
    yaml: 'yaml', yml: 'yaml', txt: 'text', rs: 'rust', py: 'python',
  };
  return map[ext] ?? 'text';
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const chainManagerRef = useRef(new ChainManager());
  const fileServiceRef = useRef(new FileAccessService());
  const storageRef = useRef(new WorkspaceStorageService());
  const compilationServiceRef = useRef(new CompilationService());

  const [isConnected, setIsConnected] = useState(false);
  const [nodeType, setNodeType] = useState<NodeBackend | null>(null);
  const [chainInfo, setChainInfo] = useState<ChainInfo | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [rpcUrl, setRpcUrl] = useState<string | null>(null);

  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<OpenFile | null>(null);

  const [artifacts, setArtifacts] = useState<CompilationArtifact[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationErrors, setCompilationErrors] = useState<string[]>([]);

  const [deployedContracts, setDeployedContracts] = useState<DeployedContract[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [snapshots, setSnapshots] = useState<NamedSnapshot[]>([]);
  const [watches, setWatches] = useState<WatchExpression[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);

  // Load persisted state on mount; cleanup on unmount
  useEffect(() => {
    (async () => {
      const contracts = await storageRef.current.getDeployedContracts();
      setDeployedContracts(contracts as DeployedContract[]);
      const arts = await storageRef.current.getArtifacts();
      setArtifacts(arts as CompilationArtifact[]);
    })();

    return () => {
      chainManagerRef.current.disconnect();
      fileServiceRef.current.close();
    };
  }, []);

  // Fetch accounts + balances from the connected node
  const fetchAccounts = useCallback(async () => {
    try {
      const addrs = await chainManagerRef.current.bridgeRpc<string[]>('eth_accounts');
      if (!addrs || addrs.length === 0) {
        setAccounts([]);
        return;
      }
      const infos: AccountInfo[] = await Promise.all(
        addrs.map(async (address) => {
          let balance = BigInt(0);
          let nonce = 0;
          try {
            const balHex = await chainManagerRef.current.bridgeRpc<string>('eth_getBalance', [address, 'latest']);
            balance = BigInt(balHex);
            const nonceHex = await chainManagerRef.current.bridgeRpc<string>('eth_getTransactionCount', [address, 'latest']);
            nonce = parseInt(nonceHex, 16);
          } catch { /* balance/nonce fetch failed, use defaults */ }
          return { address, balance, nonce, isImpersonated: false };
        }),
      );
      setAccounts(infos);
    } catch {
      setAccounts([]);
    }
  }, []);

  const setupChainListeners = useCallback(() => {
    chainManagerRef.current.on('chainUpdate', (info) => {
      if (info) setChainInfo(info);
    });
    chainManagerRef.current.on('disconnect', () => {
      setIsConnected(false);
      setNodeType(null);
      setChainInfo(null);
      setAccounts([]);
      setRpcUrl(null);
    });
    chainManagerRef.current.on('reconnect', () => {
      setIsConnected(true);
      fetchAccounts();
    });
  }, [fetchAccounts]);

  const connectToNode = useCallback(async (url: string) => {
    const result = await chainManagerRef.current.connect(url);
    setIsConnected(true);
    setNodeType(result.type);
    setRpcUrl(url);
    setChainInfo(chainManagerRef.current.chainInfo);
    setupChainListeners();
    await fetchAccounts();
  }, [fetchAccounts, setupChainListeners]);

  const autoDetectNode = useCallback(async () => {
    const result = await chainManagerRef.current.autoDetect();
    if (result) {
      setIsConnected(true);
      setNodeType(result.type);
      setRpcUrl(chainManagerRef.current.rpcUrl);
      setChainInfo(chainManagerRef.current.chainInfo);
      setupChainListeners();
      await fetchAccounts();
      return true;
    }
    return false;
  }, [fetchAccounts, setupChainListeners]);

  const disconnect = useCallback(() => {
    chainManagerRef.current.disconnect();
    setIsConnected(false);
    setNodeType(null);
    setChainInfo(null);
    setAccounts([]);
    setRpcUrl(null);
  }, []);

  const openProjectCb = useCallback(async () => {
    const { tree, projectRoot: root } = await fileServiceRef.current.openProject();
    setFileTree(tree);
    setProjectRoot(root);
  }, []);

  const readFile = useCallback(async (path: string): Promise<string> => {
    return fileServiceRef.current.readFile(path);
  }, []);

  const openFileCb = useCallback(async (path: string) => {
    // Check if already open
    setOpenFiles((prev) => {
      const existing = prev.find((f) => f.path === path);
      if (existing) {
        setActiveFile(existing);
        return prev;
      }
      return prev; // will be updated below
    });

    // Read and add if not already open
    const content = await fileServiceRef.current.readFile(path);
    const name = path.split('/').pop() ?? path;
    const file: OpenFile = { path, name, content, language: detectLanguage(name) };

    setOpenFiles((prev) => {
      if (prev.find((f) => f.path === path)) {
        setActiveFile(prev.find((f) => f.path === path)!);
        return prev;
      }
      return [...prev, file];
    });
    setActiveFile(file);
  }, []);

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      setActiveFile((curr) => {
        if (curr?.path === path) {
          return next.length > 0 ? next[next.length - 1] : null;
        }
        return curr;
      });
      return next;
    });
  }, []);

  const setActiveFilePath = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const file = prev.find((f) => f.path === path);
      if (file) setActiveFile(file);
      return prev;
    });
  }, []);

  const addDeployedContract = useCallback((contract: DeployedContract) => {
    setDeployedContracts((prev) => [...prev, contract]);
    storageRef.current.saveDeployedContract(contract);
  }, []);

  const addSnapshot = useCallback((snapshot: NamedSnapshot) => {
    setSnapshots((prev) => [...prev, snapshot]);
  }, []);

  // Console log helper
  const pushLog = useCallback((type: ConsoleEntry['type'], message: string) => {
    setConsoleLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, message, timestamp: Date.now() },
    ]);
  }, []);

  const clearConsole = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  // Compile action — strategy depends on file access backend:
  //   FS API  → scan existing artifacts from out/ (Foundry) or artifacts/ (Hardhat)
  //   Bridge  → invoke real compilation via bridge server (has the real filesystem path)
  const compile = useCallback(async () => {
    if (!projectRoot) {
      pushLog('error', 'No project open. Use "Open Project" to select a folder first.');
      return;
    }

    setIsCompiling(true);
    setCompilationErrors([]);
    const backend = fileServiceRef.current.activeBackend;

    try {
      if (backend === 'fsapi') {
        // Scan pre-compiled artifacts directly from the directory handle
        pushLog('info', `Scanning artifacts in ${projectRoot}...`);
        const { toolchain, artifacts: scanned } = await fileServiceRef.current.scanLocalArtifacts();

        if (toolchain === 'none') {
          pushLog('error', 'No toolchain detected (missing foundry.toml or hardhat.config).');
          setCompilationErrors(['No toolchain detected. Ensure the project has a foundry.toml or hardhat.config file.']);
          return;
        }

        pushLog('info', `Toolchain: ${toolchain}`);

        if (scanned.length === 0) {
          const cmd = toolchain === 'foundry' ? 'forge build' : 'npx hardhat compile';
          pushLog('error', `No compiled artifacts found. Run \`${cmd}\` in your terminal first, then click Compile again.`);
          setCompilationErrors([`No artifacts in ${toolchain === 'foundry' ? 'out/' : 'artifacts/'}. Run \`${cmd}\` first.`]);
          return;
        }

        setArtifacts(scanned);
        for (const a of scanned) storageRef.current.saveArtifact(a);
        pushLog('success', `Loaded ${scanned.length} contract${scanned.length !== 1 ? 's' : ''} from ${toolchain === 'foundry' ? 'out/' : 'artifacts/'}`);
      } else {
        // Bridge backend — invoke real compilation (bridge has the full filesystem path)
        compilationServiceRef.current.projectRoot = projectRoot;
        pushLog('info', `Compiling project: ${projectRoot}`);

        const toolchain = await compilationServiceRef.current.detectToolchain();
        pushLog('info', `Toolchain detected: ${toolchain.detected}${toolchain.version ? ` v${toolchain.version}` : ''}`);

        const result = await compilationServiceRef.current.compile();

        if (result.warnings.length > 0) {
          result.warnings.forEach((w) => pushLog('warning', w));
        }

        if (result.ok) {
          const newArtifacts: CompilationArtifact[] = Object.entries(result.contracts).map(
            ([name, data]) => ({ contractName: name, ...(data as Omit<CompilationArtifact, 'contractName'>) }),
          );
          setArtifacts(newArtifacts);
          for (const a of newArtifacts) storageRef.current.saveArtifact(a);
          pushLog('success', `Compilation succeeded — ${newArtifacts.length} contract${newArtifacts.length !== 1 ? 's' : ''} compiled`);
        } else {
          setCompilationErrors(result.errors);
          result.errors.forEach((e) => pushLog('error', e));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCompilationErrors([msg]);
      pushLog('error', `Compilation failed: ${msg}`);
    } finally {
      setIsCompiling(false);
    }
  }, [projectRoot, pushLog]);

  // Deploy action
  const deploy = useCallback(async (contractName: string) => {
    if (!chainManagerRef.current.isConnected) {
      pushLog('error', 'Not connected to a chain. Connect first via Chain Control panel.');
      return;
    }
    if (isDeploying) return;

    const artifact = artifacts.find((a) => a.contractName === contractName);
    if (!artifact) {
      pushLog('error', `No compiled artifact found for "${contractName}". Compile first.`);
      return;
    }

    setIsDeploying(true);
    pushLog('info', `Deploying ${contractName}...`);

    try {
      const accountsHex = await chainManagerRef.current.bridgeRpc<string[]>('eth_accounts');
      if (!accountsHex || accountsHex.length === 0) {
        pushLog('error', 'No accounts available on connected node.');
        return;
      }
      const deployer = accountsHex[0];

      // Ensure bytecode has 0x prefix
      const bytecode = artifact.bytecode.startsWith('0x') ? artifact.bytecode : `0x${artifact.bytecode}`;

      const txHash = await chainManagerRef.current.bridgeRpc<string>('eth_sendTransaction', [{
        from: deployer,
        data: bytecode,
        gas: '0x1c9c380',
      }]);

      pushLog('info', `Tx sent: ${txHash}`);

      const receipt = await chainManagerRef.current.bridgeRpc<{
        contractAddress: string;
        blockNumber: string;
        status: string;
      }>('eth_getTransactionReceipt', [txHash]);

      if (!receipt || receipt.status === '0x0') {
        pushLog('error', `Deploy transaction reverted: ${txHash}`);
        return;
      }

      const deployed: DeployedContract = {
        name: contractName,
        address: receipt.contractAddress,
        abi: artifact.abi,
        bytecode,
        deployTxHash: txHash,
        deployBlock: parseInt(receipt.blockNumber, 16),
        sourceFile: artifact.sourceFile,
      };

      addDeployedContract(deployed);
      pushLog('success', `${contractName} deployed at ${receipt.contractAddress} (block #${deployed.deployBlock})`);

      // Refresh accounts (balances changed after deploy)
      await fetchAccounts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog('error', `Deploy failed: ${msg}`);
    } finally {
      setIsDeploying(false);
    }
  }, [artifacts, isDeploying, pushLog, addDeployedContract, fetchAccounts]);

  // Call a read-only (view/pure) function on a deployed contract
  const callContract = useCallback(async (
    address: string, abi: unknown[], functionName: string, args: unknown[],
  ): Promise<unknown> => {
    // Find the function ABI entry
    const fnAbi = (abi as { name?: string; type?: string; inputs?: { type: string }[]; outputs?: { type: string }[] }[])
      .find((e) => e.type === 'function' && e.name === functionName);
    if (!fnAbi) throw new Error(`Function "${functionName}" not found in ABI`);

    // Encode call data: selector + encoded args
    const selector = encodeFunctionSelector(functionName, fnAbi.inputs?.map((i) => i.type) ?? []);
    const encodedArgs = encodeArgs(fnAbi.inputs?.map((i) => i.type) ?? [], args);
    const data = selector + encodedArgs;

    const result = await chainManagerRef.current.bridgeRpc<string>('eth_call', [
      { to: address, data },
      'latest',
    ]);

    // Decode return value
    const outputTypes = fnAbi.outputs?.map((o) => o.type) ?? [];
    if (outputTypes.length === 0) return null;
    return decodeResult(outputTypes, result);
  }, []);

  // Send a state-changing transaction to a deployed contract
  const sendTransaction = useCallback(async (
    address: string, abi: unknown[], functionName: string, args: unknown[],
  ): Promise<string> => {
    const fnAbi = (abi as { name?: string; type?: string; inputs?: { type: string }[] }[])
      .find((e) => e.type === 'function' && e.name === functionName);
    if (!fnAbi) throw new Error(`Function "${functionName}" not found in ABI`);

    const selector = encodeFunctionSelector(functionName, fnAbi.inputs?.map((i) => i.type) ?? []);
    const encodedArgs = encodeArgs(fnAbi.inputs?.map((i) => i.type) ?? [], args);
    const data = selector + encodedArgs;

    const accountsHex = await chainManagerRef.current.bridgeRpc<string[]>('eth_accounts');
    if (!accountsHex || accountsHex.length === 0) throw new Error('No accounts available');

    const txHash = await chainManagerRef.current.bridgeRpc<string>('eth_sendTransaction', [{
      from: accountsHex[0],
      to: address,
      data,
      gas: '0x1c9c380',
    }]);

    pushLog('info', `${functionName}() tx: ${txHash}`);

    const receipt = await chainManagerRef.current.bridgeRpc<{ status: string }>('eth_getTransactionReceipt', [txHash]);
    if (!receipt || receipt.status === '0x0') {
      pushLog('error', `${functionName}() reverted`);
      throw new Error('Transaction reverted');
    }

    pushLog('success', `${functionName}() confirmed`);
    await fetchAccounts();
    return txHash;
  }, [pushLog, fetchAccounts]);

  const value: WorkspaceContextValue = {
    isConnected, nodeType, chainInfo, accounts, rpcUrl,
    fileTree, projectRoot, openFiles, activeFile,
    artifacts, isCompiling, compilationErrors,
    deployedContracts, isDeploying, snapshots, watches, consoleLogs,
    connectToNode, autoDetectNode, disconnect,
    openProject: openProjectCb, openFile: openFileCb, closeFile, setActiveFilePath, readFile,
    compile, deploy, callContract, sendTransaction, clearConsole,
    addDeployedContract, addSnapshot,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

// ── Minimal ABI encoding helpers (no external deps) ───────────────────
// These handle the common Solidity types used in local dev (uint256, address, bool, string, bytes).
// For production use, replace with viem or ethers.js ABI coder.

function encodeFunctionSelector(name: string, inputTypes: string[]): string {
  const sig = `${name}(${inputTypes.join(',')})`;
  const bytes = keccak256Tiny(new TextEncoder().encode(sig));
  return '0x' + Array.from(bytes.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function encodeArgs(types: string[], values: unknown[]): string {
  let result = '';
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const v = values[i];
    if (t === 'address') {
      result += padLeft(String(v).replace('0x', ''), 64);
    } else if (t === 'bool') {
      result += padLeft(v ? '1' : '0', 64);
    } else if (t.startsWith('uint') || t.startsWith('int')) {
      const n = BigInt(v as string | number | bigint);
      result += padLeft(n.toString(16), 64);
    } else if (t === 'bytes32') {
      result += padRight(String(v).replace('0x', ''), 64);
    } else if (t === 'string' || t === 'bytes') {
      // Dynamic types: offset → length → data
      // For simplicity in local dev, encode inline
      const str = typeof v === 'string' ? v : '';
      const hex = Array.from(new TextEncoder().encode(str)).map((b) => b.toString(16).padStart(2, '0')).join('');
      const lenHex = padLeft((hex.length / 2).toString(16), 64);
      const dataHex = padRight(hex, Math.ceil(hex.length / 64) * 64);
      // Offset pointing to data
      const offset = types.length * 32;
      result += padLeft(offset.toString(16), 64);
      // Append length + data at end (simplified — works for single dynamic arg)
      result += lenHex + dataHex;
    } else {
      // Fallback: treat as uint256
      result += padLeft(BigInt(v as string | number | bigint).toString(16), 64);
    }
  }
  return result;
}

function decodeResult(types: string[], hex: string): unknown {
  const data = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (data.length === 0) return null;
  if (types.length === 1) {
    return decodeSingle(types[0], data, 0);
  }
  return types.map((t, i) => decodeSingle(t, data, i * 64));
}

function decodeSingle(type: string, data: string, offset: number): unknown {
  const word = data.slice(offset, offset + 64);
  if (type === 'address') return '0x' + word.slice(24);
  if (type === 'bool') return word !== '0'.repeat(64);
  if (type.startsWith('uint')) return BigInt('0x' + (word || '0')).toString();
  if (type.startsWith('int')) {
    const n = BigInt('0x' + (word || '0'));
    const max = BigInt(1) << BigInt(255);
    return (n >= max ? n - (BigInt(1) << BigInt(256)) : n).toString();
  }
  if (type === 'bytes32') return '0x' + word;
  if (type === 'string') {
    const dataOffset = parseInt(word, 16) * 2;
    const len = parseInt(data.slice(dataOffset, dataOffset + 64), 16);
    const strHex = data.slice(dataOffset + 64, dataOffset + 64 + len * 2);
    return hexToUtf8(strHex);
  }
  return '0x' + word;
}

function padLeft(s: string, len: number): string { return s.padStart(len, '0'); }
function padRight(s: string, len: number): string { return s.padEnd(len, '0'); }
function hexToUtf8(hex: string): string {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// Tiny Keccak-256 (FIPS 202 / SHA-3) — minimal implementation for function selectors.
// Only used to compute 4-byte selectors; not for cryptographic security.
function keccak256Tiny(input: Uint8Array): Uint8Array {
  const RATE = 136;
  const ROUNDS = 24;

  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];

  // State as 5x5 array of u64
  const state: bigint[][] = Array.from({ length: 5 }, () => Array(5).fill(0n));

  // Pad input (keccak padding: 0x01 ... 0x80)
  const padded = new Uint8Array(Math.ceil((input.length + 1) / RATE) * RATE);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  // Absorb
  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      const x = i % 5;
      const y = Math.floor(i / 5);
      let lane = 0n;
      for (let b = 0; b < 8; b++) {
        lane |= BigInt(padded[offset + i * 8 + b]) << BigInt(b * 8);
      }
      state[x][y] ^= lane;
    }
    keccakF(state, RC, ROUNDS);
  }

  // Squeeze (only need 32 bytes)
  const output = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    const x = i % 5;
    const y = Math.floor(i / 5);
    const lane = state[x][y];
    for (let b = 0; b < 8; b++) {
      output[i * 8 + b] = Number((lane >> BigInt(b * 8)) & 0xffn);
    }
  }
  return output;
}

function keccakF(state: bigint[][], RC: bigint[], rounds: number) {
  const rotOffset = [
    [0, 1, 62, 28, 27], [36, 44, 6, 55, 20], [3, 10, 43, 25, 39],
    [41, 45, 15, 21, 8], [18, 2, 61, 56, 14],
  ];
  const mask64 = (1n << 64n) - 1n;
  const rot64 = (x: bigint, n: number) => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & mask64;

  for (let round = 0; round < rounds; round++) {
    // θ
    const C = Array(5).fill(0n);
    for (let x = 0; x < 5; x++) {
      C[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4];
    }
    for (let x = 0; x < 5; x++) {
      const d = C[(x + 4) % 5] ^ rot64(C[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) state[x][y] = (state[x][y] ^ d) & mask64;
    }
    // ρ and π
    const B: bigint[][] = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y][(2 * x + 3 * y) % 5] = rot64(state[x][y], rotOffset[x][y]);
      }
    }
    // χ
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x][y] = (B[x][y] ^ ((~B[(x + 1) % 5][y] & mask64) & B[(x + 2) % 5][y])) & mask64;
      }
    }
    // ι
    state[0][0] = (state[0][0] ^ RC[round]) & mask64;
  }
}
