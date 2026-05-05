import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      '.claude/**',
      '.cursor/**',
      '.superpowers/**',
      '.worktrees/**',
      'dist/**',
      'dist-ssr/**',
      'node_modules/**',
      'current_bundle/**',
      'coverage/**',
      'docs/**',
      'edb/**',
      'fhe/**',
      'schematics/**',
      'starknet-sim/**',
      'tasks/**',
      'test-results/**',
      'tmp/**',
      'video/**',
      'scripts/**',
      'public/**',
      'tests/**',
      'test-*/**',
      '**/test-*.js',
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}',
      '**/__tests__/**',
      '**/__mocks__/**',
      'test-app-*/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-case-declarations': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'prefer-const': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
    },
  },
  {
    files: [
      'src/components/simple-grid/**/*.{ts,tsx}',
      'src/utils/traceDecoder/**/*.{ts,tsx}',
      'src/utils/transaction-simulation/**/*.{ts,tsx}',
      'src/utils/resolver/**/*.{ts,tsx}',
    ],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
