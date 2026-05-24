import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WidthVariant = "full" | "narrow";

interface WorkbenchBodyProps {
  composerHeader?: ReactNode;
  composer: ReactNode;
  outcome: ReactNode;
  actions?: ReactNode;
  trailing?: ReactNode;
  /**
   * `narrow` centers content at `max-w-xl` (single-column swap tabs).
   * `full` (default) spans the workbench width (2x2 input grids).
   */
  width?: WidthVariant;
  className?: string;
}

const WIDTH_CLASS: Record<WidthVariant, string> = {
  full: "",
  narrow: "mx-auto w-full max-w-xl",
};

export function WorkbenchBody({
  composerHeader,
  composer,
  outcome,
  actions,
  trailing,
  width = "full",
  className,
}: WorkbenchBodyProps) {
  const inner = WIDTH_CLASS[width];

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex min-w-0 flex-col gap-4 p-5">
        <div className={inner}>{composerHeader}</div>
        <div className={cn("flex min-w-0 flex-col gap-3", inner)}>
          {composer}
        </div>
      </div>

      <div className="border-t border-white/[0.05] bg-gradient-to-b from-white/[0.015] to-transparent p-5">
        <div className={inner}>{outcome}</div>
      </div>

      {trailing && (
        <div className="border-t border-white/[0.05] px-5 py-4">
          <div className={inner}>{trailing}</div>
        </div>
      )}

      {actions && (
        <div className="border-t border-white/[0.05] bg-zinc-950/40 px-5 py-3">
          <div
            className={cn(
              "flex items-center justify-end gap-2",
              inner,
            )}
          >
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}
