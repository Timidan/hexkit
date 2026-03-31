import React from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { FolderOpen, File, ChevronRight, ChevronDown, FolderSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FileNode } from '@/services/workspace/FileAccessService';

function TreeItem({
  node,
  depth = 0,
  parentPath = '',
  onFileClick,
  activeFilePath,
}: {
  node: FileNode;
  depth?: number;
  parentPath?: string;
  onFileClick: (path: string) => void;
  activeFilePath?: string;
}) {
  const [isOpen, setIsOpen] = React.useState(depth < 2);
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center w-full px-2 py-[3px] hover:bg-muted/30 text-[13px] text-foreground/80 hover:text-foreground transition-colors group"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 mr-0.5 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 mr-0.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground" strokeWidth={1.5} />
          )}
          <FolderOpen className="h-3.5 w-3.5 mr-1.5 text-amber-400/50 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children?.map((child) => (
          <TreeItem
            key={child.path || child.name}
            node={child}
            depth={depth + 1}
            parentPath={fullPath}
            onFileClick={onFileClick}
            activeFilePath={activeFilePath}
          />
        ))}
      </div>
    );
  }

  const ext = node.name.split('.').pop()?.toLowerCase();
  const fileColor = ext === 'sol'
    ? 'text-primary/50'
    : ext === 'ts' || ext === 'tsx'
      ? 'text-blue-400/50'
      : ext === 'json'
        ? 'text-amber-400/40'
        : 'text-muted-foreground/30';

  const isActive = activeFilePath === fullPath;

  return (
    <button
      onClick={() => onFileClick(fullPath)}
      className={cn(
        'flex items-center w-full px-2 py-[3px] text-[13px] transition-colors',
        isActive
          ? 'bg-primary/10 text-foreground'
          : 'text-foreground/70 hover:bg-muted/30 hover:text-foreground',
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      <span className="w-3.5 mr-0.5 shrink-0" />
      <File className={`h-3.5 w-3.5 mr-1.5 shrink-0 ${fileColor}`} strokeWidth={1.5} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function FileExplorer() {
  const { fileTree, projectRoot, openProject, openFile, activeFile } = useWorkspace();

  if (fileTree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted/20 border border-border/20">
          <FolderSearch className="h-5 w-5 text-muted-foreground/30" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground/50">No project open</p>
          <p className="text-[11px] text-muted-foreground/30 max-w-[180px]">
            Open a Solidity project folder to explore contracts
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs bg-transparent border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/30"
          onClick={() => openProject()}
        >
          <FolderOpen className="h-3 w-3 mr-1.5" strokeWidth={1.5} />
          Open a folder
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-3 h-8 border-b border-border/30 shrink-0">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase truncate">
          {projectRoot || 'Explorer'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {fileTree.map((node) => (
          <TreeItem
            key={node.path || node.name}
            node={node}
            onFileClick={openFile}
            activeFilePath={activeFile?.path}
          />
        ))}
      </div>
    </div>
  );
}
