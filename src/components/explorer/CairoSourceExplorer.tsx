// Cairo-flavoured wrapper over `SourceExplorerShell`. Adapts a
// `CairoSourceResponse` (Voyager passthrough — files + scarbToml +
// verified flag + mainFile) into the shell's `files / selectedFile`
// contract, layers the Cairo Monaco theme + language registration on
// top, and surfaces Starknet-specific chrome (verification badge,
// Sierra-fallback affordance) via the shell's slot props.

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  CAIRO_THEME_NAME,
  setupCairoMonaco,
} from "@/lib/monaco";
import type { editor as MonacoEditor } from "monaco-editor";
import type { CairoSourceResponse } from "@/chains/starknet/cairoSourceClient";
import {
  SourceExplorerShell,
  type SourceExplorerFile,
} from "./SourceExplorerShell";

export interface CairoSourceExplorerProps {
  /** Voyager response. `null` triggers the empty / unverified state. */
  source: CairoSourceResponse | null;
  /** Bridge fetch in flight. */
  loading?: boolean;
  /** Bridge / Voyager error. Null when the call succeeded but the
   *  class isn't verified — that's a data state, not an error. */
  error?: string | null;
  /** Active line for the current file. 1-based. */
  highlightLine?: number;
  scrollToLine?: number;
  /** Caller-controlled file selection (lets the parent jump between
   *  files based on debugger state). When omitted, the explorer picks
   *  `mainFile` then falls back to the first file. */
  selectedFile?: string | null;
  onFileSelect?: (path: string) => void;
  /** Click handler for the "View Sierra instead" affordance shown when
   *  the class isn't verified. */
  onViewSierra?: () => void;
  /** Click handler for the "View ABI" affordance shown when the class
   *  isn't verified. ABI is always available from on-chain class data. */
  onViewAbi?: () => void;
  className?: string;
  height?: string | number;
}

const SCARB_TOML_PATH = "Scarb.toml";

const CAIRO_EDITOR_OPTIONS: MonacoEditor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  wordWrap: "on",
  automaticLayout: true,
  fontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
  padding: { top: 8 },
  scrollbar: {
    vertical: "visible",
    horizontal: "visible",
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
};

function getCairoLanguage(path: string | null): string {
  if (!path) return "cairo";
  if (path.endsWith(".cairo")) return "cairo";
  if (path.endsWith(".toml")) return "ini";
  if (path.endsWith(".json")) return "json";
  return "cairo";
}

export const CairoSourceExplorer: React.FC<CairoSourceExplorerProps> = ({
  source,
  loading = false,
  error,
  highlightLine,
  scrollToLine,
  selectedFile,
  onFileSelect,
  onViewSierra,
  onViewAbi,
  className,
  height = "100%",
}) => {
  const treeFiles = useMemo<SourceExplorerFile[]>(() => {
    if (!source) return [];
    const sorted = [...source.files].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    if (source.scarbToml) {
      return [
        { path: SCARB_TOML_PATH, content: source.scarbToml },
        ...sorted,
      ];
    }
    return sorted;
  }, [source]);

  const initialPath = useMemo<string>(() => {
    if (!source) return "";
    if (source.mainFile && treeFiles.some((f) => f.path === source.mainFile)) {
      return source.mainFile;
    }
    return treeFiles[0]?.path ?? "";
  }, [source, treeFiles]);

  const [internalPath, setInternalPath] = useState<string>(initialPath);
  useEffect(() => {
    setInternalPath(initialPath);
  }, [initialPath]);

  const activePath = selectedFile ?? internalPath;
  const handleSelect = (path: string) => {
    setInternalPath(path);
    onFileSelect?.(path);
  };

  if (loading) {
    return (
      <div
        className={className}
        style={{
          height,
          padding: "16px",
          color: "var(--sim-text-muted, #6b6b7b)",
          fontSize: "12px",
        }}
      >
        Loading Cairo source…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={className}
        style={{
          height,
          padding: "16px",
          border: "1px solid rgba(248, 113, 113, 0.4)",
          background: "rgba(248, 113, 113, 0.05)",
          borderRadius: "8px",
          fontSize: "12px",
          color: "#f87171",
          fontFamily: "monospace",
          wordBreak: "break-all",
        }}
      >
        Failed to fetch Cairo source: {error}
      </div>
    );
  }

  if (!source || !source.verified || treeFiles.length === 0) {
    return (
      <div
        className={className}
        style={{
          height,
          padding: "32px 24px",
          textAlign: "center",
          border: "1px dashed rgba(255,255,255,0.08)",
          borderRadius: "8px",
          color: "var(--sim-text-muted, #6b6b7b)",
          fontSize: "13px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div style={{ color: "var(--sim-text, #e5e5e5)", fontWeight: 500 }}>
          This class isn't verified on Voyager.
        </div>
        <div style={{ maxWidth: "420px", lineHeight: 1.5 }}>
          Verified Cairo source isn't available for this class hash. The ABI
          and Sierra representation are still accessible from on-chain data.
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
          {onViewAbi && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onViewAbi}
            >
              View ABI
            </Button>
          )}
          {onViewSierra && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onViewSierra}
            >
              View Sierra
            </Button>
          )}
        </div>
      </div>
    );
  }

  const currentFile =
    treeFiles.find((f) => f.path === activePath) ?? treeFiles[0];

  const topRightSlot = (
    <>
      <Badge variant="outline" className="text-[10px] uppercase">
        Voyager · verified
      </Badge>
      {currentFile ? <CopyButton value={currentFile.content} /> : null}
    </>
  );

  return (
    <div className={className} style={{ height }}>
      <SourceExplorerShell
        files={treeFiles}
        selectedFile={activePath || null}
        onFileSelect={handleSelect}
        resolveLanguage={getCairoLanguage}
        theme={CAIRO_THEME_NAME}
        editorOptions={CAIRO_EDITOR_OPTIONS}
        onMonacoReady={(_ed, monaco) => setupCairoMonaco(monaco)}
        highlightLine={highlightLine}
        scrollToLine={scrollToLine}
        topRightSlot={topRightSlot}
        height="100%"
      />
    </div>
  );
};

export default CairoSourceExplorer;
