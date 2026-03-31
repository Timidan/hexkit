import React, { useState, useCallback } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import NetworkSelector, {
  EXTENDED_NETWORKS,
  type ExtendedChain,
} from '@/components/shared/NetworkSelector';
import { Unplug, Zap, Box, ChevronDown, ChevronRight, Play, Eye } from 'lucide-react';
import type { DeployedContract } from '@/services/workspace/types';
import { cn } from '@/lib/utils';

export function ChainControlPanel() {
  const {
    isConnected, nodeType, chainInfo, accounts,
    connectToNode, disconnect, autoDetectNode, rpcUrl,
    deployedContracts, callContract, sendTransaction,
  } = useWorkspace();

  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<ExtendedChain | null>(null);

  const handleNetworkChange = useCallback(async (network: ExtendedChain) => {
    setSelectedNetwork(network);
    if (network.category === 'local' && network.rpcUrl) {
      setIsConnecting(true);
      try {
        await connectToNode(network.rpcUrl);
      } catch (err) {
        console.error('Connection failed:', err);
      } finally {
        setIsConnecting(false);
      }
    }
  }, [connectToNode]);

  const handleCustomUrlConnect = useCallback(async (url: string) => {
    setIsConnecting(true);
    setSelectedNetwork({
      id: 0,
      name: 'Custom',
      rpcUrl: url,
      category: 'local',
      color: '#94a3b8',
    });
    try {
      await connectToNode(url);
    } catch (err) {
      console.error('Connection failed:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [connectToNode]);

  const handleAutoDetect = useCallback(async () => {
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
  }, [autoDetectNode]);

  // Format ETH balance from wei bigint
  const formatEth = (wei: bigint): string => {
    const eth = Number(wei) / 1e18;
    if (eth === 0) return '0';
    if (eth >= 1000) return `${Math.floor(eth).toLocaleString()}`;
    if (eth >= 1) return eth.toFixed(2);
    return eth.toFixed(4);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950 border-l border-border/50">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-8 border-b border-border/30 shrink-0">
        <Zap className="h-3 w-3 text-primary/60" strokeWidth={2} />
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Chain Control
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* Connection section */}
        <div className="space-y-2.5">
          <div className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
            Network
          </div>

          {isConnected ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-foreground font-medium">{nodeType}</span>
                </div>
                {rpcUrl && (
                  <div className="text-[10px] text-muted-foreground/50 font-mono truncate">
                    {rpcUrl}
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs w-full text-muted-foreground/60 hover:text-destructive"
                onClick={disconnect}
              >
                <Unplug className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <NetworkSelector
                selectedNetwork={selectedNetwork}
                onNetworkChange={handleNetworkChange}
                networks={EXTENDED_NETWORKS}
                showLocal
                onCustomUrlConnect={handleCustomUrlConnect}
                variant="compact"
                size="sm"
                className="w-full"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs w-full text-muted-foreground/50 hover:text-foreground"
                onClick={handleAutoDetect}
                disabled={isConnecting}
                loading={isConnecting}
              >
                Auto-detect local node
              </Button>
            </div>
          )}
        </div>

        {/* Chain Info */}
        {chainInfo && (
          <div className="space-y-2.5">
            <div className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
              Chain Info
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InfoCell label="Chain ID" value={String(chainInfo.chainId)} />
              <InfoCell label="Block" value={`#${chainInfo.blockNumber}`} />
              <InfoCell label="Mining" value={chainInfo.automine ? 'Auto' : 'Manual'} accent={chainInfo.automine} />
            </div>
          </div>
        )}

        {/* Accounts */}
        {accounts.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
                Accounts
              </span>
              <span className="text-[10px] text-muted-foreground/30 font-mono tabular-nums">
                {accounts.length}
              </span>
            </div>
            <div className="space-y-0.5">
              {accounts.slice(0, 5).map((acct) => (
                <div
                  key={acct.address}
                  className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-xs font-mono text-muted-foreground/60 hover:bg-muted/30 hover:text-muted-foreground transition-all group"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate">
                      {acct.address.slice(0, 6)}...{acct.address.slice(-4)}
                    </span>
                    <span className="text-[9px] text-muted-foreground/30">
                      {formatEth(acct.balance)} ETH
                    </span>
                  </div>
                  <CopyButton
                    value={acct.address}
                    iconSize={12}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                  />
                </div>
              ))}
              {accounts.length > 5 && (
                <div className="text-[10px] text-muted-foreground/30 px-2 py-1">
                  +{accounts.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Deployed Contracts — interactive */}
        {deployedContracts.length > 0 && isConnected && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
                Contracts
              </span>
              <span className="text-[10px] text-muted-foreground/30 font-mono tabular-nums">
                {deployedContracts.length}
              </span>
            </div>
            <div className="space-y-2">
              {deployedContracts.map((c, i) => (
                <ContractCard
                  key={`${c.address}-${i}`}
                  contract={c}
                  callContract={callContract}
                  sendTransaction={sendTransaction}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md bg-zinc-900 border border-border/20 px-2.5 py-2">
      <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className={`text-xs font-mono tabular-nums ${accent ? 'text-emerald-400/80' : 'text-foreground/80'}`}>
        {value}
      </div>
    </div>
  );
}

// ── Contract interaction card ──────────────────────────────────────────

interface AbiFunction {
  name: string;
  type: string;
  stateMutability?: string;
  inputs?: { name: string; type: string }[];
  outputs?: { name: string; type: string }[];
}

function ContractCard({
  contract,
  callContract,
  sendTransaction,
}: {
  contract: DeployedContract;
  callContract: (addr: string, abi: unknown[], fn: string, args: unknown[]) => Promise<unknown>;
  sendTransaction: (addr: string, abi: unknown[], fn: string, args: unknown[]) => Promise<string>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const functions = (contract.abi as AbiFunction[]).filter(
    (e) => e.type === 'function',
  );

  const readFns = functions.filter(
    (f) => f.stateMutability === 'view' || f.stateMutability === 'pure',
  );
  const writeFns = functions.filter(
    (f) => f.stateMutability !== 'view' && f.stateMutability !== 'pure',
  );

  return (
    <div className="rounded-md bg-zinc-900 border border-border/20 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-2.5 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
        )}
        <Box className="h-3 w-3 text-primary/40 shrink-0" strokeWidth={1.5} />
        <span className="text-[12px] text-foreground/70 font-medium truncate">{contract.name}</span>
        <span className="text-[9px] text-muted-foreground/25 font-mono ml-auto shrink-0">
          {contract.address.slice(0, 6)}...{contract.address.slice(-4)}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-border/10 px-2.5 py-2 space-y-3">
          {/* Address */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground/40 truncate">
              {contract.address}
            </span>
            <CopyButton value={contract.address} iconSize={10} className="shrink-0 opacity-60" />
          </div>

          {/* Read functions */}
          {readFns.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wider flex items-center gap-1">
                <Eye className="h-2.5 w-2.5" strokeWidth={1.5} />
                Read
              </div>
              {readFns.map((fn) => (
                <FunctionRow
                  key={fn.name}
                  fn={fn}
                  address={contract.address}
                  abi={contract.abi}
                  isRead
                  callContract={callContract}
                  sendTransaction={sendTransaction}
                />
              ))}
            </div>
          )}

          {/* Write functions */}
          {writeFns.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wider flex items-center gap-1">
                <Play className="h-2.5 w-2.5" strokeWidth={1.5} />
                Write
              </div>
              {writeFns.map((fn) => (
                <FunctionRow
                  key={fn.name}
                  fn={fn}
                  address={contract.address}
                  abi={contract.abi}
                  isRead={false}
                  callContract={callContract}
                  sendTransaction={sendTransaction}
                />
              ))}
            </div>
          )}

          {functions.length === 0 && (
            <div className="text-[10px] text-muted-foreground/25 text-center py-2">
              No callable functions
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FunctionRow({
  fn,
  address,
  abi,
  isRead,
  callContract,
  sendTransaction,
}: {
  fn: AbiFunction;
  address: string;
  abi: unknown[];
  isRead: boolean;
  callContract: (addr: string, abi: unknown[], fnName: string, args: unknown[]) => Promise<unknown>;
  sendTransaction: (addr: string, abi: unknown[], fnName: string, args: unknown[]) => Promise<string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputs = fn.inputs ?? [];
  const hasInputs = inputs.length > 0;

  const handleExecute = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const argValues = inputs.map((inp) => {
        const raw = args[inp.name] ?? '';
        // Parse based on type
        if (inp.type === 'bool') return raw === 'true' || raw === '1';
        if (inp.type.startsWith('uint') || inp.type.startsWith('int')) return raw || '0';
        return raw;
      });

      if (isRead) {
        const res = await callContract(address, abi, fn.name, argValues);
        setResult(res === null || res === undefined ? 'void' : String(res));
      } else {
        const txHash = await sendTransaction(address, abi, fn.name, argValues);
        setResult(`tx: ${txHash}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded bg-zinc-950 border border-border/10">
      <button
        onClick={() => {
          if (!hasInputs && isRead) {
            // Auto-execute reads with no inputs
            handleExecute();
          } else {
            setIsOpen(!isOpen);
          }
        }}
        className={cn(
          'flex items-center gap-1.5 w-full px-2 py-1 text-left transition-colors hover:bg-muted/20 rounded',
          isRead ? 'text-cyan-400/60' : 'text-amber-400/60',
        )}
      >
        <span className="text-[11px] font-mono truncate">{fn.name}</span>
        <span className="text-[9px] text-muted-foreground/20 ml-auto shrink-0">
          {inputs.length > 0 ? `(${inputs.length})` : '()'}
        </span>
        {loading && (
          <span className="h-2 w-2 rounded-full bg-primary/40 animate-pulse shrink-0" />
        )}
      </button>

      {/* Expanded: input fields + execute button */}
      {isOpen && (
        <div className="px-2 pb-2 space-y-1.5 border-t border-border/10">
          {inputs.map((inp) => (
            <div key={inp.name} className="mt-1.5">
              <label className="text-[9px] text-muted-foreground/30 font-mono block mb-0.5">
                {inp.name} ({inp.type})
              </label>
              <input
                type="text"
                value={args[inp.name] ?? ''}
                onChange={(e) => setArgs((prev) => ({ ...prev, [inp.name]: e.target.value }))}
                placeholder={inp.type}
                className="w-full h-6 px-1.5 text-[10px] font-mono bg-zinc-900 border border-border/20 rounded text-foreground/70 placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/30"
              />
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 text-[10px] w-full mt-1',
              isRead ? 'text-cyan-400/60 hover:text-cyan-400' : 'text-amber-400/60 hover:text-amber-400',
            )}
            onClick={handleExecute}
            disabled={loading}
            loading={loading}
          >
            {isRead ? 'Call' : 'Send'}
          </Button>
        </div>
      )}

      {/* Result / Error display */}
      {result !== null && (
        <div className="px-2 pb-1.5 border-t border-border/10">
          <div className="text-[10px] font-mono text-emerald-400/60 break-all mt-1">
            {result}
          </div>
        </div>
      )}
      {error !== null && (
        <div className="px-2 pb-1.5 border-t border-border/10">
          <div className="text-[10px] font-mono text-red-400/60 break-all mt-1">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
