/**
 * Type resolution, sizing, encoding, and label-building helpers
 * for the Solidity slot allocator.
 *
 * Extracted from allocator.ts to keep each module under 800 lines.
 */

import type {
  ParsedTypeName,
  ParsedStructDef,
  ParsedEnumDef,
  SymbolTable,
} from './types';

// ---- elementary sizes -------------------------------------------------

const ELEMENTARY_SIZES: Record<string, number> = {};

// uint8..uint256 and int8..int256
for (let bits = 8; bits <= 256; bits += 8) {
  ELEMENTARY_SIZES[`uint${bits}`] = bits / 8;
  ELEMENTARY_SIZES[`int${bits}`] = bits / 8;
}

// bytesN (bytes1..bytes32)
for (let n = 1; n <= 32; n++) {
  ELEMENTARY_SIZES[`bytes${n}`] = n;
}

// Other elementary types
ELEMENTARY_SIZES['address'] = 20;
ELEMENTARY_SIZES['bool'] = 1;
ELEMENTARY_SIZES['byte'] = 1; // alias for bytes1

// ---- resolve helpers --------------------------------------------------

/**
 * Resolve a user-defined type to a struct definition.
 * Checks both qualified and unqualified names.
 */
export function resolveStruct(
  typeName: ParsedTypeName,
  symbols: SymbolTable,
): ParsedStructDef | null {
  if (typeName.kind !== 'userDefined') return null;
  const name = typeName.name;
  return symbols.structs.get(name) ?? null;
}

/**
 * Resolve a user-defined type to an enum definition.
 */
export function resolveEnum(
  typeName: ParsedTypeName,
  symbols: SymbolTable,
): ParsedEnumDef | null {
  if (typeName.kind !== 'userDefined') return null;
  const name = typeName.name;
  return symbols.enums.get(name) ?? null;
}

// ---- encoding ---------------------------------------------------------

/**
 * Determine the storage encoding for a type.
 */
export function getEncoding(typeName: ParsedTypeName, symbols: SymbolTable): string {
  switch (typeName.kind) {
    case 'elementary': {
      const name = typeName.name;
      if (name === 'bytes' || name === 'string') return 'bytes';
      return 'inplace';
    }
    case 'mapping':
      return 'mapping';
    case 'array':
      return typeName.length === null ? 'dynamic_array' : 'inplace';
    case 'userDefined': {
      // Structs, enums, and contracts are inplace
      return 'inplace';
    }
    case 'function':
      return 'inplace';
  }
}

// ---- enum size --------------------------------------------------------

/**
 * Determine the byte size for an enum based on member count.
 * Solidity uses the smallest uint that can represent all values.
 */
export function enumSize(memberCount: number): number {
  if (memberCount <= 256) return 1;         // uint8
  if (memberCount <= 65536) return 2;       // uint16
  if (memberCount <= 16777216) return 3;    // uint24
  return 4; // uint32 -- defensive handling for enums with >16M members
}

// ---- type size --------------------------------------------------------

/**
 * Get the size in bytes for a type.
 * Returns null if the size cannot be determined.
 */
export function getTypeSize(typeName: ParsedTypeName, symbols: SymbolTable): number | null {
  switch (typeName.kind) {
    case 'elementary': {
      const name = typeName.name;
      // Dynamic types
      if (name === 'bytes' || name === 'string') return 32;
      return ELEMENTARY_SIZES[name] ?? null;
    }

    case 'mapping':
      return 32; // 1 slot for the base

    case 'array': {
      if (typeName.length === null) return 32; // dynamic array: 1 slot for length
      // Fixed array: compute total
      return computeFixedArraySlotCount(typeName, symbols) * 32;
    }

    case 'userDefined': {
      // Enum
      const enumDef = resolveEnum(typeName, symbols);
      if (enumDef) {
        return enumSize(enumDef.memberCount);
      }
      // Struct
      const structDef = resolveStruct(typeName, symbols);
      if (structDef) {
        return computeStructSlotCount(structDef, symbols) * 32;
      }
      // Contract-type references (e.g. IERC20, OwnableUpgradeable) are stored
      // as address (20 bytes) and can pack into slots.
      const contractDef = symbols.contracts.get(typeName.name);
      if (contractDef) return 20;

      // Truly unresolved user-defined type -- conservatively allocate 32 bytes
      return 32;
    }

    case 'function':
      return 24; // address (20) + selector (4)
  }
}

// ---- struct slot count ------------------------------------------------

/**
 * Compute the number of 32-byte slots a struct occupies.
 */
export function computeStructSlotCount(
  structDef: ParsedStructDef,
  symbols: SymbolTable,
): number {
  let slot = 0;
  let offset = 0;

  for (const member of structDef.members) {
    const memberEncoding = getEncoding(member.typeName, symbols);
    const memberSize = getTypeSize(member.typeName, symbols);

    // Nested struct
    const nestedStruct = resolveStruct(member.typeName, symbols);
    if (nestedStruct) {
      if (offset > 0) { slot += 1; offset = 0; }
      slot += computeStructSlotCount(nestedStruct, symbols);
      continue;
    }

    // Fixed array
    if (member.typeName.kind === 'array' && member.typeName.length !== null) {
      if (offset > 0) { slot += 1; offset = 0; }
      slot += computeFixedArraySlotCount(member.typeName, symbols);
      continue;
    }

    // Mapping / dynamic
    if (memberEncoding === 'mapping' || memberEncoding === 'dynamic_array' || memberEncoding === 'bytes') {
      if (offset > 0) { slot += 1; offset = 0; }
      slot += 1;
      continue;
    }

    // Inplace
    if (memberSize !== null) {
      if (offset > 0 && (32 - offset) < memberSize) {
        slot += 1;
        offset = 0;
      }
      offset += memberSize;
      if (offset >= 32) {
        slot += 1;
        offset = 0;
      }
    } else {
      if (offset > 0) { slot += 1; offset = 0; }
      slot += 1;
    }
  }

  // Round up: if any partial slot remains, it counts as a full slot
  if (offset > 0) slot += 1;
  return Math.max(slot, 1); // Minimum 1 slot for an empty struct
}

// ---- fixed array slot count -------------------------------------------

/**
 * Compute the number of 32-byte slots a fixed-size array occupies.
 */
export function computeFixedArraySlotCount(
  typeName: ParsedTypeName & { kind: 'array' },
  symbols: SymbolTable,
): number {
  const length = typeName.length;
  if (length === null || length === 0) return 1;

  const elemEncoding = getEncoding(typeName.base, symbols);

  // Elements that each take a full slot
  if (elemEncoding === 'mapping' || elemEncoding === 'dynamic_array' || elemEncoding === 'bytes') {
    return length;
  }

  // Struct elements
  const elemStruct = resolveStruct(typeName.base, symbols);
  if (elemStruct) {
    return length * computeStructSlotCount(elemStruct, symbols);
  }

  // Elementary / enum elements that pack
  const elemSize = getTypeSize(typeName.base, symbols);
  if (elemSize !== null) {
    if (elemSize <= 32) {
      const elemsPerSlot = Math.floor(32 / elemSize);
      return Math.ceil(length / elemsPerSlot);
    }
    // Large elements (e.g. nested fixed arrays) -- each takes multiple slots
    const slotsPerElem = Math.ceil(elemSize / 32);
    return length * slotsPerElem;
  }

  // Fallback
  return length;
}

// ---- type ID ----------------------------------------------------------

/**
 * Build a solc-compatible type ID string.
 *
 * Examples:
 * - "t_uint256"
 * - "t_address"
 * - "t_mapping(t_address,t_uint256)"
 * - "t_struct(MyStruct)_storage"
 * - "t_enum(MyEnum)"
 * - "t_array(t_uint256)dyn_storage"
 * - "t_array(t_uint256)100_storage"
 * - "t_string_storage"
 * - "t_bytes_storage"
 * - "t_bool"
 * - "t_function"
 */
export function buildTypeId(typeName: ParsedTypeName, symbols: SymbolTable): string {
  switch (typeName.kind) {
    case 'elementary': {
      const name = typeName.name;
      // Dynamic bytes and string get _storage suffix
      if (name === 'bytes' || name === 'string') {
        return `t_${name}_storage`;
      }
      return `t_${name}`;
    }

    case 'mapping': {
      const keyId = buildTypeId(typeName.key, symbols);
      const valueId = buildTypeId(typeName.value, symbols);
      return `t_mapping(${keyId},${valueId})`;
    }

    case 'array': {
      const baseId = buildTypeId(typeName.base, symbols);
      if (typeName.length === null) {
        return `t_array(${baseId})dyn_storage`;
      }
      return `t_array(${baseId})${typeName.length}_storage`;
    }

    case 'userDefined': {
      // Check if it's a struct or enum
      const structDef = resolveStruct(typeName, symbols);
      if (structDef) {
        return `t_struct(${structDef.name})_storage`;
      }
      const enumDef = resolveEnum(typeName, symbols);
      if (enumDef) {
        return `t_enum(${enumDef.name})`;
      }
      // Unknown user-defined type -- use as-is
      return `t_contract(${typeName.name})`;
    }

    case 'function':
      return 't_function';
  }
}

// ---- type label -------------------------------------------------------

/**
 * Build a human-readable type label.
 */
export function buildTypeLabel(typeName: ParsedTypeName, symbols: SymbolTable): string {
  switch (typeName.kind) {
    case 'elementary':
      return typeName.name;
    case 'mapping': {
      const keyLabel = buildTypeLabel(typeName.key, symbols);
      const valueLabel = buildTypeLabel(typeName.value, symbols);
      return `mapping(${keyLabel} => ${valueLabel})`;
    }
    case 'array': {
      const baseLabel = buildTypeLabel(typeName.base, symbols);
      if (typeName.length === null) return `${baseLabel}[]`;
      return `${baseLabel}[${typeName.length}]`;
    }
    case 'userDefined': {
      const structDef = resolveStruct(typeName, symbols);
      if (structDef) return `struct ${structDef.name}`;
      const enumDef = resolveEnum(typeName, symbols);
      if (enumDef) return `enum ${enumDef.name}`;
      // Contract reference or unknown
      return typeName.name;
    }
    case 'function':
      return 'function';
  }
}
