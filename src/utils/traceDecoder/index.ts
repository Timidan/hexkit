/**
 * Trace decoder module - exports all public types and functions
 */

// Types
export type {
  RawTrace,
  DecodedTraceRow,
  PcInfo,
  RawEventLog,
  CallMeta,
  FunctionRange,
  FunctionSignature,
  FnCallInfo,
  DecodeTraceContext,
} from './types';

// Formatting utilities
export {
  formatAbiVal,
  formatDisplayVal,
  memReadWord,
  memReadBytes,
} from './formatting';

// Source parsing
export {
  parseFunctions,
  fnForLine,
  fnForLineIfAtStart,
  parseFunctionSignatures,
  validateSrcMapContent,
  validateSourceLineContainsFunctionCall,
  findCorrectCallLine,
  buildSourceTextResolver,
} from './sourceParser';
export type { SourceTextResolver } from './sourceParser';

// PC mapping
export { buildFullPcLineMap } from './pcMapper';

// Event decoding
export { parseLogStack, decodeLogWithFallback } from './eventDecoding';

// Opcodes
export { opcodeNames, STATIC_GAS_COSTS, getStaticGasCost } from './opcodes';

// Shared ABI constants and lazy-initialized interfaces
export {
  COMMON_EVENTS_ABI,
  ERC20_EVENTS_ABI,
  ERC721_EVENTS_ABI,
  OTHER_EVENTS_ABI,
  ERC20_FUNCTIONS_ABI,
  ERC721_FUNCTIONS_ABI,
  getCommonEventsInterface,
  getERC20EventsInterface,
  getERC721EventsInterface,
  getOtherEventsInterface,
  getERC20FunctionsInterface,
  getERC721FunctionsInterface,
  getCommonEventInterfaces,
} from './commonAbis';

// Stack decoding
export {
  getCallFrames,
  decodeArgsFromStack,
  buildEventArgs,
} from './stackDecoding';

// Main decoder
export { decodeTrace } from './decodeTrace';

// V3 rendered trace consumer (Rust EDB engine decoded rows)
export { consumeRenderedTrace } from './consumeRenderedTrace';
