import type {
  StorageLayoutEntry,
  StorageLayoutResponse,
  StorageTypeDefinition,
} from "@/types/debug";
import type {
  HeimdallDecompilation,
  HeimdallStorageDump,
} from "@/utils/heimdall/types";
import { extractAbiHints } from "./abiLabelExtractor";

const SYNTHETIC_MAPPING_SLOT_BASE = 1_000_000;

const BASE_TYPES: Record<string, StorageTypeDefinition> = {
  t_bytes32: { encoding: "inplace", label: "bytes32", numberOfBytes: "32" },
  t_uint256: { encoding: "inplace", label: "uint256", numberOfBytes: "32" },
  t_address: { encoding: "inplace", label: "address", numberOfBytes: "20" },
  t_bool:    { encoding: "inplace", label: "bool",    numberOfBytes: "1"  },
  t_uint8:   { encoding: "inplace", label: "uint8",   numberOfBytes: "1"  },
  t_string_storage: {
    encoding: "bytes",
    label: "string",
    numberOfBytes: "32",
  },
  t_mapping_address_uint256: {
    encoding: "mapping",
    label: "mapping(address => uint256)",
    numberOfBytes: "32",
    key: "t_address",
    value: "t_uint256",
  },
  t_mapping_address_mapping_address_uint256: {
    encoding: "mapping",
    label: "mapping(address => mapping(address => uint256))",
    numberOfBytes: "32",
    key: "t_address",
    value: "t_mapping_address_uint256",
  },
};

function slotToNumericString(hexSlot: string): string {
  try {
    return BigInt(hexSlot).toString(10);
  } catch {
    return "0";
  }
}

export interface SynthesizeParams {
  dump: HeimdallStorageDump;
  decompilation?: HeimdallDecompilation;
}

export function synthesizeHeuristicLayout(
  { dump, decompilation }: SynthesizeParams,
): StorageLayoutResponse {
  const storage: StorageLayoutEntry[] = [];
  const types: Record<string, StorageTypeDefinition> = {};
  const usedLabels = new Set<string>();

  const ensureType = (key: string) => {
    if (!types[key] && BASE_TYPES[key]) types[key] = BASE_TYPES[key];
  };

  const sorted = [...dump.slots].sort((a, b) => {
    const an = BigInt(a.slot);
    const bn = BigInt(b.slot);
    return an < bn ? -1 : an > bn ? 1 : 0;
  });

  for (const slotEntry of sorted) {
    const modifier = (slotEntry.modifiers && slotEntry.modifiers.length === 1)
      ? slotEntry.modifiers[0]
      : null;
    const label = modifier ?? `slot_${slotEntry.slot}`;
    const typeKey = modifier ? "t_uint256" : "t_bytes32";
    ensureType(typeKey);
    usedLabels.add(label);
    storage.push({
      astId: storage.length,
      contract: "HeuristicDecompilation",
      label,
      offset: 0,
      slot: slotToNumericString(slotEntry.slot),
      type: typeKey,
    });
  }

  if (decompilation?.abi?.length) {
    const hints = extractAbiHints(decompilation.abi);
    let syntheticIndex = 0;
    for (const hint of hints) {
      if (usedLabels.has(hint.label)) continue;
      usedLabels.add(hint.label);
      ensureType(hint.typeHint);
      storage.push({
        astId: storage.length,
        contract: "HeuristicDecompilation",
        label: hint.label,
        offset: 0,
        slot: String(SYNTHETIC_MAPPING_SLOT_BASE + syntheticIndex),
        type: hint.typeHint,
      });
      syntheticIndex += 1;
    }
  }

  return { storage, types };
}
