import React from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { FolderOpen, Hammer, Rocket, Command } from 'lucide-react';

export function WorkspaceToolbar() {
  const { isConnected, nodeType, openProject, projectRoot, isCompiling } = useWorkspace();

  return (
    <div className="flex items-center h-10 px-3 gap-2 border-b border-border bg-muted/20 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={() => openProject()}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {projectRoot || 'Open Project'}
      </Button>

      <div className="h-4 w-px bg-border" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5"
        disabled={isCompiling}
      >
        <Hammer className="h-3.5 w-3.5" />
        {isCompiling ? 'Compiling...' : 'Compile'}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5"
        disabled={!isConnected}
      >
        <Rocket className="h-3.5 w-3.5" />
        Deploy
      </Button>

      <div className="flex-1" />

      <span className="text-xs text-muted-foreground">
        {isConnected ? `${nodeType} connected` : 'Not connected'}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5"
      >
        <Command className="h-3.5 w-3.5" />
        <span className="text-muted-foreground">K</span>
      </Button>
    </div>
  );
}
