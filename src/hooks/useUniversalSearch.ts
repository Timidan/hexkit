import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';

export type InputType =
  | 'address'
  | 'txhash'
  | 'selector'
  | 'signature'
  | 'calldata'
  | 'unknown'
  | 'empty';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  /** lucide-react icon name (rendered by the component) */
  icon: string;
  /** Which input types this tool accepts */
  accepts: InputType[];
  /** Handler called when the tool is selected */
  navigate: (input: string) => void;
}

export interface RecentSearch {
  query: string;
  inputType: InputType;
  toolId: string;
  toolName: string;
  timestamp: number;
}

export interface PageDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  keywords?: string[];
}

export interface UseUniversalSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  inputType: InputType;
  matchingTools: ToolDefinition[];
  executeTool: (toolId: string, inputOverride?: string) => void;
  reset: () => void;
  /** Recent searches from localStorage */
  recentSearches: RecentSearch[];
  clearRecentSearches: () => void;
  /** Static page definitions for command palette navigation */
  pages: PageDefinition[];
}

/** Regex for Solidity-style function/event signatures: name(type,type,...) */
const SIGNATURE_RE = /^[a-zA-Z_][a-zA-Z0-9_]*\(.*\)$/;

function detectInputType(input: string): InputType {
  const trimmed = input.trim();
  if (!trimmed) return 'empty';

  // Text signatures: transfer(address,uint256), etc.
  if (SIGNATURE_RE.test(trimmed)) return 'signature';

  // Hex-prefixed inputs
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    const hexBody = trimmed.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(hexBody)) return 'unknown';

    // Function selector: 0x + 8 hex chars = 10 total
    if (trimmed.length === 10) return 'selector';

    // Address: 0x + 40 hex chars = 42 total
    if (trimmed.length === 42) {
      try {
        if (ethers.utils.isAddress(trimmed)) return 'address';
      } catch {
        // isAddress threw — not a valid address
      }
    }

    // Transaction hash: 0x + 64 hex chars = 66 total
    if (trimmed.length === 66) return 'txhash';

    // Calldata: 0x + >8 hex chars (longer than a selector, not address/txhash length)
    if (hexBody.length > 8) return 'calldata';
  }

  return 'unknown';
}

const TXHASH_REPLAY_KEY = 'web3-toolkit:txhash-replay';
const TXHASH_REPLAY_EVENT = 'web3-toolkit:txhash-replay-updated';
const TXHASH_REPLAY_LAST_INTENT_KEY = 'web3-toolkit:txhash-replay-last-intent';
const RECENT_SEARCHES_KEY = 'web3-toolkit:recent-searches';
const MAX_RECENT_SEARCHES = 8;

function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(entry: RecentSearch): void {
  const existing = loadRecentSearches();
  // Dedupe by query+toolId
  const filtered = existing.filter(
    (s) => !(s.query === entry.query && s.toolId === entry.toolId),
  );
  const updated = [entry, ...filtered].slice(0, MAX_RECENT_SEARCHES);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

const pages: PageDefinition[] = [
  { id: 'page-sig-lookup', name: 'Signature Lookup', description: 'Look up function selectors and signatures', icon: 'Hash', route: '/database?tab=lookup' },
  { id: 'page-sig-search', name: 'Signature Search', description: 'Search the signature database', icon: 'Search', route: '/database?tab=search' },
  { id: 'page-sig-tools', name: 'Signature Tools', description: 'Hash and encode utilities', icon: 'Wrench', route: '/database?tab=tools' },
  { id: 'page-sig-custom', name: 'Custom ABI', description: 'Load custom ABI definitions', icon: 'FileText', route: '/database?tab=custom' },
  { id: 'page-sig-cache', name: 'Signature Cache', description: 'View cached signatures', icon: 'Database', route: '/database?tab=cache' },
  { id: 'page-live', name: 'Live Interaction', description: 'Call contract functions on-chain', icon: 'Zap', route: '/builder?mode=live' },
  { id: 'page-simulation', name: 'Simulation (EDB)', description: 'Simulate transactions with traces', icon: 'Play', route: '/builder?mode=simulation' },
  { id: 'page-explorer', name: 'Contract Explorer', description: 'View contract source and ABI', icon: 'Code2', route: '/explorer?tool=explorer' },
  { id: 'page-diff', name: 'Contract Diff', description: 'Compare contract bytecode', icon: 'GitCompare', route: '/explorer?tool=diff' },
  { id: 'page-storage', name: 'Storage Viewer', description: 'Inspect contract storage layout', icon: 'Database', route: '/explorer?tool=storage' },
  { id: 'page-history', name: 'Simulation History', description: 'View past simulation results', icon: 'RotateCcw', route: '/simulations', keywords: ['history', 'past', 'previous'] },
  { id: 'page-integrations', name: 'Integrations', description: 'Protocol integrations with yield vaults', icon: 'Layers', route: '/integrations', keywords: ['yield', 'earn', 'lifi', 'vault', 'defi'] },
  { id: 'page-lifi-earn', name: 'LI.FI Earn', description: 'Browse yield vaults and deposit', icon: 'Layers', route: '/integrations/lifi-earn', keywords: ['yield', 'earn', 'lifi', 'vault', 'apy', 'tvl'] },
];

export function useUniversalSearch(): UseUniversalSearchReturn {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(loadRecentSearches);

  const inputType = useMemo(() => detectInputType(query), [query]);

  const navigateToExplorer = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('tool', 'explorer');
      params.set('address', input);
      navigate(`/explorer?${params.toString()}`);
    },
    [navigate],
  );

  const navigateToExplorerDiff = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('address', input);
      params.set('tool', 'diff');
      navigate(`/explorer?${params.toString()}`);
    },
    [navigate],
  );

  const navigateToExplorerStorage = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('address', input);
      params.set('tool', 'storage');
      navigate(`/explorer?${params.toString()}`);
    },
    [navigate],
  );

  const navigateToLiveInteraction = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('mode', 'live');
      params.set('address', input);
      navigate(`/builder?${params.toString()}`);
    },
    [navigate],
  );

  const navigateToSimulation = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('address', input);
      params.set('mode', 'simulation');
      navigate(`/builder?${params.toString()}`);
    },
    [navigate],
  );

  const navigateToSelectorLookup = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('tab', 'lookup');
      params.set('tool', 'selector');
      params.set('q', input);
      navigate(`/database?${params.toString()}`);
    },
    [navigate],
  );

  const navigateToTextSignatureLookup = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('tab', 'lookup');
      params.set('tool', 'text');
      params.set('q', input);
      navigate(`/database?${params.toString()}`);
    },
    [navigate],
  );

  const navigateToCalldataDecode = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('tab', 'lookup');
      params.set('tool', 'calldata');
      params.set('q', input);
      navigate(`/database?${params.toString()}`);
    },
    [navigate],
  );

  const persistTxReplayIntent = useCallback((txHash: string, noAutoReplay = false) => {
    const replayData: Record<string, unknown> = {
      transactionHash: txHash,
      timestamp: Date.now(),
      noAutoReplay,
      source: 'universal-search',
    };
    localStorage.setItem(TXHASH_REPLAY_KEY, JSON.stringify(replayData));
    localStorage.setItem(
      TXHASH_REPLAY_LAST_INTENT_KEY,
      JSON.stringify({
        ...replayData,
        source: 'universal-search',
        recordedAt: Date.now(),
      }),
    );
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TXHASH_REPLAY_EVENT, { detail: replayData }));
    }
  }, []);

  const navigateToTxTrace = useCallback(
    (input: string) => {
      persistTxReplayIntent(input, false);
      const params = new URLSearchParams();
      params.set('mode', 'replay');
      params.set('replay', 'txhash');
      navigate(`/builder?${params.toString()}`);
    },
    [navigate, persistTxReplayIntent],
  );

  const navigateToTxReplay = useCallback(
    (input: string) => {
      persistTxReplayIntent(input, true);
      const params = new URLSearchParams();
      params.set('mode', 'replay');
      params.set('replay', 'txhash');
      navigate(`/builder?${params.toString()}`);
    },
    [navigate, persistTxReplayIntent],
  );

  const tools: ToolDefinition[] = useMemo(
    () => [
      // --- Address tools ---
      {
        id: 'explorer',
        name: 'Explorer',
        description: 'View contract source code and ABI',
        icon: 'Code2',
        accepts: ['address'],
        navigate: navigateToExplorer,
      },
      {
        id: 'contract-diff',
        name: 'Contract Diff',
        description: 'Compare bytecode between contracts',
        icon: 'GitCompare',
        accepts: ['address'],
        navigate: navigateToExplorerDiff,
      },
      {
        id: 'storage-inspection',
        name: 'Storage Inspection',
        description: 'View storage layout and slot values',
        icon: 'Database',
        accepts: ['address'],
        navigate: navigateToExplorerStorage,
      },
      {
        id: 'live-interaction',
        name: 'Live Interaction',
        description: 'Call functions on the contract',
        icon: 'Play',
        accepts: ['address'],
        navigate: navigateToLiveInteraction,
      },
      {
        id: 'simulation',
        name: 'Simulation',
        description: 'Simulate transactions against the contract',
        icon: 'Zap',
        accepts: ['address'],
        navigate: navigateToSimulation,
      },
      // --- Selector tools ---
      {
        id: 'selector-lookup',
        name: 'Selector Lookup',
        description: 'Resolve 4-byte selector to function signature',
        icon: 'Hash',
        accepts: ['selector'],
        navigate: navigateToSelectorLookup,
      },
      // --- Signature tools ---
      {
        id: 'signature-lookup',
        name: 'Signature Lookup',
        description: 'Look up function/event by text signature',
        icon: 'Hash',
        accepts: ['signature'],
        navigate: navigateToTextSignatureLookup,
      },
      // --- Calldata tools ---
      {
        id: 'calldata-decode',
        name: 'Decode Calldata',
        description: 'Decode raw calldata into function call',
        icon: 'ListTree',
        accepts: ['calldata'],
        navigate: navigateToCalldataDecode,
      },
      // --- Transaction hash tools ---
      {
        id: 'tx-trace',
        name: 'Transaction Trace',
        description: 'Auto-run replay and open the execution trace',
        icon: 'ListTree',
        accepts: ['txhash'],
        navigate: navigateToTxTrace,
      },
      {
        id: 'tx-replay',
        name: 'Transaction Replay',
        description: 'Prefill replay form and run manually',
        icon: 'RotateCcw',
        accepts: ['txhash'],
        navigate: navigateToTxReplay,
      },
    ],
    [
      navigateToExplorer,
      navigateToExplorerDiff,
      navigateToExplorerStorage,
      navigateToLiveInteraction,
      navigateToSimulation,
      navigateToSelectorLookup,
      navigateToTextSignatureLookup,
      navigateToCalldataDecode,
      navigateToTxTrace,
      navigateToTxReplay,
    ],
  );

  const matchingTools = useMemo(() => {
    if (inputType === 'empty' || inputType === 'unknown') return [];
    return tools.filter((t) => t.accepts.includes(inputType));
  }, [inputType, tools]);

  const getEffectiveInput = useCallback((): string => {
    return query.trim();
  }, [query]);

  const addToRecentSearches = useCallback(
    (toolId: string, toolName: string, queryOverride?: string) => {
      const effectiveQuery = (queryOverride ?? query).trim();
      const effectiveType = queryOverride ? detectInputType(queryOverride) : inputType;
      const entry: RecentSearch = {
        query: effectiveQuery,
        inputType: effectiveType,
        toolId,
        toolName,
        timestamp: Date.now(),
      };
      saveRecentSearch(entry);
      setRecentSearches(loadRecentSearches());
    },
    [query, inputType],
  );

  const executeTool = useCallback(
    (toolId: string, inputOverride?: string) => {
      const tool = tools.find((t) => t.id === toolId);
      if (tool) {
        const input = inputOverride?.trim() ?? getEffectiveInput();
        addToRecentSearches(tool.id, tool.name, inputOverride);
        tool.navigate(input);
      }
    },
    [tools, getEffectiveInput, addToRecentSearches],
  );

  const reset = useCallback(() => {
    setQuery('');
  }, []);

  const clearRecentSearches = useCallback(() => {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  }, []);

  return {
    query,
    setQuery,
    inputType,
    matchingTools,
    executeTool,
    reset,
    recentSearches,
    clearRecentSearches,
    pages,
  };
}
