/**
 * Trace decoder - barrel re-export file.
 *
 * All implementation has been split into the traceDecoder/ directory:
 * - types.ts: Type definitions (DecodedTraceRow, PcInfo, etc.)
 * - formatting.ts: Value formatting (formatAbiVal, formatDisplayVal, etc.)
 * - sourceParser.ts: Source parsing (parseFunctions, fnForLine, etc.)
 * - pcMapper.ts: PC-to-line mapping (buildFullPcLineMap)
 * - eventDecoding.ts: Event decoding (parseLogStack, decodeLogWithFallback)
 * - commonAbis.ts: Shared ABI constants and lazy-initialized interfaces
 * - opcodes.ts: Opcode names and gas costs
 * - stackDecoding.ts: Stack/argument decoding (decodeArgsFromStack, getCallFrames)
 * - decodeTrace.ts: Main decoder orchestrator
 * - decodeTraceInit.ts: Phase 1 - source extraction, PC maps, opcode rows
 * - decodeTraceAnalysis.ts: Phase 2 - jump detection, call hierarchy
 * - decodeTraceFinalize.ts: Phase 3 - gas calc, events, filtering
 */

export {
  // Types
  type RawTrace,
  type DecodedTraceRow,
  type PcInfo,
  type RawEventLog,
  type CallMeta,
  type FunctionRange,
  type FunctionSignature,
  type FnCallInfo,
  type DecodeTraceContext,

  // Functions
  formatAbiVal,
  formatDisplayVal,
  memReadWord,
  memReadBytes,
  parseFunctions,
  fnForLine,
  fnForLineIfAtStart,
  parseFunctionSignatures,
  validateSrcMapContent,
  validateSourceLineContainsFunctionCall,
  findCorrectCallLine,
  buildFullPcLineMap,
  parseLogStack,
  decodeLogWithFallback,
  opcodeNames,
  STATIC_GAS_COSTS,
  getStaticGasCost,
  getCallFrames,
  decodeArgsFromStack,
  buildEventArgs,
  decodeTrace,

  // Shared ABI constants and interfaces (from commonAbis.ts)
  COMMON_EVENTS_ABI,
  ERC20_EVENTS_ABI,
  ERC721_EVENTS_ABI,
  OTHER_EVENTS_ABI,
  ERC20_FUNCTIONS_ABI,
  ERC721_FUNCTIONS_ABI,
  getCommonEventsInterface,
  getERC20FunctionsInterface,
  getERC721FunctionsInterface,
  getERC20EventsInterface,
  getERC721EventsInterface,
  getOtherEventsInterface,
  getCommonEventInterfaces,

  // V3 rendered trace consumer (Rust EDB engine decoded rows)
  consumeRenderedTrace,

  // Source text resolver
  buildSourceTextResolver,
  type SourceTextResolver,
} from './traceDecoder/index';
