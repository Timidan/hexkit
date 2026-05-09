// Chain-agnostic Monaco source view for any step debugger.
//
// Owns the Monaco mount + theme application + active-line decoration +
// optional glyph-margin breakpoint clicks. The chain wrapper supplies
// the source content and resolution logic.
//
// Header / empty state are slot-driven so callers can render their own
// chrome (file picker, "sierra @ 0x..." chip, "source unavailable + try
// re-running with Debug" affordances, etc.).

import React, { useCallback, useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Code } from "@phosphor-icons/react";
import { Card, CardHeader, CardTitle, CardContent } from "../../ui/card";
import {
  applySolidityTheme,
  buildCurrentLineDecoration,
  buildDebugDecorations,
  DEBUG_EDITOR_OPTIONS,
  SOLIDITY_THEME_NAME,
} from "@/lib/monaco";
import "@/lib/monaco/monaco-debug.css";

export interface SourceViewPanelShellProps {
  className?: string;
  /** Title shown in the header. Defaults to "Source Code". */
  title?: string;
  /** Slot for header right-side controls (file picker, line badge, …). */
  headerSlot?: React.ReactNode;
  /** Loaded source. `null` renders the empty state. */
  source: { content: string; language?: string; path?: string } | null;
  /** Current active line (1-based). `null` clears the decoration. */
  currentLine: number | null;
  /** Lines that have a breakpoint set. Empty by default. */
  breakpoints?: Set<number>;
  /** Click handler for the glyph margin. Omit to disable breakpoint
   *  toggling entirely. */
  onBreakpointToggle?: (line: number) => void;
  /** Monaco editor options override. Defaults to `DEBUG_EDITOR_OPTIONS`. */
  editorOptions?: editor.IStandaloneEditorConstructionOptions;
  /** Theme name to apply. Defaults to the Solidity theme — works fine
   *  for any plaintext-ish source (Sierra, Cairo, etc.). */
  theme?: string;
  /** Loading state. Pass a node or `true` for a default spinner. */
  loading?: React.ReactNode | boolean;
  /** Error state. Pass any node — the shell wraps in standard chrome. */
  error?: React.ReactNode;
  /** Custom empty state body. Defaults to a generic "source unavailable". */
  emptyState?: React.ReactNode;
  /** Hide the "Source Code" header card chrome (use bare editor). Useful
   *  when the parent already provides a header (e.g. the Sierra `sierra @`
   *  chip in the Starknet debugger). */
  bareChrome?: boolean;
  /** Called once Monaco and the editor are both ready. Use to register
   *  custom languages or themes (e.g. `setupCairoMonaco`). */
  onMonacoReady?: (
    ed: editor.IStandaloneCodeEditor,
    monaco: typeof import("monaco-editor"),
  ) => void;
}

export const SourceViewPanelShell: React.FC<SourceViewPanelShellProps> = React.memo(
  ({
    className,
    title = "Source Code",
    headerSlot,
    source,
    currentLine,
    breakpoints,
    onBreakpointToggle,
    editorOptions = DEBUG_EDITOR_OPTIONS,
    theme = SOLIDITY_THEME_NAME,
    loading,
    error,
    emptyState,
    bareChrome = false,
    onMonacoReady,
  }) => {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
    const decorationIdsRef = useRef<string[]>([]);

    const handleEditorMount: OnMount = useCallback(
      (ed, monaco) => {
        editorRef.current = ed;
        monacoRef.current = monaco;
        applySolidityTheme(monaco);
        onMonacoReady?.(ed, monaco);

        if (onBreakpointToggle) {
          ed.onMouseDown((e) => {
            if (e.target.type === monaco.editor.MouseTargetType.GLYPH_MARGIN) {
              const lineNumber = e.target.position?.lineNumber;
              if (lineNumber) onBreakpointToggle(lineNumber);
            }
          });
        }
      },
      [onBreakpointToggle, onMonacoReady],
    );

    useEffect(() => {
      const ed = editorRef.current;
      if (!ed) return;

      if (breakpoints && breakpoints.size > 0) {
        decorationIdsRef.current = ed.deltaDecorations(
          decorationIdsRef.current,
          buildDebugDecorations(breakpoints, currentLine),
        );
      } else if (currentLine !== null) {
        decorationIdsRef.current = ed.deltaDecorations(
          decorationIdsRef.current,
          buildCurrentLineDecoration(currentLine),
        );
      } else {
        decorationIdsRef.current = ed.deltaDecorations(
          decorationIdsRef.current,
          [],
        );
      }
    }, [breakpoints, currentLine, source?.content]);

    useEffect(() => {
      if (!editorRef.current || currentLine === null) return;
      editorRef.current.revealLineInCenter(currentLine);
    }, [currentLine]);

    const body = (() => {
      if (loading) {
        if (loading === true) {
          return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading editor…
            </div>
          );
        }
        return loading;
      }
      if (error) return error;
      if (!source) {
        return emptyState ?? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Source unavailable
          </div>
        );
      }
      return (
        <Editor
          height="100%"
          language={source.language ?? "plaintext"}
          theme={theme}
          value={source.content}
          options={editorOptions}
          onMount={handleEditorMount}
          loading={
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading editor…
            </div>
          }
        />
      );
    })();

    if (bareChrome) {
      return (
        <div className={`flex flex-col h-full min-h-0 ${className || ""}`}>
          {(headerSlot || title) && (
            <div className="px-3 py-1.5 flex items-center gap-2 border-b text-[11px] flex-shrink-0">
              {!headerSlot && <Code size={12} className="opacity-60" />}
              {headerSlot}
            </div>
          )}
          <div className="flex-1 min-h-0">{body}</div>
        </div>
      );
    }

    return (
      <Card className={`flex flex-col h-full min-h-0 overflow-hidden ${className || ""}`}>
        <CardHeader className="py-2 px-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Code className="h-4 w-4" />
              {title}
            </CardTitle>
            {headerSlot && <div className="flex items-center gap-2">{headerSlot}</div>}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0">{body}</CardContent>
      </Card>
    );
  },
);

SourceViewPanelShell.displayName = "SourceViewPanelShell";

export default SourceViewPanelShell;
