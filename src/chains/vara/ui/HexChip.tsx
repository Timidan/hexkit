import AnimatedTooltip from "../../../components/smoothui/ui/AnimatedTooltip";
import { CopyButton } from "../../../components/ui/copy-button";
import { cn } from "../../../lib/utils";

export function shortHex(value: string, head = 6, tail = 4) {
  return value.length > head + tail + 3 ? `${value.slice(0, head + 2)}…${value.slice(-tail)}` : value;
}

/** Short hex with the full value on hover and a copy button. */
export function HexChip({ value, label, className, full = false }: { value: string; label: string; className?: string; full?: boolean }) {
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1", className)}>
      {full ? (
        <code className="min-w-0 break-all font-mono text-sm">{value}</code>
      ) : (
        <AnimatedTooltip content={<span className="block max-w-[80vw] break-all font-mono text-xs sm:max-w-md">{value}</span>}>
          <code className="font-mono text-sm" aria-label={`${label}: ${value}`}>{shortHex(value)}</code>
        </AnimatedTooltip>
      )}
      <CopyButton variant="ghost" size="icon-sm" value={value} ariaLabel={`Copy ${label}`} />
    </span>
  );
}

/** Field label + value pair used in result grids. */
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 text-sm">{children}</dd>
    </div>
  );
}
