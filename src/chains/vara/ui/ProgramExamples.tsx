import { Code, Coins } from "@phosphor-icons/react";
import type { Hex } from "../model";
import { shortHex } from "./HexChip";

// Addresses checked against the projects' published apps/indexer on 2026-10-03.
// Logo sources and address evidence: public/logos/vara/SOURCES.md.
export const PROGRAM_EXAMPLES: { id: Hex; name: string; program: string; description: string; logo?: string; requiresIdl?: boolean }[] = [
  { id: "0xa749ccd80d71637b450789e12e3d94524e9ae17877d1b59f5ddda784f89a2cba", name: "Polybaskets", program: "BasketMarket", description: "Prediction baskets & agents", logo: "/logos/vara/polybaskets.png" },
  { id: "0x038534fe3ec91c4a9b4074f14908bfeca6358da0515772a428d8c489fdd134a1", name: "RivrDEX", program: "WVARA / WUSDT pair", description: "Pool activity · IDL file needed", logo: "/logos/vara/rivrdex.png", requiresIdl: true },
  { id: "0x4255ff4a87a4c13dc39f74ace8c4948bbef2f75fb639d66639a1cfcc99e6243e", name: "Wrapped USDT", program: "VFT token", description: "Token balances & allowances" },
  { id: "0xbdc6cbde7047f3a742c589a0073412cecdb56bd541a7d2b1810d134794d82029", name: "ServiceSync", program: "Sails program", description: "Explore the published interface" },
];

export function ProgramMark({ id, small = false }: { id: string; small?: boolean }) {
  const project = PROGRAM_EXAMPLES.find((p) => p.id === id.toLowerCase());
  const icon = small ? 14 : 22;
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden border border-border/60 bg-muted/40 ${small ? "size-6 rounded-md" : "size-10 rounded-lg"}`}>
    {project?.logo ? <img src={project.logo} alt="" className={`size-full object-contain ${project.name === "Polybaskets" ? "scale-[1.6]" : ""}`} width={40} height={40} /> : project?.program === "VFT token" ? <Coins size={icon} className="text-muted-foreground" /> : <Code size={icon} className="text-muted-foreground" />}
  </span>;
}

/** One-click mainnet examples as a compact chip row under the program input. */
export function ProgramExamples({ onSelect, disabled }: { onSelect: (id: Hex) => void; disabled?: boolean }) {
  return <details><summary className="min-h-9 cursor-pointer content-center text-sm text-muted-foreground">Example programs</summary><div className="flex flex-wrap items-center gap-1.5 py-2" role="group" aria-label="Example programs">
    {PROGRAM_EXAMPLES.map((p) => <button type="button" key={p.id} disabled={disabled} onClick={() => onSelect(p.id)} title={`${p.program} · ${p.description} · ${shortHex(p.id)}`}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border/70 pl-1 pr-2.5 text-xs transition-colors hover:border-border hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      <ProgramMark id={p.id} small />
      <span className="font-medium">{p.name}</span>
      {p.requiresIdl && <span className="text-muted-foreground">· IDL file needed</span>}
    </button>)}
  </div></details>;
}
