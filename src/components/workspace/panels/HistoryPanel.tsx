import React from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CopyButton } from '@/components/ui/copy-button';
import { History, Box } from 'lucide-react';

export function HistoryPanel() {
  const { deployedContracts, snapshots } = useWorkspace();

  const hasContent = deployedContracts.length > 0 || snapshots.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-3 h-8 border-b border-border/30 shrink-0">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
          History
        </span>
      </div>

      {!hasContent ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 p-6">
          <History className="h-4 w-4 text-muted-foreground/15" strokeWidth={1.5} />
          <span className="text-[11px] text-muted-foreground/25 text-center">
            Deployed contracts and snapshots will appear here
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Deployed contracts */}
          {deployedContracts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
                Deployed Contracts
              </div>
              <div className="space-y-1">
                {deployedContracts.map((c, i) => (
                  <div
                    key={`${c.address}-${i}`}
                    className="rounded-md bg-zinc-900 border border-border/20 p-2.5 space-y-1"
                  >
                    <div className="flex items-center gap-1.5">
                      <Box className="h-3 w-3 text-primary/40 shrink-0" strokeWidth={1.5} />
                      <span className="text-[12px] text-foreground/70 font-medium">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 w-full group">
                      <span className="text-[10px] font-mono text-muted-foreground/40 truncate">
                        {c.address}
                      </span>
                      <CopyButton
                        value={c.address}
                        iconSize={10}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      />
                    </div>
                    {c.deployBlock !== undefined && (
                      <div className="text-[9px] text-muted-foreground/25 font-mono">
                        Block #{c.deployBlock}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Snapshots */}
          {snapshots.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
                Snapshots
              </div>
              <div className="space-y-1">
                {snapshots.map((s, i) => (
                  <div
                    key={`${s.id}-${i}`}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-zinc-900 border border-border/20"
                  >
                    <History className="h-3 w-3 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />
                    <span className="text-[11px] text-foreground/60 truncate">{s.name}</span>
                    <span className="text-[9px] text-muted-foreground/20 font-mono ml-auto shrink-0">
                      {s.id.slice(0, 8)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
