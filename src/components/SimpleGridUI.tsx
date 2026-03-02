/**
 * SimpleGridUI - Thin re-export from the simple-grid sub-module.
 *
 * The monolithic component has been decomposed into:
 *   src/components/simple-grid/SimpleGridMain.tsx  - Core logic & state orchestrator
 *   src/components/simple-grid/ContractCardSection.tsx - Contract address/ABI/info UI
 *   src/components/simple-grid/FunctionSelectorSection.tsx - Function type & search UI
 *   src/components/simple-grid/FunctionDropdownSection.tsx - Function dropdown, params, execution
 *   src/components/simple-grid/RawCalldataSection.tsx - Raw calldata input/decode/execute
 *   src/components/simple-grid/DiamondLoaderSection.tsx - Diamond facet progress UI
 *   src/components/simple-grid/GridContext.tsx - Internal context for sub-component communication
 *   src/components/simple-grid/tokenDetectionHelpers.ts - Pure token detection functions
 *   src/components/simple-grid/utils.ts - Pure utility functions
 *   src/components/simple-grid/types.ts - Shared type definitions
 */
export { SimpleGridUI as default } from "./simple-grid";
