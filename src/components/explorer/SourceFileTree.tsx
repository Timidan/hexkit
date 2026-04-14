import React, { useState, useMemo } from 'react';
import { CaretRight, CaretDown, FileCode, Folder, FolderOpen } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SourceFile } from '@/utils/resolver/sourceExtractor';

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: FileTreeNode[];
}

interface SourceFileTreeProps {
  files: SourceFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  className?: string;
}

function buildFileTree(files: SourceFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      let existing = currentLevel.find(n => n.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'directory',
          children: [],
        };
        currentLevel.push(existing);
      }

      if (!isFile) {
        currentLevel = existing.children;
      }
    }
  }

  // Sort: directories first, then files, both alphabetically
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map(node => ({
        ...node,
        children: sortNodes(node.children),
      }));
  };

  return sortNodes(root);
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
}) => {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === 'directory';

  const handleClick = () => {
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer rounded-sm text-sm font-light',
          'hover:bg-muted/50 transition-colors',
          isSelected && 'bg-primary/20 text-primary'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {isDirectory ? (
          <>
            {isExpanded ? (
              <CaretDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <CaretRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-amber-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" /> {/* Spacer for alignment */}
            <FileCode className="h-4 w-4 shrink-0 text-blue-400" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>

      {isDirectory && isExpanded && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const SourceFileTree: React.FC<SourceFileTreeProps> = ({
  files,
  selectedPath,
  onSelect,
  className,
}) => {
  const tree = useMemo(() => buildFileTree(files), [files]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const paths = new Set<string>();
    if (selectedPath) {
      const parts = selectedPath.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        paths.add(parts.slice(0, i + 1).join('/'));
      }
    }
    for (const node of tree) {
      if (node.type === 'directory') {
        paths.add(node.path);
      }
    }
    return paths;
  });

  const handleToggle = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (files.length === 0) {
    return (
      <div className={cn('p-4 text-muted-foreground text-sm', className)}>
        No source files available
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="py-2">
        {tree.map(node => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onSelect={onSelect}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </ScrollArea>
  );
};

export default SourceFileTree;
