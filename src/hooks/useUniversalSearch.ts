import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { familyHasCapability, type ChainCapability } from '@/chains/capabilities';
import { useActiveChainFamily } from './useActiveChainFamily';
import { buildFamilyPath } from '@/routes/familyRoutes';

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
  /** Capability required for the active chain family. */
  capability: ChainCapability;
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
  capability: ChainCapability;
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

const PAGE_DEFINITIONS: PageDefinition[] = [
  { id: 'page-sig-lookup', name: 'Signature Lookup', description: 'Look up function selectors and signatures', icon: 'Hash', route: '/database?tab=lookup', capability: 'signature-tools' },
  { id: 'page-sig-search', name: 'Signature Search', description: 'Search the signature database', icon: 'Search', route: '/database?tab=search', capability: 'signature-tools' },
  { id: 'page-sig-tools', name: 'Signature Tools', description: 'Hash and encode utilities', icon: 'Wrench', route: '/database?tab=tools', capability: 'signature-tools' },
  { id: 'page-sig-custom', name: 'Custom ABI', description: 'Load custom ABI definitions', icon: 'FileText', route: '/database?tab=custom', capability: 'signature-tools' },
  { id: 'page-sig-cache', name: 'Signature Cache', description: 'View cached signatures', icon: 'Database', route: '/database?tab=cache', capability: 'signature-tools' },
  { id: 'page-live', name: 'Live Interaction', description: 'Build contract interactions', icon: 'Zap', route: '/builder?mode=live', capability: 'tx-builder' },
  { id: 'page-simulation', name: 'Simulation', description: 'Simulate transactions with traces', icon: 'Play', route: '/builder?mode=simulation', capability: 'simulation' },
  { id: 'page-explorer', name: 'Contract Explorer', description: 'View contract source and ABI', icon: 'Code2', route: '/explorer?tool=explorer', capability: 'source-lookup' },
  { id: 'page-diff', name: 'Contract Diff', description: 'Compare contract bytecode', icon: 'GitCompare', route: '/explorer?tool=diff', capability: 'bytecode-diff' },
  { id: 'page-storage', name: 'Storage Viewer', description: 'Inspect contract storage layout', icon: 'Database', route: '/explorer?tool=storage', capability: 'storage-layout' },
  { id: 'page-history', name: 'Simulation History', description: 'View past simulation results', icon: 'RotateCcw', route: '/simulations', capability: 'simulation', keywords: ['history', 'past', 'previous'] },
  { id: 'page-integrations', name: 'Integrations', description: 'Protocol integrations with yield vaults', icon: 'Layers', route: '/integrations', capability: 'earn', keywords: ['yield', 'earn', 'lifi', 'vault', 'defi'] },
  { id: 'page-lifi-earn', name: 'LI.FI Earn', description: 'Browse yield vaults and deposit', icon: 'Layers', route: '/integrations/lifi-earn', capability: 'earn', keywords: ['yield', 'earn', 'lifi', 'vault', 'apy', 'tvl'] },
];

export function useUniversalSearch(): UseUniversalSearchReturn {
  const navigate = useNavigate();
  const activeFamily = useActiveChainFamily();
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(loadRecentSearches);

  const inputType = useMemo(() => detectInputType(query), [query]);
  const pages = useMemo(
    () =>
      PAGE_DEFINITIONS
        .filter((page) => familyHasCapability(activeFamily, page.capability))
        .map((page) => ({
          ...page,
          route: buildFamilyPath(activeFamily, page.route),
        })),
    [activeFamily],
  );

  const navigateToExplorer = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('tool', 'explorer');
      params.set('address', input);
      navigate(`${buildFamilyPath(activeFamily, '/explorer')}?${params.toString()}`);
    },
    [activeFamily, navigate],
  );

  const navigateToExplorerDiff = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('address', input);
      params.set('tool', 'diff');
      navigate(`${buildFamilyPath(activeFamily, '/explorer')}?${params.toString()}`);
    },
    [activeFamily, navigate],
  );

  const navigateToExplorerStorage = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('address', input);
      params.set('tool', 'storage');
      navigate(`${buildFamilyPath(activeFamily, '/explorer')}?${params.toString()}`);
    },
    [activeFamily, navigate],
  );

  const navigateToLiveInteraction = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('mode', 'live');
      params.set('address', input);
      navigate(`${buildFamilyPath(activeFamily, '/builder')}?${params.toString()}`);
    },
    [activeFamily, navigate],
  );

  const navigateToSimulation = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('address', input);
      params.set('mode', 'simulation');
      navigate(`${buildFamilyPath(activeFamily, '/builder')}?${params.toString()}`);
    },
    [activeFamily, navigate],
  );

  const navigateToSelectorLookup = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('tab', 'lookup');
      params.set('tool', 'selector');
      params.set('q', input);
      navigate(`${buildFamilyPath(activeFamily, '/database')}?${params.toString()}`);
    },
    [activeFamily, navigate],
  );

  const navigateToTextSignatureLookup = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('tab', 'lookup');
      params.set('tool', 'text');
      params.set('q', input);
      navigate(`${buildFamilyPath(activeFamily, '/database')}?${params.toString()}`);
    },
    [activeFamily, navigate],
  );

  const navigateToCalldataDecode = useCallback(
    (input: string) => {
      const params = new URLSearchParams();
      params.set('tab', 'lookup');
      params.set('tool', 'calldata');
      params.set('q', input);
      navigate(`${buildFamilyPath(activeFamily, '/database')}?${params.toString()}`);
    },
    [activeFamily, navigate],
  );

  const persistTxReplayIntent = useCallback((txHash: string, noAutoReplay = false) => {
    const networkId = 1;
    const replayData = {
      transactionHash: txHash,
      networkId,
      chainId: networkId,
      networkName: `Chain ${networkId}`,
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
      navigate(`${buildFamilyPath(activeFamily, '/builder')}?${params.toString()}`);
    },
    [activeFamily, navigate, persistTxReplayIntent],
  );

  const navigateToTxReplay = useCallback(
    (input: string) => {
      persistTxReplayIntent(input, true);
      const params = new URLSearchParams();
      params.set('mode', 'replay');
      params.set('replay', 'txhash');
      navigate(`${buildFamilyPath(activeFamily, '/builder')}?${params.toString()}`);
    },
    [activeFamily, navigate, persistTxReplayIntent],
  );

  const tools: ToolDefinition[] = useMemo(
    () => [
      // --- Address tools ---
      {
        id: 'explorer',
        name: 'Explorer',
        description: 'View contract source code and ABI',
        icon: 'Code2',
        capability: 'source-lookup',
        accepts: ['address'],
        navigate: navigateToExplorer,
      },
      {
        id: 'contract-diff',
        name: 'Contract Diff',
        description: 'Compare bytecode between contracts',
        icon: 'GitCompare',
        capability: 'bytecode-diff',
        accepts: ['address'],
        navigate: navigateToExplorerDiff,
      },
      {
        id: 'storage-inspection',
        name: 'Storage Inspection',
        description: 'View storage layout and slot values',
        icon: 'Database',
        capability: 'storage-layout',
        accepts: ['address'],
        navigate: navigateToExplorerStorage,
      },
      {
        id: 'live-interaction',
        name: 'Live Interaction',
        description: 'Call functions on the contract',
        icon: 'Play',
        capability: 'tx-builder',
        accepts: ['address'],
        navigate: navigateToLiveInteraction,
      },
      {
        id: 'simulation',
        name: 'Simulation',
        description: 'Simulate transactions against the contract',
        icon: 'Zap',
        capability: 'simulation',
        accepts: ['address'],
        navigate: navigateToSimulation,
      },
      // --- Selector tools ---
      {
        id: 'selector-lookup',
        name: 'Selector Lookup',
        description: 'Resolve 4-byte selector to function signature',
        icon: 'Hash',
        capability: 'signature-tools',
        accepts: ['selector'],
        navigate: navigateToSelectorLookup,
      },
      // --- Signature tools ---
      {
        id: 'signature-lookup',
        name: 'Signature Lookup',
        description: 'Look up function/event by text signature',
        icon: 'Hash',
        capability: 'signature-tools',
        accepts: ['signature'],
        navigate: navigateToTextSignatureLookup,
      },
      // --- Calldata tools ---
      {
        id: 'calldata-decode',
        name: 'Decode Calldata',
        description: 'Decode raw calldata into function call',
        icon: 'ListTree',
        capability: 'signature-tools',
        accepts: ['calldata'],
        navigate: navigateToCalldataDecode,
      },
      // --- Transaction hash tools ---
      {
        id: 'tx-trace',
        name: 'Transaction Trace',
        description: 'Auto-run replay and open the execution trace',
        icon: 'ListTree',
        capability: 'tx-replay',
        accepts: ['txhash'],
        navigate: navigateToTxTrace,
      },
      {
        id: 'tx-replay',
        name: 'Transaction Replay',
        description: 'Prefill replay form and run manually',
        icon: 'RotateCcw',
        capability: 'tx-replay',
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
    return tools.filter(
      (t) =>
        t.accepts.includes(inputType) &&
        familyHasCapability(activeFamily, t.capability),
    );
  }, [activeFamily, inputType, tools]);

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
