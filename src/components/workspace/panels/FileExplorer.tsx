import React from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { FolderOpen, File, ChevronRight, ChevronDown } from 'lucide-react';
import type { FileNode } from '@/services/workspace/FileAccessService';

function TreeItem({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [isOpen, setIsOpen] = React.useState(depth < 2);

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center w-full px-2 py-0.5 hover:bg-muted/50 text-sm text-foreground"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
          )}
          <FolderOpen className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children?.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <button
      className="flex items-center w-full px-2 py-0.5 hover:bg-muted/50 text-sm text-foreground"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span className="w-3.5 mr-1 shrink-0" />
      <File className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function FileExplorer() {
  const { fileTree, projectRoot, openProject } = useWorkspace();

  if (fileTree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <p className="text-sm text-muted-foreground text-center">No project open</p>
        <button
          onClick={() => openProject()}
          className="text-sm text-primary hover:underline"
        >
          Open a folder
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
        {projectRoot || 'Explorer'}
      </div>
      <div className="flex-1 overflow-y-auto">
        {fileTree.map((node) => (
          <TreeItem key={node.path} node={node} />
        ))}
      </div>
    </div>
  );
}
