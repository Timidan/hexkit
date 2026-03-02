/**
 * Solidity Slot Allocator
 *
 * Walks linearized state variables and assigns {slot, offset} following
 * Solidity's storage packing rules:
 *
 * 1. Elementary types pack into current slot if they fit (32 - offset >= size)
 * 2. Structs always start on a new slot boundary; members pack within
 * 3. Mappings always consume exactly 1 slot (base slot)
 * 4. Dynamic arrays always consume 1 slot (length stored there)
 * 5. Fixed-size arrays start a new slot; elements pack sequentially
 * 6. Strings/bytes (dynamic) always consume 1 slot
 * 7. Constants/immutables are skipped (already filtered before allocation)
 * 8. Enums stored as smallest uint that fits: uint8 for <=256 members
 */

import type {
  ParsedStateVar,
  ParsedTypeName,
  ParsedStructDef,
  SymbolTable,
} from './types';
import type { StorageLayoutEntry, StorageTypeDefinition } from '../../types/debug';

// Type helpers extracted to allocatorTypeHelpers.ts
import {
  resolveStruct,
  resolveEnum,
  getEncoding,
  getTypeSize,
  buildTypeId,
  buildTypeLabel,
  computeStructSlotCount,
  computeFixedArraySlotCount,
} from './allocatorTypeHelpers';

// Re-export public API from the helpers module so existing consumers
// that import from './allocator' continue to work.
export { buildTypeId, getEncoding, getTypeSize } from './allocatorTypeHelpers';

interface AllocState {
  /** Current slot number */
  slot: number;
  /** Current byte offset within the slot (0-31) */
  offset: number;
  /** Monotonic counter for synthetic AST IDs */
  astIdCounter: number;
  /** Accumulated storage entries */
  storage: StorageLayoutEntry[];
  /** Accumulated type definitions */
  types: Record<string, StorageTypeDefinition>;
  /** Warnings accumulated during allocation */
  warnings: string[];
  /** Symbol table reference */
  symbols: SymbolTable;
}

/**
 * Allocate storage slots for the given state variables.
 *
 * @param vars - State variables in linearized order (base-first)
 * @param symbols - Symbol table with struct/enum definitions
 * @returns Storage layout entries, type definitions, and warnings
 */
export function allocateSlots(
  vars: ParsedStateVar[],
  symbols: SymbolTable,
): {
  storage: StorageLayoutEntry[];
  types: Record<string, StorageTypeDefinition>;
  warnings: string[];
} {
  const state: AllocState = {
    slot: 0,
    offset: 0,
    astIdCounter: 1000, // Start synthetic IDs above typical real AST IDs
    storage: [],
    types: {},
    warnings: [],
    symbols,
  };

  for (const v of vars) {
    // Constants and immutables should already be filtered, but double-check
    if (v.isConstant || v.isImmutable) continue;
    allocateVar(state, v.name, v.typeName, v.contractName);
  }

  return {
    storage: state.storage,
    types: state.types,
    warnings: state.warnings,
  };
}

/**
 * Allocate a single state variable and record it in the storage layout.
 */
function allocateVar(
  state: AllocState,
  name: string,
  typeName: ParsedTypeName,
  contractName: string,
): void {
  const typeId = buildTypeId(typeName, state.symbols);
  const encoding = getEncoding(typeName, state.symbols);
  const size = getTypeSize(typeName, state.symbols);

  // Register the type definition
  registerType(typeId, typeName, state);

  switch (encoding) {
    case 'inplace': {
      if (size === null) {
        // Unknown size -- push a warning and allocate a full slot
        state.warnings.push(
          `Unknown size for variable "${name}" (${typeId}). Allocating full slot.`,
        );
        advanceToSlotBoundary(state);
        recordEntry(state, name, contractName, typeId);
        state.slot += 1;
        state.offset = 0;
        return;
      }

      // Check if this is a struct (user-defined that resolves to a struct)
      const resolvedStruct = resolveStruct(typeName, state.symbols);
      if (resolvedStruct) {
        // Structs always start on a new slot boundary
        advanceToSlotBoundary(state);
        recordEntry(state, name, contractName, typeId);

        // Allocate struct members within the struct's allocation
        allocateStructMembers(state, resolvedStruct);

        // After struct, ensure we're at a slot boundary
        if (state.offset > 0) {
          state.slot += 1;
          state.offset = 0;
        }
        return;
      }

      // Fixed-size arrays
      if (typeName.kind === 'array' && typeName.length !== null) {
        // Fixed arrays always start on a new slot boundary
        advanceToSlotBoundary(state);
        recordEntry(state, name, contractName, typeId);
        allocateFixedArray(state, typeName);
        return;
      }

      // Elementary types and enums -- pack into current slot if they fit
      if (state.offset > 0 && (32 - state.offset) < size) {
        // Doesn't fit in remaining space -- move to next slot
        state.slot += 1;
        state.offset = 0;
      }

      recordEntry(state, name, contractName, typeId);
      state.offset += size;

      // If we filled the slot exactly, advance
      if (state.offset >= 32) {
        state.slot += 1;
        state.offset = 0;
      }
      return;
    }

    case 'mapping': {
      // Mappings always consume exactly 1 full slot
      advanceToSlotBoundary(state);
      recordEntry(state, name, contractName, typeId);
      state.slot += 1;
      state.offset = 0;
      return;
    }

    case 'dynamic_array': {
      // Dynamic arrays: length stored in 1 slot, elements at keccak(slot)
      advanceToSlotBoundary(state);
      recordEntry(state, name, contractName, typeId);
      state.slot += 1;
      state.offset = 0;
      return;
    }

    case 'bytes': {
      // Dynamic bytes/string: 1 slot
      advanceToSlotBoundary(state);
      recordEntry(state, name, contractName, typeId);
      state.slot += 1;
      state.offset = 0;
      return;
    }

    default: {
      // Unknown encoding -- allocate a full slot
      state.warnings.push(
        `Unknown encoding "${encoding}" for variable "${name}". Allocating full slot.`,
      );
      advanceToSlotBoundary(state);
      recordEntry(state, name, contractName, typeId);
      state.slot += 1;
      state.offset = 0;
    }
  }
}

/**
 * Allocate storage for struct members within the current allocation.
 * Members pack according to the same rules as top-level variables,
 * but scoped within the struct's slot allocation.
 */
function allocateStructMembers(
  state: AllocState,
  structDef: ParsedStructDef,
): void {
  for (const member of structDef.members) {
    const memberEncoding = getEncoding(member.typeName, state.symbols);
    const memberSize = getTypeSize(member.typeName, state.symbols);
    const memberTypeId = buildTypeId(member.typeName, state.symbols);

    // Register member type
    registerType(memberTypeId, member.typeName, state);

    // Nested structs
    const nestedStruct = resolveStruct(member.typeName, state.symbols);
    if (nestedStruct) {
      advanceToSlotBoundary(state);
      allocateStructMembers(state, nestedStruct);
      if (state.offset > 0) {
        state.slot += 1;
        state.offset = 0;
      }
      continue;
    }

    // Fixed arrays within structs
    if (member.typeName.kind === 'array' && member.typeName.length !== null) {
      advanceToSlotBoundary(state);
      allocateFixedArray(state, member.typeName);
      continue;
    }

    if (memberEncoding === 'mapping' || memberEncoding === 'dynamic_array' || memberEncoding === 'bytes') {
      // These always take 1 full slot even within a struct
      advanceToSlotBoundary(state);
      state.slot += 1;
      state.offset = 0;
      continue;
    }

    // Inplace member -- pack
    if (memberSize !== null) {
      if (state.offset > 0 && (32 - state.offset) < memberSize) {
        state.slot += 1;
        state.offset = 0;
      }
      state.offset += memberSize;
      if (state.offset >= 32) {
        state.slot += 1;
        state.offset = 0;
      }
    } else {
      // Unknown size member -- allocate full slot
      advanceToSlotBoundary(state);
      state.slot += 1;
      state.offset = 0;
    }
  }
}

/**
 * Allocate storage for a fixed-size array.
 * Elements are packed sequentially starting at the current (aligned) slot.
 *
 * Caller must ensure typeName.length is not null before calling.
 */
function allocateFixedArray(
  state: AllocState,
  typeName: ParsedTypeName & { kind: 'array' },
): void {
  const arrayLength = typeName.length ?? 0;
  const elemSize = getTypeSize(typeName.base, state.symbols);
  const elemEncoding = getEncoding(typeName.base, state.symbols);

  // Each element that is a mapping/dynamic takes 1 slot
  if (elemEncoding === 'mapping' || elemEncoding === 'dynamic_array' || elemEncoding === 'bytes') {
    state.slot += arrayLength;
    state.offset = 0;
    return;
  }

  // Element is a struct
  const elemStruct = resolveStruct(typeName.base, state.symbols);
  if (elemStruct) {
    for (let i = 0; i < arrayLength; i++) {
      advanceToSlotBoundary(state);
      allocateStructMembers(state, elemStruct);
      if (state.offset > 0) {
        state.slot += 1;
        state.offset = 0;
      }
    }
    return;
  }

  // Elementary / enum elements -- pack sequentially
  if (elemSize !== null) {
    if (elemSize <= 32) {
      // Small elements pack within slots
      for (let i = 0; i < arrayLength; i++) {
        if (state.offset > 0 && (32 - state.offset) < elemSize) {
          state.slot += 1;
          state.offset = 0;
        }
        state.offset += elemSize;
        if (state.offset >= 32) {
          state.slot += 1;
          state.offset = 0;
        }
      }
    } else {
      // Large elements (e.g. nested fixed arrays) -- each takes ceil(elemSize/32) slots
      const slotsPerElem = Math.ceil(elemSize / 32);
      state.slot += arrayLength * slotsPerElem;
      state.offset = 0;
    }
    // Fixed arrays always round up to a full slot at the end
    if (state.offset > 0) {
      state.slot += 1;
      state.offset = 0;
    }
  } else {
    // Unknown element size -- allocate length slots
    state.slot += arrayLength;
    state.offset = 0;
  }
}

/**
 * Register a StorageTypeDefinition entry if not already present.
 */
function registerType(
  typeId: string,
  typeName: ParsedTypeName,
  state: AllocState,
): void {
  if (state.types[typeId]) return;

  const encoding = getEncoding(typeName, state.symbols);
  const size = getTypeSize(typeName, state.symbols);
  const label = buildTypeLabel(typeName, state.symbols);

  const def: StorageTypeDefinition = {
    encoding,
    label,
    numberOfBytes: size !== null ? String(size) : '32',
  };

  // Mappings: add key and value type references
  if (typeName.kind === 'mapping') {
    const keyId = buildTypeId(typeName.key, state.symbols);
    const valueId = buildTypeId(typeName.value, state.symbols);
    def.key = keyId;
    def.value = valueId;

    // Recursively register key and value types
    registerType(keyId, typeName.key, state);
    registerType(valueId, typeName.value, state);
  }

  // Structs: add members with their allocated slots
  if (typeName.kind === 'userDefined') {
    const structDef = resolveStruct(typeName, state.symbols);
    if (structDef) {
      def.members = buildStructMemberEntries(structDef, state);
    }
  }

  // Arrays: register base type
  if (typeName.kind === 'array') {
    const baseId = buildTypeId(typeName.base, state.symbols);
    registerType(baseId, typeName.base, state);
  }

  state.types[typeId] = def;
}

/**
 * Build StorageLayoutEntry[] for struct members (relative to struct start).
 */
function buildStructMemberEntries(
  structDef: ParsedStructDef,
  state: AllocState,
): StorageLayoutEntry[] {
  const entries: StorageLayoutEntry[] = [];
  let memberSlot = 0;
  let memberOffset = 0;

  for (const member of structDef.members) {
    const memberTypeId = buildTypeId(member.typeName, state.symbols);
    const memberEncoding = getEncoding(member.typeName, state.symbols);
    const memberSize = getTypeSize(member.typeName, state.symbols);

    // Register the member type
    registerType(memberTypeId, member.typeName, state);

    // Nested struct
    const nestedStruct = resolveStruct(member.typeName, state.symbols);
    if (nestedStruct) {
      if (memberOffset > 0) {
        memberSlot += 1;
        memberOffset = 0;
      }
      entries.push({
        astId: state.astIdCounter++,
        contract: structDef.contractName || structDef.name,
        label: member.name,
        offset: 0,
        slot: String(memberSlot),
        type: memberTypeId,
      });
      // Compute nested struct size for slot advancement
      const nestedSize = computeStructSlotCount(nestedStruct, state.symbols);
      memberSlot += nestedSize;
      memberOffset = 0;
      continue;
    }

    // Fixed array within struct
    if (member.typeName.kind === 'array' && member.typeName.length !== null) {
      if (memberOffset > 0) {
        memberSlot += 1;
        memberOffset = 0;
      }
      entries.push({
        astId: state.astIdCounter++,
        contract: structDef.contractName || structDef.name,
        label: member.name,
        offset: 0,
        slot: String(memberSlot),
        type: memberTypeId,
      });
      const arraySlots = computeFixedArraySlotCount(member.typeName, state.symbols);
      memberSlot += arraySlots;
      memberOffset = 0;
      continue;
    }

    // Mapping / dynamic types take 1 full slot
    if (memberEncoding === 'mapping' || memberEncoding === 'dynamic_array' || memberEncoding === 'bytes') {
      if (memberOffset > 0) {
        memberSlot += 1;
        memberOffset = 0;
      }
      entries.push({
        astId: state.astIdCounter++,
        contract: structDef.contractName || structDef.name,
        label: member.name,
        offset: 0,
        slot: String(memberSlot),
        type: memberTypeId,
      });
      memberSlot += 1;
      memberOffset = 0;
      continue;
    }

    // Inplace packing
    if (memberSize !== null) {
      if (memberOffset > 0 && (32 - memberOffset) < memberSize) {
        memberSlot += 1;
        memberOffset = 0;
      }
      entries.push({
        astId: state.astIdCounter++,
        contract: structDef.contractName || structDef.name,
        label: member.name,
        offset: memberOffset,
        slot: String(memberSlot),
        type: memberTypeId,
      });
      memberOffset += memberSize;
      if (memberOffset >= 32) {
        memberSlot += 1;
        memberOffset = 0;
      }
    } else {
      // Unknown size
      if (memberOffset > 0) {
        memberSlot += 1;
        memberOffset = 0;
      }
      entries.push({
        astId: state.astIdCounter++,
        contract: structDef.contractName || structDef.name,
        label: member.name,
        offset: 0,
        slot: String(memberSlot),
        type: memberTypeId,
      });
      memberSlot += 1;
      memberOffset = 0;
    }
  }

  return entries;
}

/**
 * Advance state to the next slot boundary if not already aligned.
 */
function advanceToSlotBoundary(state: AllocState): void {
  if (state.offset > 0) {
    state.slot += 1;
    state.offset = 0;
  }
}

/**
 * Record a StorageLayoutEntry at the current slot/offset.
 */
function recordEntry(
  state: AllocState,
  name: string,
  contractName: string,
  typeId: string,
): void {
  state.storage.push({
    astId: state.astIdCounter++,
    contract: contractName,
    label: name,
    offset: state.offset,
    slot: String(state.slot),
    type: typeId,
  });
}
