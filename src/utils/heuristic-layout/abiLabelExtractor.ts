import type { HeimdallDecompilation } from "@/utils/heimdall/types";

export interface AbiHint {
  label: string;
  typeHint: string;
  preferredSlot: number | null;
}

type AbiEntry = HeimdallDecompilation["abi"][number];

interface Recipe {
  inputs: string[];
  outputs: string[];
  typeHint: string;
}

const ERC20_LIKE: Record<string, Recipe> = {
  owner:        { inputs: [],                         outputs: ["address"], typeHint: "t_address" },
  totalSupply:  { inputs: [],                         outputs: ["uint256"], typeHint: "t_uint256" },
  name:         { inputs: [],                         outputs: ["string"],  typeHint: "t_string_storage" },
  symbol:       { inputs: [],                         outputs: ["string"],  typeHint: "t_string_storage" },
  decimals:     { inputs: [],                         outputs: ["uint8"],   typeHint: "t_uint8" },
  paused:       { inputs: [],                         outputs: ["bool"],    typeHint: "t_bool" },
  balanceOf:    { inputs: ["address"],                outputs: ["uint256"], typeHint: "t_mapping_address_uint256" },
  allowance:    { inputs: ["address", "address"],     outputs: ["uint256"], typeHint: "t_mapping_address_mapping_address_uint256" },
};

function matchesRecipe(entry: AbiEntry, recipe: Recipe): boolean {
  if (entry.type !== "function") return false;
  if (entry.stateMutability !== "view" && entry.stateMutability !== "pure") return false;
  const inputs = (entry.inputs ?? []).map((i) => i.type);
  const outputs = (entry.outputs ?? []).map((o) => o.type);
  if (inputs.length !== recipe.inputs.length) return false;
  if (outputs.length !== recipe.outputs.length) return false;
  for (let i = 0; i < inputs.length; i++) if (inputs[i] !== recipe.inputs[i]) return false;
  for (let i = 0; i < outputs.length; i++) if (outputs[i] !== recipe.outputs[i]) return false;
  return true;
}

export function extractAbiHints(abi: AbiEntry[]): AbiHint[] {
  const seen = new Set<string>();
  const out: AbiHint[] = [];
  for (const entry of abi) {
    if (entry.type !== "function" || !entry.name) continue;
    const recipe = ERC20_LIKE[entry.name];
    if (!recipe) continue;
    if (!matchesRecipe(entry, recipe)) continue;
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    out.push({ label: entry.name, typeHint: recipe.typeHint, preferredSlot: null });
  }
  return out;
}
