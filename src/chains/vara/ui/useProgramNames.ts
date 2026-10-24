import { useEffect, useState } from "react";
import { ideaProgram } from "../idea";
import type { Hex } from "../model";

/** Gear IDEA names for the given program ids (lowercase keys). Unnamed or unknown ids are absent. */
export function useProgramNames(ids: Array<string | null | undefined>): Map<string, string> {
  const key = [...new Set(ids.filter((s): s is string => !!s && /^0x[0-9a-fA-F]{64}$/.test(s)).map((s) => s.toLowerCase()))].sort().join(",");
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split(",") : [];
    void Promise.all(list.map(async (id) => [id, (await ideaProgram(id as Hex))?.name ?? null] as const)).then((rows) => {
      if (!cancelled) setNames(new Map(rows.filter((r): r is readonly [string, string] => r[1] !== null)));
    });
    return () => { cancelled = true; };
  }, [key]);
  return names;
}
