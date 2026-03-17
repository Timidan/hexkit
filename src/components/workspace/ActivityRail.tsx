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
    <div className="flex flex-col w-12 bg-muted/30 border-r border-border shrink-0">
      {VIEWS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onViewChange(id)}
          title={label}
          className={cn(
            'flex items-center justify-center h-12 w-12 text-muted-foreground hover:text-foreground transition-colors',
            activeView === id && 'text-foreground border-l-2 border-primary bg-muted/50'
          )}
        >
          <Icon className="h-5 w-5" />
        </button>
      ))}
    </div>
  );
}
