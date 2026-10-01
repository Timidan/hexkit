import { useMemo, useState } from "react";
import FileTree from "../../../components/smoothui/ui/FileTree";
import type { FileTreeItem } from "../../../components/smoothui/ui/FileTree";
import { CopyButton } from "../../../components/ui/copy-button";

function leafText(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  return String(value);
}

function toItem(value: unknown, key: string, id: string, leaves: Map<string, string>): FileTreeItem {
  if (Array.isArray(value)) {
    return { id, name: key, type: "folder", badge: <span className="font-mono">[{value.length}]</span>, children: value.map((v, i) => toItem(v, String(i), `${id}.${i}`, leaves)) };
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return { id, name: key, type: "folder", badge: <span className="font-mono">{`{${entries.length}}`}</span>, children: entries.map(([k, v]) => toItem(v, k, `${id}.${k}`, leaves)) };
  }
  const text = leafText(value);
  leaves.set(id, text);
  return {
    id,
    name: key,
    type: "file",
    icon: <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />,
    badge: <span className="block max-w-[46vw] truncate font-mono text-foreground/80 sm:max-w-[42ch]" title={text}>{text}</span>,
  };
}

/** Decoded SCALE/JSON value as an expandable tree (SmoothUI FileTree). Leaves show their full value when selected. */
export function ValueTree({ value, rootLabel = "value" }: { value: unknown; rootLabel?: string }) {
  const [selected, setSelected] = useState<string | undefined>();
  const { items, leaves, expanded } = useMemo(() => {
    const leaves = new Map<string, string>();
    const root = toItem(value, rootLabel, "root", leaves);
    const expanded: string[] = [];
    // Open the first two levels so small values read without clicking.
    const walk = (item: FileTreeItem, depth: number) => {
      if (item.type === "folder" && depth < 2) {
        expanded.push(item.id);
        item.children?.forEach((c) => walk(c, depth + 1));
      }
    };
    walk(root, 0);
    return { items: [root], leaves, expanded };
  }, [value, rootLabel]);

  if (value === null || typeof value !== "object") {
    const text = leafText(value);
    return (
      <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-sm">{text}</code>
        <CopyButton variant="ghost" size="icon-sm" value={text} ariaLabel="Copy value" />
      </div>
    );
  }

  const full = selected ? leaves.get(selected) : undefined;
  return (
    <div className="space-y-2">
      <div className="max-h-[28rem] overflow-auto rounded-md border border-border/60 bg-background/40 p-2">
        {/* Keyed by structure so a new value re-applies the default expansion. */}
        <FileTree key={expanded.join("|")} items={items} defaultExpanded={expanded} selected={selected} onSelectedChange={setSelected} showLines />
      </div>
      {full !== undefined && (
        <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 p-3">
          <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-sm">{full}</code>
          <CopyButton variant="ghost" size="icon-sm" value={full} ariaLabel="Copy selected value" />
        </div>
      )}
    </div>
  );
}
