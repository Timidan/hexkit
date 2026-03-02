/**
 * Solidity Storage Layout Reconstruction -- Internal Types
 *
 * These types drive the AST-based fallback pipeline that reconstructs
 * storage layouts from Solidity source code when the compiler's
 * --storage-layout output is unavailable (pre-0.5.13 contracts).
 */

import type { StorageLayoutResponse } from '../../types/debug';

/** Source file input for the reconstruction pipeline */
export interface SourceInput {
  /** Map of file path -> Solidity source code */
  files: Record<string, string>;
  /** Target contract to reconstruct the layout for */
  contractName: string;
  /** Optional compiler version hint (e.g. "0.4.26") for future heuristics */
  compilerVersion?: string;
}

/** Parsed contract with its state variables and inheritance */
export interface ParsedContract {
  name: string;
  /** Direct base contract names in declaration order (left-to-right) */
  bases: string[];
  stateVars: ParsedStateVar[];
  structs: Map<string, ParsedStructDef>;
  enums: Map<string, ParsedEnumDef>;
  filePath: string;
  /** "contract" | "interface" | "library" | "abstract" */
  kind: string;
}

/** A parsed state variable declaration */
export interface ParsedStateVar {
  name: string;
  typeName: ParsedTypeName;
  visibility: string;
  isConstant: boolean;
  isImmutable: boolean;
  /** Name of the contract that declared this variable */
  contractName: string;
}

/**
 * Recursive type representation.
 * Mirrors Solidity's TypeName AST but simplified.
 */
export type ParsedTypeName =
  | { kind: 'elementary'; name: string }
  | { kind: 'mapping'; key: ParsedTypeName; value: ParsedTypeName }
  | { kind: 'array'; base: ParsedTypeName; length: number | null }
  | { kind: 'userDefined'; name: string }
  | { kind: 'function' };

/** Parsed struct definition */
export interface ParsedStructDef {
  name: string;
  members: Array<{ name: string; typeName: ParsedTypeName }>;
  /** Contract that declared this struct */
  contractName: string;
}

/** Parsed enum definition */
export interface ParsedEnumDef {
  name: string;
  memberCount: number;
  /** Contract that declared this enum */
  contractName: string;
}

/** Result of the reconstruction pipeline */
export interface ReconstructionResult {
  layout: StorageLayoutResponse;
  /** 'compiler' is never returned by this module -- included for upstream compat */
  confidence: 'compiler' | 'reconstructed';
  warnings: string[];
}

/**
 * Global symbol table built during the parse phase.
 * Keys for structs/enums are stored both qualified (Contract.Type)
 * and unqualified (Type) for lookup flexibility.
 */
export interface SymbolTable {
  contracts: Map<string, ParsedContract>;
  structs: Map<string, ParsedStructDef>;
  enums: Map<string, ParsedEnumDef>;
}
