import React from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Settings2, Plug, FolderOpen, Zap } from 'lucide-react';

function SettingRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-muted-foreground/50">{label}</span>
      <span className={`text-[11px] text-foreground/60 ${mono ? 'font-mono' : ''} truncate max-w-[140px] text-right`}>
        {value}
      </span>
    </div>
  );
}

export function SettingsPanel() {
  const { isConnected, nodeType, chainInfo, rpcUrl, projectRoot, artifacts } = useWorkspace();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-3 h-8 border-b border-border/30 shrink-0">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
          Settings
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* Connection info */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Plug className="h-3 w-3 text-muted-foreground/30" strokeWidth={1.5} />
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
              Connection
            </span>
          </div>
          <div className="divide-y divide-border/10">
            <SettingRow label="Status" value={isConnected ? 'Connected' : 'Disconnected'} />
            {nodeType && <SettingRow label="Backend" value={nodeType} />}
            {rpcUrl && <SettingRow label="RPC URL" value={rpcUrl} mono />}
            {chainInfo && (
              <>
                <SettingRow label="Chain ID" value={String(chainInfo.chainId)} mono />
                <SettingRow label="Block" value={`#${chainInfo.blockNumber}`} mono />
                <SettingRow label="Mining" value={chainInfo.automine ? 'Automine' : 'Manual'} />
              </>
            )}
          </div>
        </div>

        {/* Project info */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-2">
            <FolderOpen className="h-3 w-3 text-muted-foreground/30" strokeWidth={1.5} />
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
              Project
            </span>
          </div>
          <div className="divide-y divide-border/10">
            <SettingRow label="Root" value={projectRoot ?? 'None'} mono />
          </div>
        </div>

        {/* Compilation info */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3 w-3 text-muted-foreground/30" strokeWidth={1.5} />
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
              Compilation
            </span>
          </div>
          <div className="divide-y divide-border/10">
            <SettingRow label="Artifacts" value={String(artifacts.length)} mono />
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Settings2 className="h-3 w-3 text-muted-foreground/30" strokeWidth={1.5} />
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground/40 uppercase">
              Shortcuts
            </span>
          </div>
          <div className="divide-y divide-border/10">
            <ShortcutRow keys={['Ctrl', 'K']} label="Command palette" />
            <ShortcutRow keys={['Ctrl', 'O']} label="Open project" />
            <ShortcutRow keys={['Ctrl', 'B']} label="Compile" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-muted-foreground/50">{label}</span>
      <div className="flex items-center gap-0.5">
        {keys.map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 && <span className="text-[9px] text-muted-foreground/20">+</span>}
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground/40 bg-zinc-900 border border-border/20 rounded">
              {k}
            </kbd>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
