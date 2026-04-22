import { useCallback, useMemo, useState } from 'react';
import {
  computeArrayElementSlot,
  computeMappingSlot,
  computeNestedMappingSlot,
  formatSlotHex,
  parseSlotInput,
} from '../../utils/storageSlotCalculator';
import type {
  DiscoveredMappingKey,
  MappingKey,
  PathSegment,
  SlotMode,
} from './storageViewerTypes';

interface Args {
  contractAddress: string;
  chainId: number;
  sessionId: string | null;
  session: { totalSnapshots?: number } | null;
  pathSegments: PathSegment[];
  setPathSegments: (updater: (prev: PathSegment[]) => PathSegment[]) => void;
  mappingEntriesBySlot: Map<
    string,
    { variable?: string; keyTypeId?: string } | undefined
  >;
  setManualKeys: (
    updater: (
      prev: Map<string, DiscoveredMappingKey[]>,
    ) => Map<string, DiscoveredMappingKey[]>,
  ) => void;
  addManualSlot: (address: string, slot: string) => void;
  readAndUpdateSlot: (
    chainId: number,
    address: string,
    slot: string,
  ) => Promise<unknown>;
  readSlotFromRpc: (
    chainId: number,
    address: string,
    slot: string,
  ) => Promise<string | null>;
  readSlotFromEdb: (
    sessionId: string,
    snapshotIdx: number,
    slot: string,
  ) => Promise<unknown>;
}

/**
 * Slot-probe form state: the base slot + optional mapping/array/nested keys,
 * the live-computed derived slot, and the action that commits a probe by
 * reading its value from RPC (and optionally EDB at the latest snapshot).
 */
export function useStorageProbe(args: Args) {
  const {
    contractAddress,
    chainId,
    sessionId,
    session,
    pathSegments,
    setPathSegments,
    mappingEntriesBySlot,
    setManualKeys,
    addManualSlot,
    readAndUpdateSlot,
    readSlotFromRpc,
    readSlotFromEdb,
  } = args;

  const [probeMode, setProbeMode] = useState<SlotMode>('simple');
  const [baseSlotInput, setBaseSlotInput] = useState('0');
  const [mappingKey, setMappingKey] = useState<MappingKey>({
    type: 'address',
    value: '',
  });
  const [arrayIndex, setArrayIndex] = useState('0');
  const [nestedKeys, setNestedKeys] = useState<MappingKey[]>([
    { type: 'address', value: '' },
  ]);
  const [manualSlotReading, setManualSlotReading] = useState(false);

  const computedSlot = useMemo(() => {
    try {
      const baseSlot = parseSlotInput(baseSlotInput);

      switch (probeMode) {
        case 'simple':
          return { hex: formatSlotHex(baseSlot), raw: baseSlot, error: null };

        case 'mapping': {
          if (!mappingKey.value.trim())
            return { hex: '', raw: 0n, error: null };
          const slot = computeMappingSlot(
            baseSlot,
            mappingKey.value.trim(),
            mappingKey.type,
          );
          return { hex: formatSlotHex(slot), raw: slot, error: null };
        }

        case 'array': {
          const index = BigInt(arrayIndex || '0');
          const slot = computeArrayElementSlot(baseSlot, index);
          return { hex: formatSlotHex(slot), raw: slot, error: null };
        }

        case 'nested': {
          const validKeys = nestedKeys.filter((k) => k.value.trim());
          if (validKeys.length === 0) return { hex: '', raw: 0n, error: null };
          const slot = computeNestedMappingSlot(baseSlot, validKeys);
          return { hex: formatSlotHex(slot), raw: slot, error: null };
        }
      }
    } catch (e: unknown) {
      return {
        hex: '',
        raw: 0n,
        error: e instanceof Error ? e.message : 'Computation failed',
      };
    }
  }, [probeMode, baseSlotInput, mappingKey, arrayIndex, nestedKeys]);

  const handleProbeSlot = useCallback(async () => {
    const addr = contractAddress.trim();
    if (!addr || !computedSlot.hex) return;

    setManualSlotReading(true);
    try {
      if (probeMode === 'mapping' && mappingKey.value.trim()) {
        const baseSlotHex = formatSlotHex(parseSlotInput(baseSlotInput));
        const mappingEntry = mappingEntriesBySlot.get(baseSlotHex.toLowerCase());

        const variable = mappingEntry?.variable || `slot_${baseSlotInput}`;
        const keyType = mappingKey.type;
        const key = mappingKey.value.trim();
        const derivedSlotHex = computedSlot.hex;

        const entry: DiscoveredMappingKey = {
          key,
          keyType,
          derivedSlot: derivedSlotHex,
          value: null,
          variable,
          baseSlot: baseSlotHex,
          source: 'manual_lookup',
          sourceLabel: 'Manual',
          sources: ['manual_lookup'],
          sourceLabels: ['Manual'],
          evidenceCount: 1,
        };

        setManualKeys((prev) => {
          const next = new Map(prev);
          const bucket = baseSlotHex.toLowerCase();
          const existing = next.get(bucket) || [];
          if (
            !existing.some(
              (e) =>
                e.key === key &&
                e.derivedSlot.toLowerCase() === derivedSlotHex.toLowerCase(),
            )
          ) {
            next.set(bucket, [...existing, entry]);
          }
          return next;
        });

        if (pathSegments.length === 0) {
          setPathSegments(() => [
            {
              label: variable,
              variable,
              baseSlot: baseSlotHex,
              keyTypeId: mappingEntry?.keyTypeId,
            },
          ]);
        }

        readSlotFromRpc(chainId, addr, derivedSlotHex).then((value) => {
          if (value) {
            setManualKeys((prev) => {
              const next = new Map(prev);
              const bucket = baseSlotHex.toLowerCase();
              const existing = next.get(bucket) || [];
              next.set(
                bucket,
                existing.map((e) =>
                  e.derivedSlot.toLowerCase() === derivedSlotHex.toLowerCase()
                    ? { ...e, value }
                    : e,
                ),
              );
              return next;
            });
          }
        });
      } else {
        addManualSlot(addr, computedSlot.hex);
        await readAndUpdateSlot(chainId, addr, computedSlot.hex);
      }

      if (sessionId && session?.totalSnapshots && session.totalSnapshots > 0) {
        await readSlotFromEdb(sessionId, session.totalSnapshots - 1, computedSlot.hex);
      }
    } finally {
      setManualSlotReading(false);
    }
  }, [
    contractAddress,
    computedSlot.hex,
    chainId,
    sessionId,
    session?.totalSnapshots,
    addManualSlot,
    readAndUpdateSlot,
    readSlotFromEdb,
    probeMode,
    mappingKey,
    baseSlotInput,
    mappingEntriesBySlot,
    readSlotFromRpc,
    pathSegments.length,
    setManualKeys,
    setPathSegments,
  ]);

  const addNestedKey = useCallback(
    () => setNestedKeys((prev) => [...prev, { type: 'address', value: '' }]),
    [],
  );
  const removeNestedKey = useCallback(
    (i: number) => setNestedKeys((prev) => prev.filter((_, idx) => idx !== i)),
    [],
  );
  const updateNestedKey = useCallback(
    (i: number, field: 'type' | 'value', val: string) => {
      setNestedKeys((prev) => {
        const updated = [...prev];
        updated[i] = { ...updated[i], [field]: val };
        return updated;
      });
    },
    [],
  );

  return {
    probeMode, setProbeMode,
    baseSlotInput, setBaseSlotInput,
    mappingKey, setMappingKey,
    arrayIndex, setArrayIndex,
    nestedKeys, addNestedKey, removeNestedKey, updateNestedKey,
    manualSlotReading,
    computedSlot,
    handleProbeSlot,
  };
}
