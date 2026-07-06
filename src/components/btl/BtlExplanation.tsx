import { useState, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { CaretDown, Sparkle, CircleNotch } from "@phosphor-icons/react";
import type { BtlRuntimeMeta } from "@/lib/btl/client";
import { AiCostChip } from "@/components/btl/AiCostChip";
import BtlBadge from "@/components/BtlBadge";
import ThinkingIndicator from "@/components/btl/ThinkingIndicator";

interface BtlExplanationProps {
  text: string | null;
  meta: BtlRuntimeMeta | null;
  loading?: boolean;
  error?: string | null;
  /** Header label, e.g. "AI explanation" / "Upgrade audit" / "Slot annotations". */
  title?: string;
  /** Retry handler; renders a small retry affordance on error when provided. */
  onRetry?: () => void;
  defaultOpen?: boolean;
  /** Custom body (e.g. slot chips). When set, rendered instead of the markdown. */
  children?: ReactNode;
}

/**
 * Shared, collapsible panel for any BTL freeform explanation (the weave
 * outputs). Renders the model's markdown (headers, bold, lists, tables) and
 * folds up/down. Carries the cost chip in the header and the "AI-assisted"
 * note + BTL badge in the footer.
 */
export function BtlExplanation({
  text,
  meta,
  loading = false,
  error = null,
  title = "AI explanation",
  onRetry,
  defaultOpen = true,
  children,
}: BtlExplanationProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!loading && !error && !text && !children) return null;

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-border/50 bg-background/60 text-sm"
    >
      <Collapsible.Trigger className="group flex w-full items-center gap-2 rounded-t-lg px-3 py-2 text-left transition-colors hover:bg-muted/20">
        <Sparkle weight="duotone" className="h-4 w-4 shrink-0 text-foreground/70" />
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {loading && (
          <CircleNotch className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        <span className="ml-auto flex items-center gap-2">
          {meta && <AiCostChip meta={meta} />}
          <CaretDown
            className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
            aria-hidden="true"
          />
        </span>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="border-t border-border/40 px-3 py-3">
          {loading && !text && !children ? (
            <ThinkingIndicator />
          ) : error && !text && !children ? (
            <p className="text-muted-foreground">
              {error}{" "}
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Retry
                </button>
              )}
            </p>
          ) : children ? (
            children
          ) : (
            <Markdown source={text ?? ""} />
          )}

          <div className="mt-3 flex items-center gap-3 border-t border-border/30 pt-2 text-[10px] text-muted-foreground">
            <span>AI-assisted — verify.</span>
            <BtlBadge className="ml-auto transition-opacity hover:opacity-100" showLabel />
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

// ── Lightweight markdown renderer ────────────────────────────────────────────
// Handles what the BTL weaves actually emit: ## / ### headers, **bold**,
// `inline code`, "- " bullet lists (incl. 2-space nesting), and | pipe tables |.
// Not a full markdown engine — intentionally small and dependency-free.

function Markdown({ source }: { source: string }): ReactNode {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isDivider = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Table: header row + divider + body rows
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={key++} className="my-2 overflow-x-auto rounded-md border border-border/40">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th
                    key={hi}
                    className="border-b border-border/40 bg-muted/20 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td
                      key={ci}
                      className="border-b border-border/20 px-2 py-1.5 align-top tabular-nums"
                    >
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Headers
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      blocks.push(
        <p
          key={key++}
          className={
            level <= 2
              ? "mt-3 mb-1 text-sm font-semibold text-foreground"
              : "mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/80"
          }
        >
          {inline(h[2])}
        </p>,
      );
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: { depth: number; text: string }[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)[-*]\s+(.*)$/)!;
        items.push({ depth: Math.floor(m[1].length / 2), text: m[2] });
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-1 space-y-0.5">
          {items.map((it, ii) => (
            <li
              key={ii}
              className="flex gap-2 text-foreground/90"
              style={{ marginLeft: it.depth * 14 }}
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span>{inline(it.text)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-2 border-border/30" />);
      i++;
      continue;
    }

    // Paragraph
    blocks.push(
      <p key={key++} className="my-1 text-foreground/90">
        {inline(line)}
      </p>,
    );
    i++;
  }

  return <div className="space-y-0.5 leading-relaxed">{blocks}</div>;
}

function splitRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Inline formatting: **bold** and `code`. */
function inline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={k++} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <code key={k++} className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[0.85em]">
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default BtlExplanation;
