/**
 * Source View Panel
 *
 * Displays source code with Monaco editor, providing syntax highlighting,
 * line numbers, current line highlighting, and breakpoint gutters.
 *
 * When source files are not available, shows useful context info
 * about the current execution state.
 */

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { Code2, FileQuestion, Terminal } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { useDebug } from '../../contexts/DebugContext';
import { useSimulation } from '../../contexts/SimulationContext';
import type { BreakpointLocation } from '../../types/debug';
import { setupSolidityMonaco, DEBUG_EDITOR_OPTIONS, SOLIDITY_THEME_NAME } from '@/lib/monaco';
import { buildDebugDecorations } from '@/lib/monaco';
import '@/lib/monaco/monaco-debug.css';

interface SourceViewPanelProps {
  className?: string;
}

export const SourceViewPanel: React.FC<SourceViewPanelProps> = React.memo(({ className }) => {
  const {
    sourceFiles,
    currentFile,
    currentLine,
    setCurrentFile,
    breakpoints,
    addBreakpoint,
    removeBreakpoint,
    currentSnapshot,
    callStack,
    currentExecutingAddress,
  } = useDebug();
  const { contractContext, currentSimulation } = useSimulation();

  // Monaco editor refs
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const decorationIdsRef = useRef<string[]>([]);

  // Ref for currentFile to avoid stale closure in onMouseDown handler
  const currentFileRef = useRef(currentFile);
  useEffect(() => { currentFileRef.current = currentFile; }, [currentFile]);

  // Direct EDB source data from contract context
  const sourceTexts = contractContext?.sourceTexts;

  // Get trace contracts from simulation context (fallback for Diamond proxy support)
  const traceContracts = contractContext?.traceContracts;

  // Look up source for current executing address from trace contracts
  const traceContractSource = useMemo(() => {
    if (!currentExecutingAddress || !traceContracts) return null;
    const contract = traceContracts.get(currentExecutingAddress);
    if (contract?.sourceCode) {
      return {
        path: `trace://${contract.address}`,
        content: contract.sourceCode,
        contractName: contract.name || `Contract ${contract.address.slice(0, 10)}...`,
      };
    }
    return null;
  }, [currentExecutingAddress, traceContracts]);

  // Get current source content - PRIORITIZE sourceTexts from EDB trace
  const currentSource = useMemo(() => {
    if (!currentFile) return null;

    // 1. PRIORITY: Check sourceTexts from context (EDB trace data)
    // Direct EDB source data from contract context
    if (sourceTexts) {
      // Exact match
      if (sourceTexts[currentFile]) {
        return {
          path: currentFile,
          content: sourceTexts[currentFile],
          contractName: currentFile.split('/').pop()?.replace('.sol', '') || currentFile,
        };
      }

      // Fuzzy match by filename (for paths like "src/Contract.sol" vs "Contract.sol")
      const filename = currentFile.split('/').pop();
      if (filename) {
        for (const [path, content] of Object.entries(sourceTexts)) {
          // Match by filename at end of path
          if (path.endsWith('/' + filename) || path === filename || path.endsWith(filename)) {
            return {
              path,
              content,
              contractName: filename.replace('.sol', ''),
            };
          }
        }

        // Also try matching by just the contract name part (e.g., "GotchiLendingFacet" in "contracts/.../GotchiLendingFacet.sol")
        const contractName = filename.replace('.sol', '');
        for (const [path, content] of Object.entries(sourceTexts)) {
          if (path.includes(contractName + '.sol')) {
            return {
              path,
              content,
              contractName,
            };
          }
        }
      }
    }

    // 2. Fallback: Try EDB source files from debug context
    if (sourceFiles.has(currentFile)) {
      return sourceFiles.get(currentFile)!;
    }

    // 3. Fallback: Check if currentFile is a trace:// path (user selected from dropdown)
    if (currentFile.startsWith('trace://') && traceContracts) {
      const address = currentFile.replace('trace://', '').toLowerCase();
      const contract = traceContracts.get(address);
      if (contract?.sourceCode) {
        return {
          path: currentFile,
          content: contract.sourceCode,
          contractName: contract.name || `Contract ${address.slice(0, 10)}...`,
        };
      }
    }

    // 4. Fallback: trace contract source for current executing address
    if (traceContractSource) {
      return traceContractSource;
    }

    return null;
  }, [currentFile, sourceFiles, sourceTexts, traceContracts, traceContractSource]);

  // Get breakpoints for current file
  const fileBreakpoints = useMemo(() => {
    if (!currentFile) return new Set<number>();
    return new Set(
      breakpoints
        .filter(bp => bp.location.type === 'source' && bp.location.filePath === currentFile)
        .map(bp => (bp.location as { lineNumber: number }).lineNumber)
    );
  }, [breakpoints, currentFile]);

  // Handle breakpoint toggle (called from Monaco glyph margin click)
  const handleBreakpointToggle = useCallback((lineNumber: number) => {
    const file = currentFileRef.current;
    if (!file) return;

    const existingBreakpoint = breakpoints.find(
      bp =>
        bp.location.type === 'source' &&
        bp.location.filePath === file &&
        (bp.location as { lineNumber: number }).lineNumber === lineNumber
    );

    if (existingBreakpoint) {
      removeBreakpoint(existingBreakpoint.id);
    } else {
      const location: BreakpointLocation = {
        type: 'source',
        bytecodeAddress: '0x0', // Will be resolved by EDB
        filePath: file,
        lineNumber,
      };
      addBreakpoint(location);
    }
  }, [breakpoints, addBreakpoint, removeBreakpoint]);

  // Handle Monaco editor mount
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setupSolidityMonaco(monaco);

    // Handle glyph margin clicks for breakpoint toggling
    editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GLYPH_MARGIN) {
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber) {
          handleBreakpointToggle(lineNumber);
        }
      }
    });
  }, [handleBreakpointToggle]);

  // Apply debug decorations (breakpoints + current line)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const decorations = buildDebugDecorations(fileBreakpoints, currentLine);
    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      decorations,
    );
  }, [fileBreakpoints, currentLine, currentSource]);

  // Auto-scroll to current line
  useEffect(() => {
    if (!editorRef.current || currentLine === null) return;
    editorRef.current.revealLineInCenter(currentLine);
  }, [currentLine]);

  // Available files for dropdown - PRIORITIZE sourceTexts from EDB trace
  const fileOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; isTraceContract?: boolean; isEdbSource?: boolean }> = [];
    const addedPaths = new Set<string>();

    // 1. PRIORITY: Add sourceTexts from context (EDB trace data)
    // Direct EDB source data from contract context
    if (sourceTexts) {
      for (const [path, content] of Object.entries(sourceTexts)) {
        if (content && path.endsWith('.sol')) {
          options.push({
            value: path,
            label: path.split('/').pop() || path,
            isEdbSource: true,
          });
          addedPaths.add(path);
        }
      }
    }

    // 2. Fallback: Add EDB source files from debug context
    for (const [path, file] of sourceFiles.entries()) {
      if (!addedPaths.has(path)) {
        options.push({
          value: path,
          label: file.contractName || path.split('/').pop() || path,
        });
        addedPaths.add(path);
      }
    }

    // 3. Fallback: Add trace contracts (if they have source code)
    if (traceContracts) {
      for (const [address, contract] of traceContracts.entries()) {
        if (contract.sourceCode && contract.verified) {
          const tracePath = `trace://${address}`;
          if (!addedPaths.has(tracePath)) {
            options.push({
              value: tracePath,
              label: contract.name || `${address.slice(0, 10)}...`,
              isTraceContract: true,
            });
            addedPaths.add(tracePath);
          }
        }
      }
    }

    return options;
  }, [sourceFiles, sourceTexts, traceContracts]);

  // Auto-select the first available source file when sourceTexts becomes populated
  // This ensures source code displays immediately instead of showing "not available"
  useEffect(() => {
    // If currentFile is already set and valid, don't auto-select
    const isValidFile = currentFile && (
      sourceTexts?.[currentFile] ||  // Valid in sourceTexts
      sourceFiles.has(currentFile) ||  // Valid in sourceFiles
      currentFile.startsWith('trace://')  // Valid trace path
    );
    if (isValidFile) {
      return;
    }

    // Try to auto-select from available options (sourceTexts is prioritized in fileOptions)
    if (fileOptions.length > 0) {
      // Prefer an EDB source file (from sourceTexts) - they have proper file paths
      const edbSourceOption = fileOptions.find(opt => opt.isEdbSource);
      if (edbSourceOption) {
        setCurrentFile(edbSourceOption.value);
        return;
      }

      // Fallback: Prefer the main contract if available as trace://
      const mainContractAddress = contractContext?.address?.toLowerCase();
      if (mainContractAddress && traceContracts) {
        const mainContractPath = `trace://${mainContractAddress}`;
        const mainContract = traceContracts.get(mainContractAddress);
        if (mainContract?.sourceCode && mainContract.verified) {
          setCurrentFile(mainContractPath);
          return;
        }
      }

      // Otherwise select first available
      setCurrentFile(fileOptions[0].value);
    }
  }, [fileOptions, currentFile, sourceFiles, sourceTexts, traceContracts, contractContext?.address, setCurrentFile]);

  if (!currentSource) {
    // Get current execution context for fallback display
    const currentFrame = callStack.length > 0 ? callStack[callStack.length - 1] : null;
    const functionName = currentFrame?.functionName || currentSimulation?.functionName || 'Unknown';

    // For Diamond proxies, show the current facet's info
    const currentTraceContract = currentExecutingAddress
      ? traceContracts?.get(currentExecutingAddress)
      : null;
    const contractName = currentTraceContract?.name
      || contractContext?.name
      || currentFrame?.contractName
      || 'Contract';
    const contractAddress = currentExecutingAddress
      || contractContext?.address
      || currentFrame?.address;
    const isVerified = currentTraceContract?.verified ?? false;

    return (
      <Card className={`flex flex-col h-full ${className || ''}`}>
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            Source Code
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-4">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <FileQuestion className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm text-muted-foreground mb-2">
              Source code not available
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-[250px]">
              {isVerified
                ? 'Contract is verified but source could not be loaded.'
                : 'Source code could not be loaded for this contract.'}
            </p>
            {currentExecutingAddress && (
              <p className="text-xs text-muted-foreground/50 mt-2 font-mono">
                Executing: {currentExecutingAddress.slice(0, 10)}...{currentExecutingAddress.slice(-6)}
              </p>
            )}
          </div>

          {/* Show current execution context */}
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase font-medium">
                Current Context
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {functionName && functionName !== 'Unknown' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Function:</span>
                  <span className="font-mono text-stone-300">{functionName}</span>
                </div>
              )}
              {contractName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contract:</span>
                  <span className="font-medium text-cyan-400">{contractName}</span>
                </div>
              )}
              {contractAddress && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Address:</span>
                  <span className="font-mono text-muted-foreground/80">
                    {contractAddress.slice(0, 10)}...{contractAddress.slice(-6)}
                  </span>
                </div>
              )}
              {currentSnapshot?.type === 'opcode' && 'opcodeName' in currentSnapshot.detail && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Opcode:</span>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {(currentSnapshot.detail as { opcodeName: string }).opcodeName}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`flex flex-col h-full min-h-0 overflow-hidden ${className || ''}`}>
      <CardHeader className="py-2 px-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">Source Code</CardTitle>
          <div className="flex items-center gap-2">
            {fileOptions.length > 1 ? (
              <Select value={currentFile || ''} onValueChange={setCurrentFile}>
                <SelectTrigger className="h-7 text-xs w-[180px]">
                  <SelectValue placeholder="Select file" />
                </SelectTrigger>
                <SelectContent>
                  {fileOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary" className="text-xs font-normal">
                {fileOptions[0]?.label || 'Unknown'}
              </Badge>
            )}
            {currentLine !== null && (
              <Badge variant="outline" className="text-xs font-mono">
                Line {currentLine}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 p-0">
        <Editor
          height="100%"
          language="solidity"
          value={currentSource.content}
          theme={SOLIDITY_THEME_NAME}
          options={DEBUG_EDITOR_OPTIONS}
          onMount={handleEditorMount}
          loading={
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading editor...
            </div>
          }
        />
      </CardContent>
    </Card>
  );
});

SourceViewPanel.displayName = 'SourceViewPanel';

export default SourceViewPanel;
