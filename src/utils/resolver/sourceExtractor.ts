/**
 * Source Code Extractor
 *
 * Normalizes multi-file source code from different providers into a consistent format.
 * Handles Sourcify multi-file, Etherscan JSON format, and flattened single-file.
 */

import type { ResolveResult } from './types';

export interface SourceFile {
  path: string;
  content: string;
}

export interface MultiFileSource {
  files: SourceFile[];
  mainFile: string | null;
}

/**
 * Extract all source files from a ResolveResult.
 *
 * Handles:
 * - Sourcify: Multi-file `sources` object in metadata
 * - Etherscan: Single file OR multi-file JSON format in sourceCode
 * - Flattened: Single string in metadata.sourceCode
 */
export function extractSourceFiles(result: ResolveResult): MultiFileSource {
  const files: SourceFile[] = [];
  let mainFile: string | null = null;

  const metadata = result.metadata;
  if (!metadata) {
    return { files, mainFile };
  }

  // Priority 1: Check for multi-file sources (Sourcify format)
  if (metadata.sources && typeof metadata.sources === 'object') {
    for (const [path, content] of Object.entries(metadata.sources)) {
      if (typeof content === 'string' && content.trim()) {
        files.push({ path, content });
      }
    }
    mainFile = metadata.mainSourcePath || null;

    // If we have files, return them
    if (files.length > 0) {
      // If no main file specified, try to find one
      if (!mainFile && result.name) {
        const match = files.find(f =>
          f.path.toLowerCase().includes(result.name!.toLowerCase())
        );
        if (match) mainFile = match.path;
      }
      // Fall back to first .sol file
      if (!mainFile) {
        const solFile = files.find(f => f.path.endsWith('.sol'));
        if (solFile) mainFile = solFile.path;
      }
      return { files, mainFile };
    }
  }

  // Priority 2: Check for sourceCode field
  if (metadata.sourceCode && typeof metadata.sourceCode === 'string') {
    const sourceCode = metadata.sourceCode.trim();

    // Check if it's Etherscan multi-file JSON format
    // Format: {"sources":{"Contract.sol":{"content":"..."}}}
    // or: {{"Contract.sol":{"content":"..."}}} (double brace format)
    if (sourceCode.startsWith('{') && sourceCode.includes('"content"')) {
      try {
        // Handle double brace format from Etherscan
        let jsonStr = sourceCode;
        if (jsonStr.startsWith('{{')) {
          jsonStr = jsonStr.slice(1, -1);
        }

        const parsed = JSON.parse(jsonStr);

        // Check for {"sources": {...}} wrapper
        const sourcesObj = parsed.sources || parsed;

        if (sourcesObj && typeof sourcesObj === 'object') {
          for (const [path, fileData] of Object.entries(sourcesObj)) {
            const content = (fileData as { content?: string })?.content;
            if (typeof content === 'string' && content.trim()) {
              files.push({ path, content });
            }
          }

          if (files.length > 0) {
            // Find main file
            if (result.name) {
              const match = files.find(f =>
                f.path.toLowerCase().includes(result.name!.toLowerCase())
              );
              if (match) mainFile = match.path;
            }
            if (!mainFile) {
              const solFile = files.find(f => f.path.endsWith('.sol'));
              if (solFile) mainFile = solFile.path;
            }
            return { files, mainFile };
          }
        }
      } catch {
        // Not valid JSON, treat as single file
      }
    }

    // Single flattened file
    const fileName = result.name ? `${result.name}.sol` : 'Contract.sol';
    files.push({ path: fileName, content: sourceCode });
    mainFile = fileName;
  }

  return { files, mainFile };
}

/**
 * Get the display name for a file path (just the filename without directories)
 */
export function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

/**
 * Sort files with main file first, then alphabetically
 */
export function sortSourceFiles(files: SourceFile[], mainFile: string | null): SourceFile[] {
  return [...files].sort((a, b) => {
    // Main file first
    if (mainFile) {
      if (a.path === mainFile) return -1;
      if (b.path === mainFile) return 1;
    }
    // Then alphabetically by path
    return a.path.localeCompare(b.path);
  });
}
