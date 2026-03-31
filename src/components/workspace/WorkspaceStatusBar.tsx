import React from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';

export function WorkspaceStatusBar() {
  const { isConnected, nodeType, chainInfo, rpcUrl } = useWorkspace();

  return (
    <div className="flex items-center h-6 px-3 gap-4 border-t border-border/50 bg-zinc-950 text-[11px] text-muted-foreground/70 shrink-0 select-none">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-[5px] w-[5px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isConnected
              ? 'bg-emerald-400'
              : 'bg-zinc-600'
          }`}
        />
        <span className={isConnected ? 'text-muted-foreground' : ''}>
          {isConnected ? `${nodeType}` : 'Disconnected'}
        </span>
      </div>

      {chainInfo && (
        <>
          <span className="font-mono tabular-nums">
            Chain {chainInfo.chainId}
          </span>
          <span className="font-mono tabular-nums">
            Block #{chainInfo.blockNumber}
          </span>
          {chainInfo.automine && (
            <span className="text-emerald-400/70">Automine</span>
          )}
        </>
      )}

      <div className="flex-1" />

      {rpcUrl && (
        <span className="truncate max-w-48 font-mono text-[10px] opacity-50">
          {rpcUrl}
        </span>
      )}
    </div>
  );
}
