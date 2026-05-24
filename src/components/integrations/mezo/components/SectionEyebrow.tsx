import { cn } from "@/lib/utils";

type EyebrowStatus = "live" | "empty" | "warning" | "off";

interface SectionEyebrowProps {
  label: string;
  status?: EyebrowStatus;
  suffix?: React.ReactNode;
  className?: string;
}

const STATUS_DOT: Record<EyebrowStatus, string> = {
  live: "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]",
  empty: "bg-zinc-600",
  warning: "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.14)]",
  off: "bg-zinc-700",
};

export function SectionEyebrow({
  label,
  status = "empty",
  suffix,
  className,
}: SectionEyebrowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500",
        className,
      )}
    >
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])}
        />
        {label}
      </span>
      {suffix}
    </div>
  );
}
