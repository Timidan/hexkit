/**
 * Monaco Decoration Builders
 *
 * Pure functions that return decoration descriptors for:
 * - Debugger breakpoints (glyph margin red circles)
 * - Debugger current-line highlighting (yellow)
 * - Explorer line highlighting
 */

import type { editor } from 'monaco-editor';

// CSS class names (defined in monaco-debug.css)
const BREAKPOINT_GLYPH_CLASS = 'debug-breakpoint-glyph';
const CURRENT_LINE_CLASS = 'debug-current-line';
const CURRENT_LINE_GUTTER_CLASS = 'debug-current-line-gutter';

/**
 * Build decoration descriptors for breakpoints.
 * Each breakpoint shows a red circle in the glyph margin.
 */
export function buildBreakpointDecorations(
  breakpointLines: Set<number>,
): editor.IModelDeltaDecoration[] {
  const decorations: editor.IModelDeltaDecoration[] = [];
  for (const line of breakpointLines) {
    decorations.push({
      range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      options: {
        isWholeLine: false,
        glyphMarginClassName: BREAKPOINT_GLYPH_CLASS,
        stickiness: 1, // AlwaysGrowsWhenTypingAtEdges
      },
    });
  }
  return decorations;
}

/**
 * Build decoration for the currently executing line.
 * Yellow background + left border + yellow gutter.
 */
export function buildCurrentLineDecoration(
  lineNumber: number,
): editor.IModelDeltaDecoration[] {
  return [{
    range: {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: 1,
    },
    options: {
      isWholeLine: true,
      className: CURRENT_LINE_CLASS,
      linesDecorationsClassName: CURRENT_LINE_GUTTER_CLASS,
      overviewRuler: {
        color: '#eab308', // yellow-500
        position: 2, // Center
      },
    },
  }];
}

/**
 * Build all debug decorations (breakpoints + current line) in one call.
 * Returns a single array for deltaDecorations.
 */
export function buildDebugDecorations(
  breakpointLines: Set<number>,
  currentLine: number | null,
): editor.IModelDeltaDecoration[] {
  const decorations: editor.IModelDeltaDecoration[] = [];

  decorations.push(...buildBreakpointDecorations(breakpointLines));

  if (currentLine !== null) {
    decorations.push(...buildCurrentLineDecoration(currentLine));
  }

  return decorations;
}

/**
 * Build highlight decoration for the explorer (line highlighting without breakpoints).
 */
export function buildHighlightDecoration(
  lineNumber: number,
): editor.IModelDeltaDecoration[] {
  return [{
    range: {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: 1,
    },
    options: {
      isWholeLine: true,
      className: 'highlighted-line',
      linesDecorationsClassName: 'highlighted-line-gutter',
    },
  }];
}
