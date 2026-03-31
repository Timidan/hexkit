import React from 'react';
import {
  FolderOpen,
  Search,
  FileCode2,
  History,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type WorkspaceView = 'files' | 'search' | 'outline' | 'history' | 'settings';

interface ActivityRailProps {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
}

const VIEWS: { id: WorkspaceView; icon: React.ElementType; label: string }[] = [
  { id: 'files', icon: FolderOpen, label: 'File Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'outline', icon: FileCode2, label: 'Contract Outline' },
  { id: 'history', icon: History, label: 'Deploy History' },
  { id: 'settings', icon: Settings2, label: 'Chain Settings' },
];

export function ActivityRail({ activeView, onViewChange }: ActivityRailProps) {
  return (
    <div className="flex flex-col w-12 border-r border-border/50 shrink-0 bg-zinc-950">
      <div className="flex flex-col gap-0.5 pt-1">
        {VIEWS.map(({ id, icon: Icon, label }) => {
          const isActive = activeView === id;
          return (
            <div key={id} className="relative group">
              <button
                onClick={() => onViewChange(id)}
                title={label}
                className={cn(
                  'relative flex items-center justify-center h-11 w-full',
                  'text-muted-foreground/60 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  'hover:text-foreground/90',
                  'active:scale-95 active:-translate-y-px',
                  isActive && 'text-foreground',
                )}
              >
                {/* Active indicator bar */}
                <div
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-r-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    isActive
                      ? 'h-5 bg-primary opacity-100'
                      : 'h-0 bg-primary opacity-0 group-hover:h-3 group-hover:opacity-40',
                  )}
                />

                {/* Icon with subtle glow when active */}
                <div
                  className={cn(
                    'relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    isActive && 'bg-primary/10',
                    !isActive && 'group-hover:bg-muted/40',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                      isActive && '',
                    )}
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                </div>
              </button>

              {/* Tooltip */}
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
                <div className="px-2.5 py-1 text-xs font-medium text-foreground bg-popover border border-border/50 rounded-md shadow-lg whitespace-nowrap">
                  {label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
