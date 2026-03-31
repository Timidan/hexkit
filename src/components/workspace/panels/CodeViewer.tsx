import React, { useMemo } from 'react';
import { useWorkspace, type OpenFile } from '@/contexts/WorkspaceContext';
import { X, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Minimal Solidity/JS syntax highlighter — no deps required */
function highlightLine(line: string, language: string): React.ReactNode {
  if (language === 'json') {
    return <span className="text-foreground/80">{line}</span>;
  }

  const isSolidity = language === 'solidity';
  const isJS = language === 'javascript' || language === 'typescript';

  // Comment lines
  if (line.trimStart().startsWith('//')) {
    return <span className="text-emerald-400/50">{line}</span>;
  }
  if (line.trimStart().startsWith('*') || line.trimStart().startsWith('/*')) {
    return <span className="text-emerald-400/50">{line}</span>;
  }

  const keywords = isSolidity
    ? /\b(pragma|solidity|contract|interface|library|abstract|function|modifier|event|error|struct|enum|mapping|returns|return|if|else|for|while|do|require|revert|emit|using|is|public|private|internal|external|view|pure|payable|memory|storage|calldata|virtual|override|immutable|constant|constructor|receive|fallback|import|from)\b/g
    : isJS
      ? /\b(import|export|from|const|let|var|function|class|return|if|else|for|while|do|switch|case|break|continue|new|this|async|await|try|catch|throw|typeof|instanceof|interface|type|extends|implements)\b/g
      : null;

  const typeWords = isSolidity
    ? /\b(uint256|uint128|uint64|uint32|uint16|uint8|int256|int128|int64|int32|int16|int8|address|bool|string|bytes|bytes32|bytes4|uint|int)\b/g
    : /\b(string|number|boolean|void|any|never|null|undefined|bigint|symbol|Promise|Array|Record|Map|Set)\b/g;

  const strings = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  const numbers = /\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/g;

  if (!keywords) {
    return <span className="text-foreground/80">{line}</span>;
  }

  // Simple token-based approach
  const parts: { start: number; end: number; cls: string }[] = [];

  // Collect string ranges first (they take priority)
  let m: RegExpExecArray | null;
  while ((m = strings.exec(line)) !== null) {
    parts.push({ start: m.index, end: m.index + m[0].length, cls: 'text-amber-300/70' });
  }

  // Keywords
  while ((m = keywords.exec(line)) !== null) {
    if (!parts.some((p) => m!.index >= p.start && m!.index < p.end)) {
      parts.push({ start: m.index, end: m.index + m[0].length, cls: 'text-primary/80' });
    }
  }

  // Types
  while ((m = typeWords.exec(line)) !== null) {
    if (!parts.some((p) => m!.index >= p.start && m!.index < p.end)) {
      parts.push({ start: m.index, end: m.index + m[0].length, cls: 'text-cyan-400/70' });
    }
  }

  // Numbers
  while ((m = numbers.exec(line)) !== null) {
    if (!parts.some((p) => m!.index >= p.start && m!.index < p.end)) {
      parts.push({ start: m.index, end: m.index + m[0].length, cls: 'text-orange-300/70' });
    }
  }

  if (parts.length === 0) {
    return <span className="text-foreground/70">{line}</span>;
  }

  parts.sort((a, b) => a.start - b.start);

  const result: React.ReactNode[] = [];
  let cursor = 0;
  for (const part of parts) {
    if (part.start > cursor) {
      result.push(<span key={cursor} className="text-foreground/70">{line.slice(cursor, part.start)}</span>);
    }
    result.push(<span key={part.start} className={part.cls}>{line.slice(part.start, part.end)}</span>);
    cursor = part.end;
  }
  if (cursor < line.length) {
    result.push(<span key={cursor} className="text-foreground/70">{line.slice(cursor)}</span>);
  }
  return <>{result}</>;
}

function FileTabs() {
  const { openFiles, activeFile, setActiveFilePath, closeFile } = useWorkspace();

  if (openFiles.length === 0) return null;

  return (
    <div className="flex items-center h-8 bg-zinc-950 border-b border-border/30 overflow-x-auto shrink-0">
      {openFiles.map((file) => {
        const isActive = activeFile?.path === file.path;
        return (
          <div
            key={file.path}
            className={cn(
              'group flex items-center gap-1.5 h-full px-3 text-[11px] border-r border-border/20 cursor-pointer transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              isActive
                ? 'bg-zinc-900 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-zinc-900',
            )}
            onClick={() => setActiveFilePath(file.path)}
          >
            <FileCode2 className="h-3 w-3 shrink-0 text-primary/40" strokeWidth={1.5} />
            <span className="truncate max-w-32">{file.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeFile(file.path);
              }}
              className="ml-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
            </button>
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-px bg-primary/60" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CodeViewer() {
  const { activeFile, openFiles } = useWorkspace();

  if (!activeFile || openFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-zinc-900 relative">
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, oklch(0.985 0 0) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/10 border border-border/10">
            <FileCode2 className="h-6 w-6 text-muted-foreground/15" strokeWidth={1.5} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm text-muted-foreground/30">Open a file to begin editing</p>
            <p className="text-[11px] text-muted-foreground/15">Select a file from the explorer or open a project</p>
          </div>
        </div>
      </div>
    );
  }

  const lines = useMemo(() => activeFile.content.split('\n'), [activeFile.content]);
  const gutterWidth = String(lines.length).length;

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      <FileTabs />
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          {lines.map((line, i) => (
            <div key={i} className="flex leading-5 hover:bg-muted/10">
              <span
                className="sticky left-0 shrink-0 text-right pr-4 pl-4 text-[11px] text-muted-foreground/25 select-none bg-zinc-950 font-mono tabular-nums"
                style={{ minWidth: `${gutterWidth + 4}ch` }}
              >
                {i + 1}
              </span>
              <pre className="text-[12px] font-mono pl-4 pr-8 whitespace-pre">
                {line.length > 0 ? highlightLine(line, activeFile.language) : '\u200B'}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
