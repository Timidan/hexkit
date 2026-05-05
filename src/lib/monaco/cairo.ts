// Cairo Monarch tokenizer. Reuses the Solidity dark theme so the Cairo Source
// tab matches the EVM Solidity viewer.

import {
  applySolidityTheme,
  SOLIDITY_THEME_NAME,
} from './config';

export const CAIRO_THEME_NAME = SOLIDITY_THEME_NAME;

const cairoLanguageConfig = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'] as [string, string],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
    ['<', '>'],
  ] as [string, string][],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  wordPattern:
    /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/,
};

const CAIRO_KEYWORDS = [
  'fn', 'let', 'mut', 'const', 'pub', 'mod', 'use', 'as',
  'if', 'else', 'match', 'loop', 'while', 'for', 'in',
  'return', 'break', 'continue',
  'struct', 'enum', 'trait', 'impl', 'of', 'where',
  'self', 'Self', 'super', 'extern', 'type',
  'nopanic', 'ref', 'inline',
  'dyn', 'move', 'crate', 'await', 'async', 'do', 'box', 'unsafe', 'phantom',
];

// Typed numeric suffix — longer alternatives first so `_u128` wins over `_u8`.
const CAIRO_NUMERIC_SUFFIX =
  '(?:_(?:felt252|felt|u128|u256|u64|u32|u16|u8|i128|i64|i32|i16|i8|usize|bool))?';

const CAIRO_TYPE_KEYWORDS = [
  'felt252',
  'u8', 'u16', 'u32', 'u64', 'u128', 'u256', 'usize',
  'i8', 'i16', 'i32', 'i64', 'i128',
  'bool',
  'ContractAddress', 'ClassHash', 'EthAddress', 'StorageAddress',
  'Box', 'Array', 'Span', 'Option', 'Result',
];

const cairoTokenProvider = {
  defaultToken: '',
  tokenPostfix: '.cairo',

  keywords: CAIRO_KEYWORDS,
  typeKeywords: CAIRO_TYPE_KEYWORDS,

  operators: [
    '=', '==', '!=', '<', '>', '<=', '>=',
    '+', '-', '*', '/', '%',
    '&', '|', '^', '&&', '||', '!', '?',
    '..', '..=',
    '->', '=>',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  ],

  // Match the "any operator-ish run of symbols" pattern Monarch
  // expects for the @operators table lookup.
  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  tokenizer: {
    root: [
      // Attributes: `#[...]` / `#![...]` — Cairo attribute payloads can
      // include nested `[…]` (e.g. `#[storage(map: LegacyMap<felt252,
      // [u8; 32]>)]`). We open an `@attribute` state on `#[`/`#![` and
      // use bracket-counting via @push/@pop so arbitrarily nested
      // square brackets stay inside the annotation token (audit P3).
      [/#!?\[/, { token: 'annotation', next: '@attribute' }],

      // Doc comments first (longest-match wins).
      [/\/\/\/.*$/, 'comment.doc'],
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],

      // String literals.
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string_double'],
      // Cairo short-strings (felt252 literal) use single quotes.
      [/'([^'\\]|\\.)*$/, 'string.invalid'],
      [/'/, 'string', '@string_single'],

      // Numbers — each rule consumes an optional Cairo typed suffix.
      [
        new RegExp(`\\b0[xX][0-9a-fA-F_]+${CAIRO_NUMERIC_SUFFIX}\\b`),
        'number.hex',
      ],
      [
        new RegExp(`\\b0[bB][01_]+${CAIRO_NUMERIC_SUFFIX}\\b`),
        'number.binary',
      ],
      [
        new RegExp(`\\b0[oO][0-7_]+${CAIRO_NUMERIC_SUFFIX}\\b`),
        'number.octal',
      ],
      [
        new RegExp(
          `\\b\\d[\\d_]*(\\.\\d[\\d_]*)?([eE][\\-+]?\\d+)?${CAIRO_NUMERIC_SUFFIX}\\b`,
        ),
        'number',
      ],

      // Macros (`assert!`, `panic!`, …) — must precede the identifier rule
      // so the trailing `!` is consumed as part of the token.
      [/\b[A-Za-z_][A-Za-z0-9_]*!/, 'keyword.macro'],

      [
        /\b[A-Za-z_][A-Za-z0-9_]*\b/,
        {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@default': 'identifier',
          },
        },
      ],

      [/[ \t\r\n]+/, 'white'],
      [/[{}()\[\]]/, '@brackets'],
      [/[;,.]/, 'delimiter'],

      // Operators — placed after brackets so `<>` aren't swallowed elsewhere.
      [
        /@symbols/,
        {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        },
      ],
    ],

    // Attribute body — `[`/`]` are tracked via Monarch state stack so
    // nested generics (e.g. `#[storage(map: LegacyMap<…, [u8; 32]>)]`)
    // don't pop early. Strings detour into sub-states so a quoted `]`
    // can't end the annotation.
    attribute: [
      [/\[/, { token: 'annotation', next: '@push' }],
      [/\]/, { token: 'annotation', next: '@pop' }],
      [/"/, { token: 'string', next: '@string_double' }],
      [/'/, { token: 'string', next: '@string_single' }],
      [/[^\[\]"']+/, 'annotation'],
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

/** Idempotent. */
export function registerCairoLanguage(
  monaco: typeof import('monaco-editor'),
): void {
  if (
    monaco.languages
      .getLanguages()
      .some((lang: { id: string }) => lang.id === 'cairo')
  ) {
    return;
  }
  monaco.languages.register({ id: 'cairo', extensions: ['.cairo'] });
  monaco.languages.setMonarchTokensProvider(
    'cairo',
    cairoTokenProvider as any,
  );
  monaco.languages.setLanguageConfiguration(
    'cairo',
    cairoLanguageConfig as any,
  );
}

/** Register Cairo + ensure the shared dark theme is active. Idempotent. */
export function setupCairoMonaco(
  monaco: typeof import('monaco-editor'),
): void {
  registerCairoLanguage(monaco);
  // `applySolidityTheme` is the canonical "register + activate the
  // shared dark theme" entry point. Idempotent — it just re-defines
  // the theme.
  applySolidityTheme(monaco);
}
