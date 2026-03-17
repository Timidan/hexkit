import React, { useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Plug, Unplug } from 'lucide-react';

export function ChainControlPanel() {
  const {
    isConnected, nodeType, chainInfo, accounts,
    connectToNode, disconnect, autoDetectNode, rpcUrl,
  } = useWorkspace();

  const [inputUrl, setInputUrl] = useState('http://localhost:8545');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connectToNode(inputUrl);
    } catch (err) {
      console.error('Connection failed:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAutoDetect = async () => {
    setIsConnecting(true);
    try {
      const found = await autoDetectNode();
      if (!found) {
        console.warn('No local node found on common ports');
      }
    } catch (err) {
      console.error('Auto-detect failed:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
        Chain Control
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Connection */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">Connection</h4>
          {isConnected ? (
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-green-500 mr-1.5">●</span>
                {nodeType} connected
              </div>
              {rpcUrl && (
                <div className="text-xs text-muted-foreground truncate">{rpcUrl}</div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs w-full"
                onClick={disconnect}
              >
                <Unplug className="h-3.5 w-3.5 mr-1.5" />
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="http://localhost:8545"
                className="w-full h-7 px-2 text-xs bg-muted/50 border border-border rounded"
              />
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={handleConnect}
                  disabled={isConnecting}
                >
                  <Plug className="h-3.5 w-3.5 mr-1.5" />
                  Connect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleAutoDetect}
                  disabled={isConnecting}
                >
                  Auto
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Chain Info */}
        {chainInfo && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">Chain Info</h4>
            <div className="text-xs space-y-0.5">
              <div>Chain ID: {chainInfo.chainId}</div>
              <div>Block: #{chainInfo.blockNumber}</div>
              <div>Automine: {chainInfo.automine ? 'Yes' : 'No'}</div>
            </div>
          </div>
        )}

        {/* Accounts */}
        {accounts.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">Accounts ({accounts.length})</h4>
            <div className="space-y-1">
              {accounts.slice(0, 5).map((acct) => (
                <div key={acct.address} className="text-xs font-mono truncate text-muted-foreground">
                  {acct.address.slice(0, 6)}...{acct.address.slice(-4)}
                </div>
              ))}
              {accounts.length > 5 && (
                <div className="text-xs text-muted-foreground">+{accounts.length - 5} more</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
