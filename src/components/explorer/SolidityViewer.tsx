// EVM-flavoured wrapper over `SourceExplorerShell`. Only the
// language registration + theme application + Solidity-aware Monaco
// options live here; the file tree, tabs, decorations, and scroll
// behaviour all sit in the chain-agnostic shell.

import React from "react";
import {
  setupSolidityMonaco,
  SOLIDITY_EDITOR_OPTIONS,
  SOLIDITY_THEME_NAME,
  getLanguageFromPath,
} from "@/lib/monaco";
import type { SourceFile } from "@/utils/resolver/sourceExtractor";
import { SourceExplorerShell } from "./SourceExplorerShell";

export interface SolidityViewerProps {
  files: SourceFile[];
  selectedFile: string | null;
  onFileSelect?: (path: string) => void;
  highlightLine?: number;
  scrollToLine?: number;
  showFileTree?: boolean;
  /** Custom Monaco theme. Defaults to the Solidity dark theme. Pass
   *  `vs-light` / `hc-black` to override. */
  theme?: "vs-dark" | "vs-light" | "hc-black";
  className?: string;
  height?: string | number;
}

export const SolidityViewer: React.FC<SolidityViewerProps> = ({
  files,
  selectedFile,
  onFileSelect,
  highlightLine,
  scrollToLine,
  showFileTree,
  theme = "vs-dark",
  className,
  height = "100%",
}) => {
  return (
    <SourceExplorerShell
      files={files}
      selectedFile={selectedFile}
      onFileSelect={onFileSelect}
      resolveLanguage={getLanguageFromPath}
      theme={theme === "vs-dark" ? SOLIDITY_THEME_NAME : theme}
      editorOptions={SOLIDITY_EDITOR_OPTIONS}
      onMonacoReady={(_editor, monaco) => setupSolidityMonaco(monaco)}
      highlightLine={highlightLine}
      scrollToLine={scrollToLine}
      showFileTree={showFileTree}
      className={className}
      height={height}
    />
  );
};

export default SolidityViewer;
