import { Suspense, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { TOOL_ALIASES, toolGroups } from "./tools";
import { SURFACE } from "../ui/Panel";

export default function LabTool() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // PersistentTools keeps each workspace mounted when navigating to another one.
  const [group] = useState(() => toolGroups.find((g) => `/vara${g.path}` === pathname) ?? toolGroups[0]);
  // A retired id resolves to its replacement first, so the redirect below does not mount the fallback tool.
  const alias = TOOL_ALIASES[params.get("tool") ?? ""];
  const requested = group.tools.find((t) => t.id === (alias?.tool ?? params.get("tool"))) ?? group.tools[0];
  const [selected, setSelected] = useState(requested.id);
  const [visited, setVisited] = useState(() => new Set([requested.id]));
  useEffect(() => {
    if (pathname !== `/vara${group.path}`) return;
    setSelected(requested.id);
    setVisited((v) => v.has(requested.id) ? v : new Set([...v, requested.id]));
  }, [pathname, group.path, requested.id]);

  if (alias) { const next = new URLSearchParams(params); next.set("tool", alias.tool); next.set("view", alias.view); return <Navigate replace to={{ pathname, search: next.toString() }} />; }

  return <>
    <nav aria-label="Current workspace" className="mx-auto w-full max-w-[1280px] space-y-1.5 px-4 pt-4 md:hidden">
      <label htmlFor={`vara-${group.id}-tool`} className="sr-only">Vara tool</label>
      <select id={`vara-${group.id}-tool`} value={selected} onChange={(e) => { const target = toolGroups.find((g) => g.tools.some((t) => t.id === e.target.value))!; const next = new URLSearchParams(params); next.set("tool", e.target.value); navigate({ pathname: `/vara${target.path}`, search: next.toString() }); }}
        className="select-chevron min-h-11 w-full rounded-md border border-input bg-background pl-3 pr-8 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {toolGroups.map((g) => <optgroup key={g.id} label={g.label}>{g.tools.filter((t) => !t.hidden || t.id === selected).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>)}
      </select>
    </nav>
    {group.tools.map(({ id, label, Component }) => visited.has(id) &&
    // The entrance replays whenever `hidden` lifts (display: none → block), without remounting the tool.
    <section key={id} aria-label={label} hidden={selected !== id}
      className={`${SURFACE} motion-safe:animate-[vara-fade_150ms_ease-out] ${id === "program" || id === "message" || id === "address" ? "" : "mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6"}`}>
      <Suspense fallback={<p role="status" className="px-4 py-8 text-sm text-muted-foreground">Loading tool…</p>}><Component /></Suspense>
    </section>
  )}</>;
}

/** Preserve bookmarked URLs while giving every tool one canonical workspace. */
export function LegacyTool() {
  const { pathname, search, hash } = useLocation();
  const toolsByPath: Record<string, string> = { "/vara/program": "program", "/vara/message": "message", "/vara/address": "address" };
  if (pathname !== "/vara/lab" && !toolsByPath[pathname]) return null;
  const params = new URLSearchParams(search);
  const alias = TOOL_ALIASES[params.get("tool") ?? ""];
  if (alias) params.set("view", alias.view);
  const tool = toolsByPath[pathname] ?? alias?.tool ?? params.get("tool") ?? "simulator";
  const group = toolGroups.find((g) => g.tools.some((t) => t.id === tool)) ?? toolGroups[0];
  params.set("tool", group.tools.some((t) => t.id === tool) ? tool : group.tools[0].id);
  return <Navigate replace to={{ pathname: `/vara${group.path}`, search: params.toString(), hash }} />;
}
