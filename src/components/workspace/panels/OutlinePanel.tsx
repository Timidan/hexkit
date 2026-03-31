import React, { useMemo } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { FileCode2, Box, Zap, AlertTriangle, Variable, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OutlineItem {
  kind: 'contract' | 'function' | 'event' | 'error' | 'struct' | 'variable' | 'modifier';
  name: string;
  visibility?: string;
  line: number;
}

const KIND_CONFIG: Record<OutlineItem['kind'], { icon: React.ElementType; color: string; label: string }> = {
  contract:  { icon: Box, color: 'text-amber-400/60', label: 'C' },
  function:  { icon: Zap, color: 'text-primary/60', label: 'F' },
  event:     { icon: Hash, color: 'text-emerald-400/60', label: 'E' },
  error:     { icon: AlertTriangle, color: 'text-red-400/60', label: 'Er' },
  struct:    { icon: Box, color: 'text-cyan-400/60', label: 'S' },
  variable:  { icon: Variable, color: 'text-orange-400/60', label: 'V' },
  modifier:  { icon: Zap, color: 'text-violet-400/60', label: 'M' },
};

function parseSolidityOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Contracts / interfaces / libraries
    const contractMatch = line.match(/^(contract|interface|library|abstract\s+contract)\s+(\w+)/);
    if (contractMatch) {
      items.push({ kind: 'contract', name: contractMatch[2], line: i + 1 });
      continue;
    }

    // Functions
    const fnMatch = line.match(/^function\s+(\w+)\s*\(/);
    if (fnMatch) {
      const vis = line.match(/\b(public|external|internal|private)\b/)?.[1];
      items.push({ kind: 'function', name: fnMatch[1], visibility: vis, line: i + 1 });
      continue;
    }

    // Constructor / receive / fallback
    if (line.startsWith('constructor(') || line.startsWith('constructor (')) {
      items.push({ kind: 'function', name: 'constructor', line: i + 1 });
      continue;
    }
    if (line.startsWith('receive(') || line === 'receive() external payable {') {
      items.push({ kind: 'function', name: 'receive', visibility: 'external', line: i + 1 });
      continue;
    }
    if (line.startsWith('fallback(') || line.startsWith('fallback()')) {
      items.push({ kind: 'function', name: 'fallback', visibility: 'external', line: i + 1 });
      continue;
    }

    // Events
    const evMatch = line.match(/^event\s+(\w+)\s*\(/);
    if (evMatch) {
      items.push({ kind: 'event', name: evMatch[1], line: i + 1 });
      continue;
    }

    // Errors
    const errMatch = line.match(/^error\s+(\w+)\s*\(/);
    if (errMatch) {
      items.push({ kind: 'error', name: errMatch[1], line: i + 1 });
      continue;
    }

    // Structs
    const structMatch = line.match(/^struct\s+(\w+)\s*\{?/);
    if (structMatch) {
      items.push({ kind: 'struct', name: structMatch[1], line: i + 1 });
      continue;
    }

    // Modifiers
    const modMatch = line.match(/^modifier\s+(\w+)\s*[\({]/);
    if (modMatch) {
      items.push({ kind: 'modifier', name: modMatch[1], line: i + 1 });
      continue;
    }

    // State variables (top-level typed declarations)
    const varMatch = line.match(/^(uint256|uint128|uint64|uint32|uint16|uint8|int256|int128|address|bool|string|bytes\d*|mapping\s*\(.*\))\s+(public|private|internal|immutable|constant)?\s*(\w+)\s*[;=]/);
    if (varMatch) {
      items.push({ kind: 'variable', name: varMatch[3], visibility: varMatch[2], line: i + 1 });
    }
  }

  return items;
}

export function OutlinePanel() {
  const { activeFile } = useWorkspace();

  const items = useMemo(() => {
    if (!activeFile || activeFile.language !== 'solidity') return [];
    return parseSolidityOutline(activeFile.content);
  }, [activeFile]);

  if (!activeFile) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center px-3 h-8 border-b border-border/30 shrink-0">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
            Outline
          </span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-2 p-6">
          <FileCode2 className="h-4 w-4 text-muted-foreground/15" strokeWidth={1.5} />
          <span className="text-[11px] text-muted-foreground/25">Open a file to see its outline</span>
        </div>
      </div>
    );
  }

  if (activeFile.language !== 'solidity') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center px-3 h-8 border-b border-border/30 shrink-0">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
            Outline
          </span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-2 p-6">
          <FileCode2 className="h-4 w-4 text-muted-foreground/15" strokeWidth={1.5} />
          <span className="text-[11px] text-muted-foreground/25 text-center">
            Outline is available for Solidity files
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 h-8 border-b border-border/30 shrink-0">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
          Outline
        </span>
        <span className="text-[10px] text-muted-foreground/25 font-mono truncate max-w-24">
          {activeFile.name}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <span className="text-[11px] text-muted-foreground/25">No symbols found</span>
          </div>
        ) : (
          items.map((item, i) => {
            const cfg = KIND_CONFIG[item.kind];
            const Icon = cfg.icon;
            return (
              <div
                key={`${item.name}-${item.line}-${i}`}
                className={cn(
                  'flex items-center gap-2 px-3 py-1 hover:bg-muted/20 cursor-default transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  item.kind === 'contract' && 'mt-1',
                )}
              >
                <Icon className={cn('h-3 w-3 shrink-0', cfg.color)} strokeWidth={1.5} />
                <span className={cn(
                  'text-[12px] truncate',
                  item.kind === 'contract' ? 'text-foreground/80 font-medium' : 'text-foreground/60',
                )}>
                  {item.name}
                </span>
                {item.visibility && (
                  <span className="text-[9px] text-muted-foreground/25 font-mono ml-auto shrink-0">
                    {item.visibility}
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground/20 font-mono tabular-nums shrink-0">
                  :{item.line}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
