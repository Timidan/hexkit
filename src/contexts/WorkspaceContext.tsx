import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { ChainManager } from '@/services/workspace/ChainManager';
import { FileAccessService } from '@/services/workspace/FileAccessService';
import { WorkspaceStorageService } from '@/services/workspace/WorkspaceStorageService';
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

  // Compilation
  artifacts: CompilationArtifact[];
  isCompiling: boolean;
  compilationErrors: string[];

  // Deployed contracts
  deployedContracts: DeployedContract[];

  // Snapshots
  snapshots: NamedSnapshot[];

  // Watches
  watches: WatchExpression[];

  // Actions
  connectToNode: (rpcUrl: string) => Promise<void>;
  autoDetectNode: () => Promise<boolean>;
  disconnect: () => void;
  openProject: () => Promise<void>;
  addDeployedContract: (contract: DeployedContract) => void;
  addSnapshot: (snapshot: NamedSnapshot) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const chainManagerRef = useRef(new ChainManager());
  const fileServiceRef = useRef(new FileAccessService());
  const storageRef = useRef(new WorkspaceStorageService());

  const [isConnected, setIsConnected] = useState(false);
  const [nodeType, setNodeType] = useState<NodeBackend | null>(null);
  const [chainInfo, setChainInfo] = useState<ChainInfo | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [rpcUrl, setRpcUrl] = useState<string | null>(null);

  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);

  const [artifacts, setArtifacts] = useState<CompilationArtifact[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationErrors, setCompilationErrors] = useState<string[]>([]);

  const [deployedContracts, setDeployedContracts] = useState<DeployedContract[]>([]);
  const [snapshots, setSnapshots] = useState<NamedSnapshot[]>([]);
  const [watches, setWatches] = useState<WatchExpression[]>([]);

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

  const connectToNode = useCallback(async (url: string) => {
    const result = await chainManagerRef.current.connect(url);
    setIsConnected(true);
    setNodeType(result.type);
    setRpcUrl(url);
    setChainInfo(chainManagerRef.current.chainInfo);

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
    });
  }, []);

  const autoDetectNode = useCallback(async () => {
    const result = await chainManagerRef.current.autoDetect();
    if (result) {
      setIsConnected(true);
      setNodeType(result.type);
      setRpcUrl(chainManagerRef.current.rpcUrl);
      setChainInfo(chainManagerRef.current.chainInfo);

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
      });

      return true;
    }
    return false;
  }, []);

  const disconnect = useCallback(() => {
    chainManagerRef.current.disconnect();
    setIsConnected(false);
    setNodeType(null);
    setChainInfo(null);
    setAccounts([]);
    setRpcUrl(null);
  }, []);

  const openProject = useCallback(async () => {
    const { tree, projectRoot: root } = await fileServiceRef.current.openProject();
    setFileTree(tree);
    setProjectRoot(root);
  }, []);

  const addDeployedContract = useCallback((contract: DeployedContract) => {
    setDeployedContracts((prev) => [...prev, contract]);
    storageRef.current.saveDeployedContract(contract);
  }, []);

  const addSnapshot = useCallback((snapshot: NamedSnapshot) => {
    setSnapshots((prev) => [...prev, snapshot]);
  }, []);

  const value: WorkspaceContextValue = {
    isConnected, nodeType, chainInfo, accounts, rpcUrl,
    fileTree, projectRoot,
    artifacts, isCompiling, compilationErrors,
    deployedContracts, snapshots, watches,
    connectToNode, autoDetectNode, disconnect, openProject,
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
