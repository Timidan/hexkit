/**
 * Shared Monaco Editor Configuration
 *
 * Central source of truth for:
 * - CDN configuration
 * - Solidity language registration (Monarch tokenizer)
 * - "solidity-dark" theme definition
 * - Shared editor options (read-only viewer + debug mode)
 */

import { loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

// ─── CDN ─────────────────────────────────────────────────────────

const MONACO_CDN_VERSION = '0.55.1';

/** Call once at app startup (main.tsx) to set the CDN path. */
export function configureMonacoCdn(): void {
  loader.config({
    paths: {
      vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_CDN_VERSION}/min/vs`,
    },
  });
}

// ─── Theme ───────────────────────────────────────────────────────

export const SOLIDITY_THEME_NAME = 'solidity-dark';

const solidityDarkTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword.control', foreground: 'c586c0' },
    { token: 'keyword.function', foreground: 'dcdcaa' },
    { token: 'keyword.modifier', foreground: '569cd6' },
    { token: 'keyword.storage', foreground: '4ec9b0' },
    { token: 'keyword', foreground: 'c586c0' },
    { token: 'type', foreground: '4ec9b0' },
    { token: 'type.struct', foreground: '4ec9b0' },
    { token: 'number', foreground: 'b5cea8' },
    { token: 'number.hex', foreground: 'b5cea8' },
    { token: 'string', foreground: 'ce9178' },
    { token: 'string.escape', foreground: 'd7ba7d' },
    { token: 'comment', foreground: '6a9955' },
    { token: 'comment.doc', foreground: '608b4e' },
    { token: 'identifier', foreground: '9cdcfe' },
    { token: 'operator', foreground: 'd4d4d4' },
  ],
  colors: {
    'editor.background': '#0a0a0a',
    'editor.foreground': '#d4d4d4',
    'editor.lineHighlightBackground': '#1a1a1a',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#c6c6c6',
  },
};

// ─── Solidity Language ───────────────────────────────────────────

const solidityLanguageConfig = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'] as [string, string],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ] as [string, string][],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
};

const solidityTokenProvider = {
  defaultToken: '',
  tokenPostfix: '.sol',

  keywords: [
    'pragma', 'solidity', 'contract', 'library', 'interface', 'function',
    'modifier', 'event', 'struct', 'enum', 'mapping', 'public', 'private',
    'internal', 'external', 'pure', 'view', 'payable', 'constant', 'immutable',
    'override', 'virtual', 'abstract', 'returns', 'return', 'if', 'else',
    'for', 'while', 'do', 'break', 'continue', 'throw', 'emit', 'try',
    'catch', 'revert', 'require', 'assert', 'new', 'delete', 'this', 'super',
    'is', 'using', 'import', 'from', 'as', 'constructor', 'fallback',
    'receive', 'error', 'unchecked', 'assembly', 'memory', 'storage',
    'calldata', 'indexed', 'anonymous',
  ],

  typeKeywords: [
    'address', 'bool', 'string', 'bytes', 'bytes1', 'bytes2', 'bytes3',
    'bytes4', 'bytes8', 'bytes16', 'bytes32', 'int', 'int8', 'int16',
    'int24', 'int32', 'int64', 'int128', 'int256', 'uint', 'uint8',
    'uint16', 'uint24', 'uint32', 'uint64', 'uint128', 'uint256',
    'fixed', 'ufixed',
  ],

  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
    '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
    '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=',
    '%=', '<<=', '>>=', '>>>=', '=>',
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  tokenizer: {
    root: [
      // Comments
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],

      // SPDX license
      [/\/\/\s*SPDX-License-Identifier:.*$/, 'comment.doc'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/'([^'\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string_double'],
      [/'/, 'string', '@string_single'],

      // Numbers
      [/\b0[xX][0-9a-fA-F]+\b/, 'number.hex'],
      [/\b\d+(\.\d+)?([eE][\-+]?\d+)?\b/, 'number'],

      // Keywords
      [
        /\b(pragma|solidity|contract|library|interface|abstract)\b/,
        'keyword.control',
      ],
      [
        /\b(function|modifier|event|constructor|fallback|receive|error)\b/,
        'keyword.function',
      ],
      [
        /\b(public|private|internal|external|pure|view|payable|constant|immutable|override|virtual)\b/,
        'keyword.modifier',
      ],
      [
        /\b(if|else|for|while|do|break|continue|return|throw|emit|try|catch|revert|require|assert)\b/,
        'keyword.control',
      ],
      [
        /\b(memory|storage|calldata|indexed|anonymous)\b/,
        'keyword.storage',
      ],
      [/\b(import|from|as|is|using|new|delete|this|super)\b/, 'keyword'],

      // Types
      [
        /\b(address|bool|string|bytes\d*|u?int\d*|u?fixed)\b/,
        'type',
      ],
      [/\b(mapping|struct|enum)\b/, 'type.struct'],

      // Identifiers
      [/[a-zA-Z_]\w*/, 'identifier'],

      // Whitespace
      [/[ \t\r\n]+/, 'white'],

      // Delimiters
      [/[{}()\[\]]/, '@brackets'],
      [/[;,.]/, 'delimiter'],

      // Operators
      [/@symbols/, 'operator'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment'],
    ],

    string_double: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],

    string_single: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, 'string', '@pop'],
    ],
  },
};

// ─── Setup Helpers ───────────────────────────────────────────────

/** Register Solidity language if not already registered. Idempotent. */
export function registerSolidityLanguage(monaco: typeof import('monaco-editor')): void {
  if (monaco.languages.getLanguages().some((lang: { id: string }) => lang.id === 'solidity')) {
    return;
  }
  monaco.languages.register({ id: 'solidity', extensions: ['.sol'] });
  monaco.languages.setMonarchTokensProvider('solidity', solidityTokenProvider as any);
  monaco.languages.setLanguageConfiguration('solidity', solidityLanguageConfig as any);
}

/** Define the solidity-dark theme. Safe to call multiple times. */
export function applySolidityTheme(monaco: typeof import('monaco-editor')): void {
  monaco.editor.defineTheme(SOLIDITY_THEME_NAME, solidityDarkTheme);
  monaco.editor.setTheme(SOLIDITY_THEME_NAME);
}

/** Combined setup: register language + apply theme. Use in onMount handlers. */
export function setupSolidityMonaco(monaco: typeof import('monaco-editor')): void {
  registerSolidityLanguage(monaco);
  applySolidityTheme(monaco);
}

// ─── Editor Options ──────────────────────────────────────────────

/** Shared options for read-only Solidity viewing (explorer). */
export const SOLIDITY_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  minimap: { enabled: true },
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: 'on',
  fontSize: 13,
  fontWeight: '300',
  fontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
  renderLineHighlight: 'line',
  scrollbar: {
    vertical: 'visible',
    horizontal: 'visible',
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  padding: { top: 8 },
};

/** Debug-specific options (breakpoint glyph margin, no minimap). */
export const DEBUG_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  ...SOLIDITY_EDITOR_OPTIONS,
  minimap: { enabled: false },
  glyphMargin: true,
  folding: true,
  renderLineHighlight: 'none', // We handle this with decorations
  lineNumbersMinChars: 3,
};

// ─── Utilities ───────────────────────────────────────────────────

/** Determine Monaco language from a file path. */
export function getLanguageFromPath(path: string | null): string {
  if (!path) return 'solidity';
  if (path.endsWith('.sol')) return 'solidity';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.ts')) return 'typescript';
  return 'solidity';
}
