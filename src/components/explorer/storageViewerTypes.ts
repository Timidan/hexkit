import type { SlotEvidence, ResolvedSlot, DiscoveredMappingKey, PathSegment } from '../../types/debug';

export type ViewFilter = 'all' | 'resolved' | 'unknown' | 'changed' | 'non-zero';
export type SlotMode = 'simple' | 'mapping' | 'array' | 'nested';

export interface MappingKey {
  type: string;
  value: string;
}

export const ZERO_VALUE = '0x0000000000000000000000000000000000000000000000000000000000000000';

/** Grid template for the slot table (shared between header + rows to prevent drift) */
export const SLOT_TABLE_GRID = 'grid-cols-[2fr_3fr_1.5fr_8fr]';
/** Grid template for mapping inspection view: KEY, SLOT, TYPE, VALUE */
export const MAPPING_TABLE_GRID = 'grid-cols-[2fr_3fr_1.5fr_8fr]';

/** Icon state for the storage grid SVG icon */
export type StorageIconState = 'empty' | 'valid' | 'loading' | 'loaded';

// Re-export commonly used types from debug so consumers don't need dual imports
export type { SlotEvidence, ResolvedSlot, DiscoveredMappingKey, PathSegment };
