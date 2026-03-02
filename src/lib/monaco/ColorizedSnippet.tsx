/**
 * ColorizedSnippet
 *
 * Lightweight source-code snippet with Monaco-powered Solidity syntax
 * highlighting.  Uses `monaco.editor.colorize()` (no editor instance) so
 * there is zero editor overhead — just tokenization + HTML.
 *
 * Renders plain text first, then swaps in colorized HTML once Monaco
 * resolves.  Results are cached per source-content hash so repeated
 * expansions of the same trace row are instant.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { loader } from '@monaco-editor/react';
import { setupSolidityMonaco } from './config';

// ── Module-level cache ───────────────────────────────────────────
// Key = source text of the full snippet block, Value = array of
// colorized HTML strings (one per line).
const colorizeCache = new Map<string, string[]>();

export interface ColorizedSnippetProps {
  /** Full source file content (split into lines internally). */
  sourceContent: string;
  /** 1-indexed line to highlight (the "current" execution line). */
  highlightLine: number;
  /** How many context lines to show above/below the highlight. */
  contextLines?: number;
}

export const ColorizedSnippet: React.FC<ColorizedSnippetProps> = React.memo(
  ({ sourceContent, highlightLine, contextLines = 8 }) => {
    const [colorizedLines, setColorizedLines] = useState<string[] | null>(null);
    const cancelledRef = useRef(false);

    const allLines = useMemo(() => sourceContent.split('\n'), [sourceContent]);
    const start = Math.max(1, highlightLine - contextLines);
    const end = Math.min(allLines.length, highlightLine + contextLines);

    // Build the visible slice (plain text, for immediate render)
    const visibleLines = useMemo(() => {
      const lines: string[] = [];
      for (let ln = start; ln <= end; ln++) {
        lines.push(allLines[ln - 1] ?? '');
      }
      return lines;
    }, [allLines, start, end]);

    // Cache key based on the visible slice content
    const cacheKey = useMemo(
      () => `${start}:${end}:${visibleLines.join('\n')}`,
      [start, end, visibleLines]
    );

    useEffect(() => {
      cancelledRef.current = false;

      // Check cache first
      const cached = colorizeCache.get(cacheKey);
      if (cached) {
        setColorizedLines(cached);
        return;
      }

      loader.init().then(monaco => {
        if (cancelledRef.current) return;

        // Ensure Solidity language + theme are registered
        setupSolidityMonaco(monaco);

        // Colorize each line individually so we can wrap them in our
        // line-number layout without parsing Monaco's HTML structure
        Promise.all(
          visibleLines.map(line =>
            monaco.editor.colorize(line || ' ', 'solidity', { tabSize: 4 })
          )
        ).then(results => {
          if (cancelledRef.current) return;

          // Strip the outer <div> wrapper Monaco adds to each result
          const cleaned = results.map((html: string) =>
            html
              .replace(/^<div[^>]*>/, '')
              .replace(/<\/div>$/, '')
              .replace(/<br\s*\/?>$/, '')
          );

          colorizeCache.set(cacheKey, cleaned);
          setColorizedLines(cleaned);
        });
      });

      return () => { cancelledRef.current = true; };
    }, [cacheKey, visibleLines]);

    return (
      <div className="exec-snippet-box">
        {visibleLines.map((line, i) => {
          const lineNum = start + i;
          const isHighlight = lineNum === highlightLine;

          return (
            <div
              key={lineNum}
              className={`exec-snippet-line${isHighlight ? ' highlight' : ''}`}
            >
              <span className="exec-snippet-ln">{lineNum}</span>
              {colorizedLines?.[i] ? (
                <span
                  className="exec-snippet-text exec-snippet-colorized"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(colorizedLines[i]) }}
                />
              ) : (
                <span className="exec-snippet-text">{line}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

ColorizedSnippet.displayName = 'ColorizedSnippet';

export default ColorizedSnippet;
