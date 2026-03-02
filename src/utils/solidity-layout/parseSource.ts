/**
 * Solidity Source Parser
 *
 * Parses multi-file Solidity sources using @solidity-parser/parser and builds
 * a SymbolTable containing all contracts, structs, and enums indexed for
 * downstream linearization and slot allocation.
 */

import { parse } from '@solidity-parser/parser';
import type {
  SourceUnit,
  ContractDefinition,
  InheritanceSpecifier,
  StateVariableDeclaration,
  StateVariableDeclarationVariable,
  StructDefinition,
  EnumDefinition,
  VariableDeclaration,
  TypeName,
  Expression,
} from '@solidity-parser/parser/dist/src/ast-types';
import type {
  SymbolTable,
  ParsedContract,
  ParsedStateVar,
  ParsedStructDef,
  ParsedEnumDef,
  ParsedTypeName,
} from './types';

/**
 * Parse all source files and build a global symbol table.
 *
 * Files that fail to parse are silently skipped (tolerant mode is used
 * but some sources may still be unparseable).
 */
export function parseSourceFiles(
  files: Record<string, string>,
): { symbols: SymbolTable; parseWarnings: string[] } {
  const symbols: SymbolTable = {
    contracts: new Map(),
    structs: new Map(),
    enums: new Map(),
  };
  const parseWarnings: string[] = [];

  for (const [filePath, source] of Object.entries(files)) {
    try {
      const ast = parse(source, { tolerant: true, loc: false, range: false });
      processSourceUnit(ast as SourceUnit, filePath, symbols);
    } catch (err) {
      parseWarnings.push(
        `Failed to parse "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { symbols, parseWarnings };
}

/**
 * Walk a SourceUnit and extract contracts, structs, enums from its children.
 */
function processSourceUnit(
  ast: SourceUnit,
  filePath: string,
  symbols: SymbolTable,
): void {
  for (const node of ast.children) {
    if (node.type === 'ContractDefinition') {
      processContract(node as ContractDefinition, filePath, symbols);
    }
    // File-level structs (Solidity >=0.6) -- rare but possible
    if (node.type === 'StructDefinition') {
      const structDef = node as StructDefinition;
      const parsed = parseStructDef(structDef, '');
      registerStruct(parsed, symbols);
    }
    // File-level enums
    if (node.type === 'EnumDefinition') {
      const enumDef = node as EnumDefinition;
      const parsed = parseEnumDef(enumDef, '');
      registerEnum(parsed, symbols);
    }
  }
}

/**
 * Process a single ContractDefinition node.
 * Interfaces are skipped entirely.
 * Libraries: state vars are skipped (no storage), but structs/enums ARE
 * registered so other contracts can reference them (e.g. AppStorage).
 */
function processContract(
  node: ContractDefinition,
  filePath: string,
  symbols: SymbolTable,
): void {
  const kind = node.kind ?? 'contract';

  // Interfaces never have storage or useful type definitions for layout
  if (kind === 'interface') return;

  const isLibrary = kind === 'library';

  // Extract base contract names. namePath can be qualified (e.g. "Lib.Base")
  // but contracts are keyed by their bare name, so strip any prefix.
  const bases = isLibrary ? [] : node.baseContracts.map((bc: InheritanceSpecifier) => {
    const fullPath = bc.baseName.namePath;
    const dotIdx = fullPath.lastIndexOf('.');
    return dotIdx >= 0 ? fullPath.substring(dotIdx + 1) : fullPath;
  });

  const contract: ParsedContract = {
    name: node.name,
    bases,
    stateVars: [],
    structs: new Map(),
    enums: new Map(),
    filePath,
    kind,
  };

  for (const sub of node.subNodes) {
    switch (sub.type) {
      case 'StateVariableDeclaration': {
        // Libraries don't have persistent storage — skip their state vars
        if (isLibrary) break;
        const svd = sub as StateVariableDeclaration;
        for (const v of svd.variables) {
          const stateVar = parseStateVar(v, node.name);
          if (stateVar) {
            contract.stateVars.push(stateVar);
          }
        }
        break;
      }
      case 'StructDefinition': {
        const structDef = sub as StructDefinition;
        const parsed = parseStructDef(structDef, node.name);
        contract.structs.set(parsed.name, parsed);
        registerStruct(parsed, symbols);
        break;
      }
      case 'EnumDefinition': {
        const enumDef = sub as EnumDefinition;
        const parsed = parseEnumDef(enumDef, node.name);
        contract.enums.set(parsed.name, parsed);
        registerEnum(parsed, symbols);
        break;
      }
      // Other subNode types (FunctionDefinition, EventDefinition, etc.) are
      // irrelevant for storage layout and are intentionally skipped.
    }
  }

  symbols.contracts.set(node.name, contract);
}

/**
 * Parse a StateVariableDeclarationVariable into our internal representation.
 * Returns null for constant/immutable/transient variables (no storage slot).
 */
function parseStateVar(
  v: StateVariableDeclarationVariable,
  contractName: string,
): ParsedStateVar | null {
  // Constants and immutables do not consume storage slots
  if (v.isDeclaredConst || v.isImmutable) return null;

  // Transient variables (Solidity >=0.8.24) use transient storage, not regular storage.
  // The parser may not include `isTransient` in older type definitions, so use `as any`.
  if ((v as any).isTransient) return null;

  // Variables without a type (shouldn't happen in valid Solidity but be safe)
  if (!v.typeName) return null;

  const typeName = convertTypeName(v.typeName);
  if (!typeName) return null;

  return {
    name: v.name ?? '<unnamed>',
    typeName,
    visibility: v.visibility ?? 'internal',
    isConstant: false,
    isImmutable: false,
    contractName,
  };
}

function parseStructDef(
  node: StructDefinition,
  contractName: string,
): ParsedStructDef {
  const members: Array<{ name: string; typeName: ParsedTypeName }> = [];
  for (const m of node.members as VariableDeclaration[]) {
    if (!m.typeName) continue;
    const typeName = convertTypeName(m.typeName);
    if (!typeName) continue;
    members.push({ name: m.name ?? '<unnamed>', typeName });
  }
  return { name: node.name, members, contractName };
}

function parseEnumDef(
  node: EnumDefinition,
  contractName: string,
): ParsedEnumDef {
  return {
    name: node.name,
    memberCount: node.members.length,
    contractName,
  };
}

/**
 * Register a struct both with qualified (Contract.Struct) and unqualified (Struct) keys.
 * Unqualified key is only set if it would not overwrite an existing entry.
 */
function registerStruct(def: ParsedStructDef, symbols: SymbolTable): void {
  if (def.contractName) {
    symbols.structs.set(`${def.contractName}.${def.name}`, def);
  }
  // Unqualified -- first-wins to avoid ambiguity
  if (!symbols.structs.has(def.name)) {
    symbols.structs.set(def.name, def);
  }
}

function registerEnum(def: ParsedEnumDef, symbols: SymbolTable): void {
  if (def.contractName) {
    symbols.enums.set(`${def.contractName}.${def.name}`, def);
  }
  if (!symbols.enums.has(def.name)) {
    symbols.enums.set(def.name, def);
  }
}

/**
 * Convert the parser's AST TypeName node into our simplified ParsedTypeName.
 */
function convertTypeName(node: TypeName): ParsedTypeName | null {
  switch (node.type) {
    case 'ElementaryTypeName':
      return { kind: 'elementary', name: normalizeElementary(node.name) };

    case 'UserDefinedTypeName':
      return { kind: 'userDefined', name: node.namePath };

    case 'Mapping': {
      const key = convertTypeName(node.keyType);
      const value = convertTypeName(node.valueType);
      if (!key || !value) return null;
      return { kind: 'mapping', key, value };
    }

    case 'ArrayTypeName': {
      const base = convertTypeName(node.baseTypeName);
      if (!base) return null;
      const length = parseArrayLength(node.length);
      return { kind: 'array', base, length };
    }

    case 'FunctionTypeName':
      // Function type variables occupy 24 bytes (address + selector)
      return { kind: 'function' };

    default:
      return null;
  }
}

/**
 * Normalize elementary type names to their canonical form.
 * e.g. "uint" -> "uint256", "int" -> "int256", "byte" -> "bytes1"
 */
function normalizeElementary(name: string): string {
  if (name === 'uint') return 'uint256';
  if (name === 'int') return 'int256';
  if (name === 'byte') return 'bytes1';
  return name;
}

/**
 * Parse the length expression of a fixed-size array.
 * Returns null for dynamic arrays, or the numeric length for fixed arrays.
 * Only handles simple NumberLiteral lengths; expression-based lengths are
 * treated as dynamic (null) since we can't evaluate constant expressions.
 */
function parseArrayLength(expr: Expression | null): number | null {
  if (!expr) return null; // dynamic array

  if (expr.type === 'NumberLiteral') {
    const n = parseInt(expr.number, 10);
    return isNaN(n) ? null : n;
  }

  // HexLiteral can appear as array length in some edge cases
  if (expr.type === 'HexLiteral') {
    const n = parseInt(expr.value, 16);
    return isNaN(n) ? null : n;
  }

  // Expression-based lengths (e.g. `2**8`, `MAX_LEN`) -- we cannot evaluate
  // these at parse time, so treat as dynamic.
  return null;
}
