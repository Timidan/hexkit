/**
 * Source code parsing utilities for extracting function ranges and signatures
 */

import type { FunctionRange, FunctionSignature } from './types';

type DeclarationKind = 'function' | 'modifier';

// ── Cached source text resolver ─────────────────────────────────────
// Replaces O(keys) `Object.keys(sourceTexts).find(...)` scans with O(1)
// cached lookups. The resolver is memoized per sourceTexts object reference
// via WeakMap, so the lookup maps are built once per decode invocation.

export type SourceTextResolver = (filePath: string | null | undefined) => string | null;

const resolverCache = new WeakMap<Record<string, string>, SourceTextResolver>();

export function buildSourceTextResolver(sourceTexts: Record<string, string>): SourceTextResolver {
  let resolver = resolverCache.get(sourceTexts);
  if (resolver) return resolver;

  const keys = Object.keys(sourceTexts);
  const filenameToContent = new Map<string, string>();
  const keyFilenames = new Map<string, string>();

  for (const key of keys) {
    const filename = key.split('/').pop() || key;
    keyFilenames.set(key, filename);
    if (!filenameToContent.has(filename)) {
      filenameToContent.set(filename, sourceTexts[key]);
    }
  }

  const cache = new Map<string, string | null>();

  resolver = (filePath: string | null | undefined): string | null => {
    if (!filePath) return null;

    const cached = cache.get(filePath);
    if (cached !== undefined) return cached;

    // 1. Exact match
    const exact = sourceTexts[filePath];
    if (exact) { cache.set(filePath, exact); return exact; }

    // 2. Filename-only match
    const filename = filePath.split('/').pop() || filePath;
    const byFilename = filenameToContent.get(filename);
    if (byFilename) { cache.set(filePath, byFilename); return byFilename; }

    // 3. Suffix matching (O(keys) first time per filePath, then cached)
    for (const key of keys) {
      if (key.endsWith('/' + filePath) || filePath.endsWith('/' + key) ||
          keyFilenames.get(key) === filename) {
        cache.set(filePath, sourceTexts[key]);
        return sourceTexts[key];
      }
    }

    cache.set(filePath, null);
    return null;
  };

  resolverCache.set(sourceTexts, resolver);
  return resolver;
}

function parseDeclarationRanges(text: string, kind: DeclarationKind): FunctionRange[] {
  const lines = text.split("\n");
  const ranges: FunctionRange[] = [];
  const declRegex =
    kind === 'function'
      ? /^\s*function\s+([A-Za-z0-9_]+)\s*\(/
      : /^\s*modifier\s+([A-Za-z0-9_]+)\b/;
  let current: {
    name: string;
    start: number;
    seenOpeningBrace: boolean;
    braceBalance: number;
  } | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    if (!current) {
      // Match Solidity declarations/definitions at the beginning of a line.
      // This avoids picking declarations from comments/docs.
      const decl = line.match(declRegex);
      if (decl) {
        const fnName = decl[1];
        const lineNo = idx + 1;
        const openCount = line.match(/{/g)?.length || 0;
        const closeCount = line.match(/}/g)?.length || 0;
        const firstOpen = line.indexOf("{");
        const firstSemicolon = line.indexOf(";");
        const isDeclarationOnly =
          firstSemicolon >= 0 && (firstOpen < 0 || firstSemicolon < firstOpen);

        if (isDeclarationOnly) {
          // Interface/abstract declaration (no body).
          ranges.push({ name: fnName, start: lineNo, end: lineNo });
          continue;
        }

        const seenOpeningBrace = openCount > 0;
        const braceBalance = seenOpeningBrace ? openCount - closeCount : 0;
        current = { name: fnName, start: lineNo, seenOpeningBrace, braceBalance };

        // One-line function body: function f() { ... }
        if (current.seenOpeningBrace && current.braceBalance <= 0) {
          ranges.push({ name: current.name, start: current.start, end: lineNo });
          current = null;
        }
        continue;
      }
    } else {
      const openCount = line.match(/{/g)?.length || 0;
      const closeCount = line.match(/}/g)?.length || 0;

      if (!current.seenOpeningBrace) {
        const firstOpen = line.indexOf("{");
        const firstSemicolon = line.indexOf(";");
        const isDeclarationOnly =
          firstSemicolon >= 0 && (firstOpen < 0 || firstSemicolon < firstOpen);

        if (isDeclarationOnly) {
          // Multiline declaration that ends with ';' (no body).
          ranges.push({ name: current.name, start: current.start, end: idx + 1 });
          current = null;
          continue;
        }

        if (openCount > 0) {
          current.seenOpeningBrace = true;
          current.braceBalance += openCount - closeCount;
          if (current.braceBalance <= 0) {
            ranges.push({ name: current.name, start: current.start, end: idx + 1 });
            current = null;
          }
        }
        continue;
      }

      current.braceBalance += openCount - closeCount;
      if (current.braceBalance <= 0) {
        ranges.push({ name: current.name, start: current.start, end: idx + 1 });
        current = null;
      }
    }
  }

  if (current !== null) {
    ranges.push({ name: current.name, start: current.start, end: lines.length });
  }

  return ranges;
}

// Build function ranges from source text.
export function parseFunctions(text: string): FunctionRange[] {
  return parseDeclarationRanges(text, 'function');
}

// Build modifier ranges from source text.
export function parseModifiers(text: string): FunctionRange[] {
  return parseDeclarationRanges(text, 'modifier');
}

export function fnForLine(ranges: FunctionRange[], line: number): string | null {
  const matches = ranges.filter((r) => line >= r.start && line <= r.end);
  if (matches.length === 0) return null;

  // Prefer the most specific/innermost-looking range.
  matches.sort((a, b) => {
    const spanA = a.end - a.start;
    const spanB = b.end - b.start;
    if (spanA !== spanB) return spanA - spanB;
    return b.start - a.start;
  });

  return matches[0].name || null;
}

/**
 * Like fnForLine, but only returns a function name if the line is at or near the START
 * of a function definition (within threshold lines). Used for JUMP destination validation.
 */
export function fnForLineIfAtStart(ranges: FunctionRange[], line: number, threshold: number = 3): string | null {
  const candidatesAtEntry: Array<{ name: string; start: number; offset: number }> = [];

  for (const r of ranges) {
    if (line >= r.start && line <= r.end) {
      const lineOffset = line - r.start;
      if (lineOffset <= threshold) {
        candidatesAtEntry.push({ name: r.name, start: r.start, offset: lineOffset });
      }
    }
  }

  if (candidatesAtEntry.length === 0) {
    return null;
  }

  candidatesAtEntry.sort((a, b) => a.offset - b.offset);
  return candidatesAtEntry[0].name;
}

/**
 * Validates that the source content at a given line actually contains the function definition.
 */
export function validateSrcMapContent(
  sourceTexts: Record<string, string>,
  filePath: string | null | undefined,
  line: number | null | undefined,
  fnName: string | null | undefined
): boolean {
  if (!filePath || !line || !fnName) return true;

  let content = sourceTexts[filePath];
  if (!content) {
    const filename = filePath.split('/').pop() || filePath;
    content = sourceTexts[filename];
  }
  if (!content) {
    const matchingKey = Object.keys(sourceTexts).find(k =>
      k.endsWith('/' + filePath) || filePath.endsWith('/' + k) ||
      k.split('/').pop() === filePath.split('/').pop()
    );
    if (matchingKey) {
      content = sourceTexts[matchingKey];
    }
  }

  if (!content) return true;

  const lines = content.split('\n');
  if (line < 1 || line > lines.length) return true;

  const startLine = Math.max(0, line - 4);
  const endLine = Math.min(lines.length - 1, line + 2);

  const fnPattern = new RegExp(`\\bfunction\\s+${fnName}\\s*\\(`);
  for (let i = startLine; i <= endLine; i++) {
    if (fnPattern.test(lines[i])) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that the SOURCE line (caller side) contains a call to the function.
 */
export function validateSourceLineContainsFunctionCall(
  sourceTexts: Record<string, string>,
  srcFilePath: string | null | undefined,
  srcLine: number | null | undefined,
  destFnName: string | null | undefined
): boolean {
  if (!srcFilePath || !srcLine || !destFnName) return true;

  const content = buildSourceTextResolver(sourceTexts)(srcFilePath);
  if (!content) return true;

  const lines = content.split('\n');
  if (srcLine < 1 || srcLine > lines.length) return true;

  const lineContent = lines[srcLine - 1];
  const fnCallPattern = new RegExp(`\\b${destFnName}\\s*\\(`);
  const fnDeclarationPattern = new RegExp(`\\bfunction\\s+${destFnName}\\s*\\(`);

  if (fnCallPattern.test(lineContent) && !fnDeclarationPattern.test(lineContent)) {
    return true;
  }

  return false;
}

/**
 * Find the correct line number where a function is actually called.
 * Source maps for internal JUMPs are often inaccurate.
 */
export function findCorrectCallLine(
  sourceTexts: Record<string, string>,
  srcFilePath: string | null | undefined,
  srcLine: number | null | undefined,
  fnName: string | null | undefined
): number | null {
  if (!srcFilePath || !srcLine || !fnName) return null;

  const content = buildSourceTextResolver(sourceTexts)(srcFilePath);
  if (!content) return null;

  const lines = content.split('\n');
  const fnCallPattern = new RegExp(`\\b${fnName}\\s*\\(`);
  const fnDeclarationPattern = new RegExp(`\\bfunction\\s+${fnName}\\s*\\(`);

  if (srcLine >= 1 && srcLine <= lines.length) {
    const line = lines[srcLine - 1];
    if (fnCallPattern.test(line) && !fnDeclarationPattern.test(line)) {
      return srcLine;
    }
  }

  const searchRadius = 20;
  const startLine = Math.max(1, srcLine - searchRadius);
  const endLine = Math.min(lines.length, srcLine + searchRadius);

  for (let ln = srcLine + 1; ln <= endLine; ln++) {
    const line = lines[ln - 1];
    if (fnCallPattern.test(line) && !fnDeclarationPattern.test(line)) {
      return ln;
    }
  }

  for (let ln = srcLine - 1; ln >= startLine; ln--) {
    const line = lines[ln - 1];
    if (fnCallPattern.test(line) && !fnDeclarationPattern.test(line)) {
      return ln;
    }
  }

  return null;
}

export function parseFunctionSignatures(text: string): Record<string, FunctionSignature> {
  // Match function with optional returns clause
  // Pattern: function name(params) [visibility] [modifiers] [returns (types)]
  const fnRegex = /function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)([^{;]*)/g;
  const sigs: Record<string, FunctionSignature> = {};
  let m: RegExpExecArray | null;
  while ((m = fnRegex.exec(text)) !== null) {
    const name = m[1];
    const rawParams = m[2];
    const afterParams = m[3] || "";

    const params = rawParams
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p, idx) => {
        const parts = p.split(/\s+/).filter(Boolean);
        if (!parts.length) return null;
        const paramName = parts[parts.length - 1];
        const paramType =
          parts.slice(0, parts.length - 1).join(" ") || "uint256";
        if (paramName.startsWith("/*")) return null;
        return { name: paramName || `arg${idx}`, type: paramType };
      })
      .filter(Boolean) as { name: string; type: string }[];

    // Parse return types from "returns (...)" clause
    let outputs: { name: string; type: string }[] = [];
    const returnsMatch = afterParams.match(/returns\s*\(([^)]*)\)/i);
    if (returnsMatch) {
      const rawReturns = returnsMatch[1];
      outputs = rawReturns
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((p, idx) => {
          const parts = p.split(/\s+/).filter(Boolean);
          if (!parts.length) return null;
          // Return can be just type, or type + name
          const paramType = parts[0] || "uint256";
          const paramName = parts.length > 1 ? parts[parts.length - 1] : `ret${idx}`;
          return { name: paramName, type: paramType };
        })
        .filter(Boolean) as { name: string; type: string }[];
    }

    const visibilityMatch = afterParams.match(/\b(public|private|internal|external)\b/);
    const visibility = visibilityMatch ? visibilityMatch[1] : undefined;

    sigs[name] = { inputs: params, outputs, visibility };
  }
  return sigs;
}
