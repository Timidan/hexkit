import { Eye } from "@phosphor-icons/react";
import { MEZO_LENS_COPY } from "./copy";

export function HonestyFooter() {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-white/[0.05] bg-zinc-950/40 px-4 py-3">
      <Eye
        weight="duotone"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500"
      />
      <p className="text-[11px] leading-relaxed text-zinc-500">
        <span className="font-mono uppercase tracking-wider text-zinc-400">
          Honesty ·
        </span>{" "}
        {MEZO_LENS_COPY.honestyFooter}
      </p>
    </div>
  );
}
