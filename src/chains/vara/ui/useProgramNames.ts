import { useEffect, useState } from "react";
import { ideaProgram } from "../idea";
import { registryEntry } from "../registry";
import type { Hex } from "../model";
import { PROGRAM_EXAMPLES } from "./ProgramExamples";

/** Names for the given program ids (lowercase keys): HexKit's checked example name, else the agents registry handle
 *  when the program is registered, else the Gear IDEA name, which anyone can set. Unnamed or unknown ids are absent. */
export function useProgramNames(ids: Array<string | null | undefined>): Map<string, string> {
  const key = [...new Set(ids.filter((s): s is string => !!s && /^0x[0-9a-fA-F]{64}$/.test(s)).map((s) => s.toLowerCase()))].sort().join(",");
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split(",") : [];
    void Promise.all(list.map(async (id) => { const [entry, program] = await Promise.all([registryEntry(id as Hex), ideaProgram(id as Hex)]); return [id, PROGRAM_EXAMPLES.find((p) => p.id === id)?.name ?? entry?.handle ?? program?.name ?? null] as const; })).then((rows) => {
      if (!cancelled) setNames(new Map(rows.filter((r): r is readonly [string, string] => r[1] !== null)));
    });
    return () => { cancelled = true; };
  }, [key]);
  return names;
}
