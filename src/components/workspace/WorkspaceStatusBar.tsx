import React from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Circle } from 'lucide-react';

export function WorkspaceStatusBar() {
  const { isConnected, nodeType, chainInfo, rpcUrl } = useWorkspace();

  return (
    <div className="flex items-center h-6 px-3 gap-4 border-t border-border bg-muted/20 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-1.5">
        <Circle
          className={`h-2 w-2 ${isConnected ? 'fill-green-500 text-green-500' : 'fill-muted-foreground text-muted-foreground'}`}
        />
        {isConnected ? `${nodeType}` : 'Disconnected'}
      </div>

      {chainInfo && (
        <>
          <span>Chain {chainInfo.chainId}</span>
          <span>Block #{chainInfo.blockNumber}</span>
          {chainInfo.automine && <span>Automine</span>}
        </>
      )}

      <div className="flex-1" />

      {rpcUrl && <span className="truncate max-w-48">{rpcUrl}</span>}
    </div>
  );
}
