import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../lib/utils";
import { Badge } from "../../../components/ui/badge";

/** Root classes for a Vara tool: visible focus, an AA-contrast primary fill, and 44px controls with 16px text on phones. */
export const SURFACE = "[&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-ring [&_button[data-variant=default]]:bg-[oklch(0.54_0.18_250)] [&_button[data-variant=default]]:text-white [&_button[data-variant=default]:hover]:bg-[oklch(0.50_0.18_250)] max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11 max-md:[&_input:not([type=file]):not([type=checkbox]):not([type=radio])]:min-h-11 max-md:[&_select]:min-h-11 max-md:[&_input:not([type=file])]:text-base max-md:[&_select]:text-base max-md:[&_textarea]:text-base max-md:[&_[data-slot=tabs-list]]:h-auto";

/** Native select for Vara tools: platform picker, shared chevron, the height of an input. */
export const selectClass = "select-chevron h-10 w-full rounded-md border border-input bg-background pl-3 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Page title for a Vara tool: one h1, one short line of context, optional controls, and where its data comes from as
 *  the last item on the right. A string source is a plain badge; a live status passes its own badge. */
export function ToolHeader({ title, description, aside, source }: { title: string; description?: ReactNode; aside?: ReactNode; source?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-prose">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {(aside || source) && <div className="flex flex-wrap items-center gap-2">
        {aside}
        {typeof source === "string" ? <Badge variant="outline">{source}</Badge> : source}
      </div>}
    </header>
  );
}

/** The one card chrome for Vara tools: optional title bar with actions, a body, and an optional action footer. */
export function Panel({ title, actions, footer, children, className, ...props }: { title?: string; actions?: ReactNode; footer?: ReactNode; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border/70 bg-card", className)} {...props}>
      {(title || actions) && (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className="space-y-4 p-4">{children}</div>
      {/* On desktop the footer stays in view while a long form scrolls. */}
      {footer && <div className="flex flex-wrap items-center gap-2 rounded-b-lg border-t border-border/60 bg-card px-4 py-3 lg:sticky lg:bottom-0">{footer}</div>}
    </section>
  );
}
