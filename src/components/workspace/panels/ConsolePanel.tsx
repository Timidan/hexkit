import React, { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import type { ConsoleEntry } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';
import { Terminal, ArrowLeftRight, AlertTriangle, Trash2 } from 'lucide-react';

type ConsoleTab = 'console' | 'transactions' | 'problems';

const TABS: { id: ConsoleTab; label: string; icon: React.ElementType }[] = [
  { id: 'console', label: 'Console', icon: Terminal },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'problems', label: 'Problems', icon: AlertTriangle },
];

const LOG_COLORS: Record<ConsoleEntry['type'], string> = {
  info: 'text-muted-foreground/70',
  error: 'text-red-400/80',
  warning: 'text-amber-400/70',
  success: 'text-emerald-400/70',
};

const LOG_PREFIXES: Record<ConsoleEntry['type'], string> = {
  info: '>',
  error: '!',
  warning: '~',
  success: '*',
};

export function ConsolePanel() {
  const { consoleLogs, compilationErrors, clearConsole } = useWorkspace();
  const [activeTab, setActiveTab] = useState<ConsoleTab>('console');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current && activeTab === 'console') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [consoleLogs, activeTab]);

  // Switch to problems tab when compilation errors appear
  useEffect(() => {
    if (compilationErrors.length > 0) {
      setActiveTab('problems');
    }
  }, [compilationErrors]);

  const problemCount = compilationErrors.length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 h-8 border-t border-border/50 bg-zinc-900 shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 h-6 rounded-md text-[11px] font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              activeTab === id
                ? 'text-foreground bg-muted/50'
                : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/20',
            )}
          >
            <Icon className="h-3 w-3" strokeWidth={1.5} />
            {label}
            {id === 'problems' && problemCount > 0 && (
              <span className="ml-1 px-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 text-[9px] font-mono tabular-nums">
                {problemCount}
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        {activeTab === 'console' && consoleLogs.length > 0 && (
          <button
            onClick={clearConsole}
            className="flex items-center gap-1 px-1.5 h-5 rounded text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-3" ref={scrollRef}>
        {activeTab === 'console' && (
          <div className="font-mono text-xs leading-5 space-y-0.5">
            {consoleLogs.length === 0 ? (
              <div className="flex items-start gap-2">
                <span className="text-emerald-400/60 select-none">&gt;</span>
                <span className="text-muted-foreground/50">Workspace ready</span>
              </div>
            ) : (
              consoleLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className={cn('select-none shrink-0', LOG_COLORS[log.type])}>
                    {LOG_PREFIXES[log.type]}
                  </span>
                  <span className={cn('break-all', LOG_COLORS[log.type])}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'transactions' && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <ArrowLeftRight className="h-5 w-5 text-muted-foreground/20" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground/40">No transactions yet</span>
          </div>
        )}
        {activeTab === 'problems' && (
          <>
            {compilationErrors.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <AlertTriangle className="h-5 w-5 text-muted-foreground/20" strokeWidth={1.5} />
                <span className="text-xs text-muted-foreground/40">No problems</span>
              </div>
            ) : (
              <div className="font-mono text-xs leading-5 space-y-1">
                {compilationErrors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-red-400/60 select-none shrink-0">!</span>
                    <span className="text-red-400/80 break-all whitespace-pre-wrap">{err}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
