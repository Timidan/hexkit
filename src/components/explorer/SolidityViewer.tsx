import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { cn } from '@/lib/utils';
import { FileCode, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { SourceFileTree } from './SourceFileTree';
import type { SourceFile } from '@/utils/resolver/sourceExtractor';
import {
  setupSolidityMonaco,
  SOLIDITY_EDITOR_OPTIONS,
  SOLIDITY_THEME_NAME,
  getLanguageFromPath,
} from '@/lib/monaco';

export interface SolidityViewerProps {
  /** The source files to display */
  files: SourceFile[];
  /** Currently selected file path */
  selectedFile: string | null;
  /** Callback when file selection changes */
  onFileSelect?: (path: string) => void;
  /** Optional: Highlight specific line (1-indexed) */
  highlightLine?: number;
  /** Optional: Scroll to line on mount/change */
  scrollToLine?: number;
  /** Optional: Show/hide the built-in file tree sidebar */
  showFileTree?: boolean;
  /** Optional: Custom theme */
  theme?: 'vs-dark' | 'vs-light' | 'hc-black';
  /** Optional: Additional CSS class */
  className?: string;
  /** Optional: Height (default: 100%) */
  height?: string | number;
}

export const SolidityViewer: React.FC<SolidityViewerProps> = ({
  files,
  selectedFile,
  onFileSelect,
  highlightLine,
  scrollToLine,
  showFileTree = true,
  theme = 'vs-dark',
  className,
  height = '100%',
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Force Monaco to remount when container becomes visible after display:none toggle.
  // Monaco's internal canvas doesn't recover from display:none, so we increment a key
  // to force a fresh editor instance.
  const [editorKey, setEditorKey] = useState(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let wasHidden = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries[0]?.isIntersecting;
        if (!isVisible) {
          wasHidden = true;
          return;
        }
        if (wasHidden) {
          wasHidden = false;
          setEditorKey(k => k + 1);
        }
      },
      { threshold: 0.01 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const [openTabs, setOpenTabs] = useState<string[]>([]);

  useEffect(() => {
    if (selectedFile && !openTabs.includes(selectedFile)) {
      setOpenTabs(prev => [...prev, selectedFile]);
    }
  }, [selectedFile, openTabs]);

  const getFileName = useCallback((path: string) => {
    return path.split('/').pop() || path;
  }, []);

  const closeTab = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenTabs(prev => {
      const newTabs = prev.filter(p => p !== path);
      // If closing the active tab, switch to another open tab
      if (path === selectedFile && newTabs.length > 0) {
        const idx = prev.indexOf(path);
        const nextTab = newTabs[idx === 0 ? 0 : idx - 1] || newTabs[0];
        onFileSelect?.(nextTab);
      }
      return newTabs;
    });
  }, [selectedFile, onFileSelect]);

  const currentContent = selectedFile
    ? files.find(f => f.path === selectedFile)?.content || ''
    : '';

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    setupSolidityMonaco(monaco);
  }, []);

  useEffect(() => {
    if (!editorRef.current || !highlightLine) return;

    const editor = editorRef.current;
    const monaco = (window as { monaco?: typeof import('monaco-editor') }).monaco;
    if (!monaco) return;

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    decorationsRef.current = editor.deltaDecorations([], [
      {
        range: new monaco.Range(highlightLine, 1, highlightLine, 1),
        options: {
          isWholeLine: true,
          className: 'highlighted-line',
          linesDecorationsClassName: 'highlighted-line-gutter',
        },
      },
    ]);
  }, [highlightLine, currentContent]);

  useEffect(() => {
    if (!editorRef.current || !scrollToLine) return;

    editorRef.current.revealLineInCenter(scrollToLine);
  }, [scrollToLine, currentContent]);

  const handleFileSelect = useCallback(
    (path: string) => {
      onFileSelect?.(path);
    },
    [onFileSelect]
  );

  const editorComponent = (
    <Editor
      key={editorKey}
      height={height}
      language={getLanguageFromPath(selectedFile)}
      value={currentContent}
      theme={theme === 'vs-dark' ? SOLIDITY_THEME_NAME : theme}
      options={SOLIDITY_EDITOR_OPTIONS}
      onMount={handleEditorMount}
      loading={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Loading editor...
        </div>
      }
    />
  );

  if (!showFileTree || files.length <= 1) {
    return (
      <div ref={containerRef} className={cn('h-full w-full', className)} style={{ height }}>
        {editorComponent}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)} style={{ height }}>
      <ResizablePanelGroup id="solidity-viewer-group" orientation="horizontal">
        <ResizablePanel id="file-tree-panel" defaultSize={20} minSize={10}>
          <div className="h-full border-r border-border bg-background">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
              Source Files
            </div>
            <SourceFileTree
              files={files}
              selectedPath={selectedFile}
              onSelect={handleFileSelect}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="editor-panel" defaultSize={80} minSize={40}>
          <div className="flex flex-col h-full">
            {openTabs.length > 0 && (
              <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto shrink-0">
                {openTabs.map(tabPath => (
                  <div
                    key={tabPath}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 border-r border-border cursor-pointer text-sm font-light whitespace-nowrap transition-colors",
                      "hover:bg-muted/50",
                      tabPath === selectedFile
                        ? "bg-background text-foreground"
                        : "text-muted-foreground"
                    )}
                    onClick={() => onFileSelect?.(tabPath)}
                  >
                    <FileCode className="h-3.5 w-3.5 shrink-0" />
                    <span>{getFileName(tabPath)}</span>
                    <Button
                      type="button"
                      variant="icon-borderless"
                      size="icon-inline"
                      className="ml-1 p-0.5 rounded hover:bg-muted-foreground/20 transition-colors"
                      onClick={(e) => closeTab(tabPath, e)}
                      aria-label="Close tab"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex-1 min-h-0">
              {editorComponent}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default SolidityViewer;
