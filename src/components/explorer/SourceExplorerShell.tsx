// Chain-agnostic Monaco-backed source explorer shell.
//
// Owns: file-tree + closeable tabs + active-file routing + active-line
// decoration + Monaco mount. Knows nothing about Solidity, Cairo, or
// any one provider. Per-language wrappers (`SolidityViewer`,
// `CairoSourceExplorer`) thread their language/theme/Monaco
// registration through the props.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Editor from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { FileCode, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SourceFileTree } from "./SourceFileTree";

export interface SourceExplorerFile {
  path: string;
  content: string;
}

export interface SourceExplorerShellProps {
  files: SourceExplorerFile[];
  selectedFile: string | null;
  onFileSelect?: (path: string) => void;

  /** Resolver for the Monaco `language` of a given path. The Solidity
   *  wrapper passes `getLanguageFromPath`; the Cairo wrapper picks
   *  cairo / ini / json. */
  resolveLanguage: (path: string | null) => string;
  /** Monaco theme name. Wrappers register their theme + pass its name. */
  theme: string;
  /** Monaco editor options. */
  editorOptions: editor.IStandaloneEditorConstructionOptions;
  /** Hook called once Monaco mounts, after the editor is constructed.
   *  Wrappers run their language registration + theme setup here. */
  onMonacoReady?: (
    editor: editor.IStandaloneCodeEditor,
    monaco: typeof import("monaco-editor"),
  ) => void;

  /** 1-based line to highlight via a whole-line decoration. */
  highlightLine?: number;
  /** 1-based line to reveal in the centre on mount / change. */
  scrollToLine?: number;

  /** Hide the file-tree sidebar. Defaults to `true` when there are >1 files. */
  showFileTree?: boolean;
  /** When the file picker is hidden, callers can still inject a label
   *  in the tab strip (e.g. "Cairo · main"). */
  filePillLabel?: React.ReactNode;
  /** Additional decoration above the editor — used by wrappers to
   *  surface verification badges, copy buttons, etc. */
  topRightSlot?: React.ReactNode;

  /** Hide the tab strip entirely (single-file explorers). */
  hideTabs?: boolean;

  className?: string;
  height?: string | number;
}

export const SourceExplorerShell: React.FC<SourceExplorerShellProps> = ({
  files,
  selectedFile,
  onFileSelect,
  resolveLanguage,
  theme,
  editorOptions,
  onMonacoReady,
  highlightLine,
  scrollToLine,
  showFileTree,
  filePillLabel,
  topRightSlot,
  hideTabs = false,
  className,
  height = "100%",
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Force Monaco to remount when the container becomes visible after a
  // display:none toggle. Monaco's internal canvas doesn't recover from
  // display:none, so we increment a key to force a fresh editor.
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
          setEditorKey((k) => k + 1);
        }
      },
      { threshold: 0.01 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const [openTabs, setOpenTabs] = useState<string[]>([]);
  useEffect(() => {
    if (!selectedFile) return;
    setOpenTabs((prev) =>
      prev.includes(selectedFile) ? prev : [...prev, selectedFile],
    );
  }, [selectedFile]);

  const getFileName = useCallback(
    (path: string) => path.split("/").pop() || path,
    [],
  );

  const closeTab = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenTabs((prev) => {
        const newTabs = prev.filter((p) => p !== path);
        if (path === selectedFile && newTabs.length > 0) {
          const idx = prev.indexOf(path);
          const nextTab = newTabs[idx === 0 ? 0 : idx - 1] || newTabs[0];
          onFileSelect?.(nextTab);
        }
        return newTabs;
      });
    },
    [selectedFile, onFileSelect],
  );

  const currentContent = useMemo(() => {
    if (!selectedFile) return "";
    return files.find((f) => f.path === selectedFile)?.content || "";
  }, [files, selectedFile]);

  const handleEditorMount: OnMount = useCallback(
    (ed, monaco) => {
      editorRef.current = ed;
      monacoRef.current = monaco;
      onMonacoReady?.(ed, monaco);
    },
    [onMonacoReady],
  );

  // Whole-line decoration for the active line. Cleared whenever the
  // line / source changes.
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    if (!highlightLine) {
      decorationsRef.current = ed.deltaDecorations(decorationsRef.current, []);
      return;
    }
    decorationsRef.current = ed.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(highlightLine, 1, highlightLine, 1),
        options: {
          isWholeLine: true,
          className: "highlighted-line",
          linesDecorationsClassName: "highlighted-line-gutter",
        },
      },
    ]);
  }, [highlightLine, currentContent]);

  // Reveal the requested line. Done independently of the highlight so
  // a caller can scroll without highlighting (e.g. switching files).
  useEffect(() => {
    if (!editorRef.current || !scrollToLine) return;
    editorRef.current.revealLineInCenter(scrollToLine);
  }, [scrollToLine, currentContent]);

  const editorComponent = (
    <Editor
      key={editorKey}
      height={height}
      language={resolveLanguage(selectedFile)}
      value={currentContent}
      theme={theme}
      options={editorOptions}
      onMount={handleEditorMount}
      loading={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Loading editor...
        </div>
      }
    />
  );

  const treeAutoVisible = showFileTree ?? files.length > 1;

  if (!treeAutoVisible) {
    // Single-file path: match the original `SolidityViewer` chrome
    // exactly — just the editor, no tab strip or file-pill row. The
    // `topRightSlot` overlay is opt-in via prop and only renders when
    // the wrapper passes content (Cairo wrapper does, EVM doesn't).
    // `filePillLabel` is also opt-in for callers who *want* a tab
    // strip in single-file mode.
    return (
      <div
        ref={containerRef}
        className={cn("h-full w-full relative", className)}
        style={{ height }}
      >
        {topRightSlot && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
            {topRightSlot}
          </div>
        )}
        {!hideTabs && filePillLabel && (
          <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 border-r border-border text-sm font-light whitespace-nowrap text-foreground bg-background">
              <FileCode className="h-3.5 w-3.5 shrink-0" />
              <span>{filePillLabel}</span>
            </div>
          </div>
        )}
        {editorComponent}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full", className)}
      style={{ height }}
    >
      <ResizablePanelGroup id="source-explorer-shell" orientation="horizontal">
        <ResizablePanel id="file-tree-panel" defaultSize={20} minSize={10}>
          <div className="h-full border-r border-border bg-background">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
              Source Files
            </div>
            <SourceFileTree
              files={files}
              selectedPath={selectedFile}
              onSelect={(p) => onFileSelect?.(p)}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="editor-panel" defaultSize={80} minSize={40}>
          <div className="flex flex-col h-full relative">
            {topRightSlot && (
              <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                {topRightSlot}
              </div>
            )}
            {!hideTabs && openTabs.length > 0 && (
              <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto shrink-0">
                {openTabs.map((tabPath) => (
                  <div
                    key={tabPath}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 border-r border-border cursor-pointer text-sm font-light whitespace-nowrap transition-colors",
                      "hover:bg-muted/50",
                      tabPath === selectedFile
                        ? "bg-background text-foreground"
                        : "text-muted-foreground",
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
            <div className="flex-1 min-h-0">{editorComponent}</div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default SourceExplorerShell;
