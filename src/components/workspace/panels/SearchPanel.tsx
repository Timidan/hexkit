import React, { useState, useCallback } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Search, FileCode2 } from 'lucide-react';
import type { FileNode } from '@/services/workspace/FileAccessService';

interface SearchResult {
  path: string;
  name: string;
  line: number;
  text: string;
}

function collectFiles(nodes: FileNode[], prefix = ''): { path: string; name: string }[] {
  const files: { path: string; name: string }[] = [];
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') {
      files.push({ path: fullPath, name: node.name });
    } else if (node.children) {
      files.push(...collectFiles(node.children, fullPath));
    }
  }
  return files;
}

export function SearchPanel() {
  const { fileTree, readFile, openFile } = useWorkspace();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || fileTree.length === 0) return;
    setIsSearching(true);
    setSearched(true);
    const hits: SearchResult[] = [];
    const files = collectFiles(fileTree);
    const lowerQ = query.toLowerCase();

    for (const file of files) {
      // Only search text-like files
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!['sol', 'ts', 'tsx', 'js', 'jsx', 'json', 'toml', 'yaml', 'yml', 'md', 'txt', 'cfg'].includes(ext)) continue;

      try {
        const content = await readFile(file.path);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lowerQ)) {
            hits.push({ path: file.path, name: file.name, line: i + 1, text: lines[i].trim() });
            if (hits.length >= 100) break;
          }
        }
      } catch {
        // skip unreadable files
      }
      if (hits.length >= 100) break;
    }

    setResults(hits);
    setIsSearching(false);
  }, [query, fileTree, readFile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-3 h-8 border-b border-border/30 shrink-0">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
          Search
        </span>
      </div>

      <div className="p-2">
        <div className="flex items-center gap-1.5 h-7 px-2 bg-zinc-900 border border-border/40 rounded-md focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <Search className="h-3 w-3 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search in files..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-muted-foreground/40">Searching...</span>
          </div>
        )}

        {!isSearching && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Search className="h-4 w-4 text-muted-foreground/15" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground/30">No results found</span>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="px-1">
            <div className="px-2 py-1 text-[10px] text-muted-foreground/30">
              {results.length}{results.length >= 100 ? '+' : ''} results
            </div>
            {results.map((r, i) => (
              <button
                key={`${r.path}:${r.line}:${i}`}
                onClick={() => openFile(r.path)}
                className="flex flex-col w-full px-2 py-1.5 hover:bg-muted/20 rounded-md text-left transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <FileCode2 className="h-3 w-3 text-primary/40 shrink-0" strokeWidth={1.5} />
                  <span className="text-[11px] text-foreground/70 truncate">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground/25 font-mono">:{r.line}</span>
                </div>
                <div className="pl-[18px] text-[10px] font-mono text-muted-foreground/40 truncate mt-0.5">
                  {r.text}
                </div>
              </button>
            ))}
          </div>
        )}

        {!searched && fileTree.length > 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Search className="h-4 w-4 text-muted-foreground/15" strokeWidth={1.5} />
            <span className="text-[11px] text-muted-foreground/25">Type to search project files</span>
          </div>
        )}

        {fileTree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Search className="h-4 w-4 text-muted-foreground/15" strokeWidth={1.5} />
            <span className="text-[11px] text-muted-foreground/25">Open a project first</span>
          </div>
        )}
      </div>
    </div>
  );
}
