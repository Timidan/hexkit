import React from 'react';
import type { JSX } from 'react';
import {
  CaretRight,
} from '@phosphor-icons/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Badge } from '../ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { Button } from '../ui/button';
import StackedOverview, { type ParameterDisplayEntry as OverviewParameterEntry } from '../StackedOverview';
import RawJsonView from '../RawJsonView';
import type { DecoderViewMode, AbiSourceType } from './types';
import { shortenAddress, formatProxyType } from './utils';
import type { ProxyInfo } from '../../utils/resolver';

interface DecoderOutputPanelProps {
  decodedResult: any;
  viewMode: DecoderViewMode;
  setViewMode: (v: DecoderViewMode) => void;
  showFallbackOptions: boolean;
  fallbackSectionRef: React.RefObject<HTMLDivElement | null>;
  contractMetadata: any;
  contractAddress: string;
  functionCount: number;
  eventCount: number;
  abiSource: AbiSourceType;
  proxyInfo: ProxyInfo | null;
  implementationAbiUsed: boolean;
  resolvedImplementationAddress: string | null;
  heuristicResult: any;
  showAlternativeResults: boolean;
  getParameterDisplayData: () => {
    parameterData: OverviewParameterEntry[];
    hasGenericNames: boolean;
    hasRealNames: boolean;
  };
}

const renderAbiSourceBadge = (abiSource: AbiSourceType) => {
  if (!abiSource) return null;

  const sources: Record<string, { text: string; color: string }> = {
    sourcify: { text: 'Sourcify', color: 'text-emerald-400' },
    blockscout: { text: 'Blockscout', color: 'text-blue-400' },
    etherscan: { text: 'Etherscan', color: 'text-slate-400' },
    manual: { text: 'Manual', color: 'text-amber-400' },
    signatures: { text: 'Sig', color: 'text-slate-400' },
    heuristic: { text: 'Heuristic', color: 'text-orange-400' }
  };

  const source = sources[abiSource];
  if (!source) return null;

  return (
    <span className={`ml-1.5 text-xs ${source.color}`}>
      {source.text}
    </span>
  );
};

const DecoderOutputPanel: React.FC<DecoderOutputPanelProps> = ({
  decodedResult,
  viewMode,
  setViewMode,
  showFallbackOptions,
  fallbackSectionRef,
  contractMetadata,
  contractAddress,
  functionCount,
  eventCount,
  abiSource,
  proxyInfo,
  implementationAbiUsed,
  resolvedImplementationAddress,
  heuristicResult,
  showAlternativeResults,
  getParameterDisplayData,
}) => {
  if (!decodedResult) return null;

  return (
    <div className="border border-border/40 rounded-sm mt-3 font-mono text-[11px] bg-black/30 backdrop-blur-sm overflow-hidden selection:bg-emerald-500/20">
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/15 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400/60" />
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/60" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
          </div>
          <span className="text-foreground/70 uppercase tracking-widest text-[10px]">Output::decoded</span>
          {showFallbackOptions && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => fallbackSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 px-1.5 rounded transition-all flex items-center gap-1.5 border border-amber-500/30 text-[10px]"
            >
              <span className="animate-pulse">●</span>
              <span>IMPROVE_NAMES</span>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          {contractMetadata?.source && <span className="text-purple-400">{contractMetadata.source.toLowerCase()}</span>}
          {contractAddress && (
            <span className="text-muted-foreground hover:text-foreground cursor-help transition-colors" title={contractAddress}>
              @{shortenAddress(contractAddress)}
            </span>
          )}
          <span className="text-blue-400">{functionCount}F:{eventCount}E</span>
        </div>
      </div>

      <div className="divide-y divide-border/10">
        <div className="flex group hover:bg-muted/10 transition-colors">
          <div className="w-8 py-1.5 text-right pr-2 text-muted-foreground/40 border-r border-border/20 select-none tabular-nums bg-muted/5 text-[10px]">01</div>
          <div className="py-1.5 px-3 flex items-center gap-2">
            <span className="text-blue-400 select-none">fn</span>
            <span className="text-emerald-400 font-semibold tracking-tight">{decodedResult.name}</span>
            <span className="text-muted-foreground/50">()</span>
          </div>
        </div>
        <div className="flex group hover:bg-muted/10 transition-colors">
          <div className="w-8 py-1.5 text-right pr-2 text-muted-foreground/40 border-r border-border/20 select-none tabular-nums bg-muted/5 text-[10px]">02</div>
          <div className="py-1.5 px-3 flex items-start gap-2 min-w-0">
            <span className="text-blue-400 select-none shrink-0">sig</span>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-purple-400 break-all leading-relaxed">{decodedResult.signature}</span>
              <div className="opacity-80 scale-90 origin-left hover:opacity-100 transition-opacity">
                {renderAbiSourceBadge(abiSource)}
              </div>
            </div>
          </div>
        </div>
        {proxyInfo?.isProxy && (
          <div className="flex group hover:bg-muted/10 transition-colors">
            <div className="w-8 py-1.5 text-right pr-2 text-muted-foreground/40 border-r border-border/20 select-none tabular-nums bg-muted/5 text-[10px]">03</div>
            <div className="py-1.5 px-3 flex items-center gap-2 min-w-0">
              <span className="text-blue-400 select-none shrink-0">proxy</span>
              <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px] h-4 px-1.5">
                {formatProxyType(proxyInfo.proxyType)}
              </Badge>
              {implementationAbiUsed && resolvedImplementationAddress && (
                <span className="text-muted-foreground/70 text-[10px]">
                  ABI from impl: <span className="text-emerald-400">{resolvedImplementationAddress.slice(0, 10)}...{resolvedImplementationAddress.slice(-6)}</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {decodedResult.args && decodedResult.args.length > 0 && (
        <div className="border-t border-border/10">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as DecoderViewMode)}>
            <div className="flex items-center gap-2 px-2.5 py-1 bg-muted/5 border-b border-border/10">
              <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest">args[{decodedResult.args.length}]</span>
              <TabsList className="h-6 p-0.5 bg-transparent">
                <TabsTrigger value="overview" className="h-5 text-[10px] px-2 data-[state=active]:bg-muted/20 rounded-sm">tree</TabsTrigger>
                <TabsTrigger value="raw" className="h-5 text-[10px] px-2 data-[state=active]:bg-muted/20 rounded-sm">json</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="p-2 pt-1 mt-0">
              {(() => {
                const { parameterData } = getParameterDisplayData();
                return <StackedOverview parameterData={parameterData} />;
              })()}
            </TabsContent>

            <TabsContent value="raw" className="p-2 pt-1 mt-0">
              {(() => {
                const { parameterData } = getParameterDisplayData();
                return <RawJsonView parameters={parameterData} />;
              })()}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {heuristicResult && heuristicResult.decodedAttempts && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full flex items-center gap-2 px-2.5 py-1.5 border-t border-border/10 bg-purple-500/5 hover:bg-purple-500/10 transition-colors text-left group"
            >
              <CaretRight className="h-3 w-3 text-purple-400/60 transition-transform group-data-[state=open]:rotate-90" />
              <span className="text-[10px] text-purple-400/80 uppercase tracking-wider">heuristics</span>
              {heuristicResult.bestGuess && (
                <span className="text-[10px] text-muted-foreground/40 font-mono">
                  // confidence: {(heuristicResult.bestGuess.confidence * 100).toFixed(0)}%
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-l-2 border-purple-500/20 ml-3 pl-2 py-1.5 bg-purple-500/5 text-[10px] space-y-1">
              {heuristicResult.bestGuess && (
                <>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-blue-400/60">desc:</span>
                    <span className="text-emerald-400/80">{heuristicResult.bestGuess.description}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-blue-400/60">types:</span>
                    <span className="text-muted-foreground/60">[{(heuristicResult.bestGuess.types || []).join(', ')}]</span>
                  </div>
                </>
              )}
              {showAlternativeResults && heuristicResult.decodedAttempts.length > 1 && (
                <div className="pt-1 mt-1 border-t border-purple-500/10 text-muted-foreground/40">
                  {heuristicResult.decodedAttempts.slice(1, 4).map((attempt: any, i: number) => (
                    <div key={i} className="font-mono">// alt[{i}]: {attempt.description} ({(attempt.confidence * 100).toFixed(0)}%)</div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export default DecoderOutputPanel;
