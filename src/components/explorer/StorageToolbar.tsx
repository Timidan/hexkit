import React from 'react';
import {
  Database,
  MagnifyingGlass,
  WarningCircle,
  CircleNotch,
  DownloadSimple,
  CheckCircle,
  Broadcast,
  GridFour,
} from '@phosphor-icons/react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Separator } from '../ui/separator';
import { ProxyTypeBadge, DiamondBadge } from '../shared/ContractBadges';
import type { ViewFilter } from './storageViewerTypes';
import type { LayoutConfidence } from './storage-viewer/fetchStorageLayout';
import type { ProxyInfo } from '../../utils/resolver/types';
import type { useAutoDiscovery } from './storage-viewer/useAutoDiscovery';

export interface StorageToolbarProps {
  contractMeta: {
    name: string | null;
    compilerVersion: string | null;
    proxyInfo: ProxyInfo | null;
  } | null;
  layoutConfidence: LayoutConfidence | null;
  stats: {
    total: number;
    resolved: number;
    unknown: number;
    changed: number;
    nonZero: number;
    packed: number;
  };
  filter: ViewFilter;
  setUserFilter: (f: ViewFilter) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  mappingEntries: { baseSlot: string }[];
  discovery: ReturnType<typeof useAutoDiscovery>;
  handleExportCsv: () => void;
  setSlotGraphOpen: (open: boolean) => void;
}

export const StorageToolbar: React.FC<StorageToolbarProps> = ({
  contractMeta,
  layoutConfidence,
  stats,
  filter,
  setUserFilter,
  searchQuery,
  setSearchQuery,
  mappingEntries,
  discovery,
  handleExportCsv,
  setSlotGraphOpen,
}) => (
  <div className="flex items-center gap-2 flex-wrap">
    <div className="flex items-center gap-1.5">
      {contractMeta?.name && (
        <Badge variant="secondary" className="text-[10px] h-5 gap-1">
          <CheckCircle className="w-2.5 h-2.5 text-green-400" />
          {contractMeta.name}
        </Badge>
      )}
      {contractMeta?.compilerVersion && (
        <Badge variant="outline" className="text-[10px] h-5">
          {contractMeta.compilerVersion}
        </Badge>
      )}
      {layoutConfidence && (
        <Badge
          variant="outline"
          className={`text-[10px] h-5 gap-1 ${
            layoutConfidence === 'compiler'
              ? 'text-green-400 border-green-400/30'
              : layoutConfidence === 'reconstructed'
                ? 'text-amber-400 border-amber-400/30'
                : 'text-orange-500 border-orange-500/40'
          }`}
          title={
            layoutConfidence === 'heuristic'
              ? 'Layout synthesized from Heimdall decompilation — fields may be mislabeled or missing. See the banner for caveats.'
              : undefined
          }
        >
          {layoutConfidence === 'compiler' ? (
            <CheckCircle className="w-2.5 h-2.5" />
          ) : (
            <WarningCircle className="w-2.5 h-2.5" />
          )}
          {layoutConfidence === 'compiler'
            ? 'Compiler Layout'
            : layoutConfidence === 'reconstructed'
              ? 'Reconstructed'
              : 'Heuristic'}
        </Badge>
      )}
      {contractMeta?.proxyInfo?.proxyType === 'diamond' ? (
        <DiamondBadge proxyInfo={contractMeta.proxyInfo} size="sm" variant="badge" />
      ) : contractMeta?.proxyInfo?.isProxy ? (
        <ProxyTypeBadge proxyInfo={contractMeta.proxyInfo} size="sm" />
      ) : null}
      <Badge variant="outline" className="text-[10px] h-5 gap-1 text-muted-foreground">
        <Database className="w-2.5 h-2.5" />
        {stats.total} slots
      </Badge>
      {mappingEntries.length > 0 && (
        <Badge
          variant="outline"
          className={`text-[10px] h-5 gap-1 ${
            discovery.state.phase === 'scanning' ? 'text-yellow-400 border-yellow-400/30' :
            discovery.state.phase === 'complete' ? 'text-cyan-400 border-cyan-400/30' :
            discovery.state.phase === 'partial' ? 'text-blue-400 border-blue-400/30' :
            discovery.state.phase === 'error' ? 'text-red-400 border-red-400/30' :
            'text-muted-foreground'
          }`}
        >
          {discovery.state.phase === 'scanning' ? (
            <CircleNotch className="w-2.5 h-2.5 animate-spin" />
          ) : discovery.state.phase === 'complete' || discovery.state.phase === 'partial' ? (
            <Broadcast className="w-2.5 h-2.5" />
          ) : null}
          {discovery.state.totalKeysFound > 0
            ? `${discovery.state.totalKeysFound} keys`
            : discovery.state.phase === 'scanning'
              ? 'Scanning...'
              : 'No keys found'}
        </Badge>
      )}
    </div>

    <Separator orientation="vertical" className="h-4" />

    <Tabs value={filter} onValueChange={(v) => setUserFilter(v as ViewFilter)}>
      <TabsList className="h-6 bg-transparent gap-0.5">
        <TabsTrigger value="all" className="h-5 text-xs px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          All <span className="ml-0.5 text-[10px] opacity-60">{stats.total}</span>
        </TabsTrigger>
        <TabsTrigger value="resolved" className="h-5 text-xs px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          Resolved <span className="ml-0.5 text-[10px] opacity-60">{stats.resolved}</span>
        </TabsTrigger>
        <TabsTrigger value="unknown" className="h-5 text-xs px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          Unknown <span className="ml-0.5 text-[10px] opacity-60">{stats.unknown}</span>
        </TabsTrigger>
        <TabsTrigger value="changed" className="h-5 text-xs px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          Changed <span className="ml-0.5 text-[10px] opacity-60">{stats.changed}</span>
        </TabsTrigger>
        <TabsTrigger value="non-zero" className="h-5 text-xs px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          Non-zero <span className="ml-0.5 text-[10px] opacity-60">{stats.nonZero}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <div className="flex-1" />

    <div className="relative">
      <MagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search slots..."
        className="h-6 text-xs pl-7 w-40"
      />
    </div>

    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setSlotGraphOpen(true)}>
      <GridFour className="h-3 w-3" />
      Slot Graph
    </Button>
    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={handleExportCsv}>
      <DownloadSimple className="h-3 w-3" />
      CSV
    </Button>
  </div>
);
