import React, { useState } from "react";
import type { FunctionInvocation } from "@/chains/starknet/simulatorTypes";

const MAX_DEPTH = 256;

interface Props {
  node: FunctionInvocation;
  depth?: number;
}

function shortAddress(addr: string): string {
  if (addr.length < 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

function shortSelector(selector: string): string {
  if (selector.length < 18) return selector;
  return `${selector.slice(0, 10)}…`;
}

const InvocationTree: React.FC<Props> = ({ node, depth = 0 }) => {
  const [open, setOpen] = useState(depth < 2);

  if (depth >= MAX_DEPTH) {
    return (
      <div className="text-[10px] text-muted-foreground italic">
        … tree depth clamp ({MAX_DEPTH}) reached
      </div>
    );
  }

  const hasChildren = node.calls.length > 0;
  const label =
    node.decodedSelector ?? shortSelector(node.entryPointSelector);

  return (
    <div className="pl-3 border-l border-border/40">
      <button
        type="button"
        onClick={() => hasChildren && setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-1 text-left text-xs hover:bg-white/5 rounded"
        aria-expanded={open}
      >
        <span className="w-3 text-muted-foreground">
          {hasChildren ? (open ? "▾" : "▸") : "·"}
        </span>
        <span className="font-mono text-foreground">{label}</span>
        <span className="text-muted-foreground">@</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {shortAddress(node.contractAddress)}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {node.callType} · {node.entryPointType}
        </span>
      </button>

      {open && (
        <div className="pl-2 py-1 text-[11px] text-muted-foreground space-y-1">
          {node.calldata.length > 0 && (
            <div>
              <span className="font-semibold">calldata[{node.calldata.length}]:</span>{" "}
              <span className="font-mono break-all">
                {node.calldata.slice(0, 8).join(" · ")}
                {node.calldata.length > 8 && " …"}
              </span>
            </div>
          )}
          {node.result.length > 0 && (
            <div>
              <span className="font-semibold">result[{node.result.length}]:</span>{" "}
              <span className="font-mono break-all">
                {node.result.slice(0, 8).join(" · ")}
                {node.result.length > 8 && " …"}
              </span>
            </div>
          )}
          {node.events.length > 0 && (
            <div>
              <span className="font-semibold">events[{node.events.length}]</span>
            </div>
          )}
          {hasChildren && (
            <div className="space-y-0.5">
              {node.calls.map((child, i) => (
                <InvocationTree key={i} node={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InvocationTree;
