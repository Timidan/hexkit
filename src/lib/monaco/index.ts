export {
  configureMonacoCdn,
  registerSolidityLanguage,
  applySolidityTheme,
  setupSolidityMonaco,
  SOLIDITY_EDITOR_OPTIONS,
  DEBUG_EDITOR_OPTIONS,
  SOLIDITY_THEME_NAME,
  getLanguageFromPath,
} from './config';

export {
  buildBreakpointDecorations,
  buildCurrentLineDecoration,
  buildDebugDecorations,
  buildHighlightDecoration,
} from './decorations';

export { ColorizedSnippet } from './ColorizedSnippet';
export type { ColorizedSnippetProps } from './ColorizedSnippet';
