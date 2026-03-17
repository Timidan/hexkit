import React, { useState } from 'react';
import { cn } from '@/lib/utils';

type ConsoleTab = 'console' | 'transactions' | 'problems';

const TABS: { id: ConsoleTab; label: string }[] = [
  { id: 'console', label: 'Console' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'problems', label: 'Problems' },
];

export function ConsolePanel() {
  const [activeTab, setActiveTab] = useState<ConsoleTab>('console');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center border-t border-border bg-muted/20 shrink-0">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors',
              activeTab === id && 'text-foreground border-b border-primary'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'console' && (
          <div className="text-xs text-muted-foreground font-mono">
            <div>&gt; Workspace ready</div>
          </div>
        )}
        {activeTab === 'transactions' && (
          <div className="text-xs text-muted-foreground">No transactions yet</div>
        )}
        {activeTab === 'problems' && (
          <div className="text-xs text-muted-foreground">No problems</div>
        )}
      </div>
    </div>
  );
}
