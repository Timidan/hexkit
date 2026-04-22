import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ChainIcon from "../../../icons/ChainIcon";
import { TokenIcon } from "../TokenIcon";
import type { IdleAsset, SelectedSource, Leg, LegStatus } from "./types";
import type { EarnVault } from "../types";
import { computeFlowHeight } from "./flow-utils";

interface SourceNodeData {
  asset: IdleAsset;
  amountDecimal: string;
  amountUsd: number | null;
  status: LegStatus | "idle";
  handleSide: "right";
}

interface DestinationNodeData {
  vault: EarnVault;
  chainName: string;
  handleSide: "left";
}

interface RouterNodeData {
  label: string;
  sublabel?: string;
}

function SourceNode({ data }: { data: SourceNodeData }) {
  const { asset, amountDecimal, amountUsd, status } = data;
  const usd =
    amountUsd != null
      ? amountUsd < 0.01
        ? "<$0.01"
        : `$${amountUsd.toFixed(2)}`
      : "$—";
  return (
    <div
      className={`relative rounded-lg border bg-card px-3 py-2 shadow-sm transition-colors ${
        statusToBorder(status)
      }`}
      style={{ minWidth: 180 }}
    >
      <div className="flex items-center gap-2">
        <TokenIcon
          token={asset.token}
          chainId={asset.chainId}
          className="h-7 w-7 rounded-full border border-background bg-muted object-contain"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-semibold">
            {asset.token.symbol}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ChainIcon chainId={asset.chainId} size={10} rounded={5} />
            {asset.chainName}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 tabular-nums">
        <span className="text-[11px] font-semibold">{amountDecimal}</span>
        <span className="text-[10px] text-muted-foreground">≈ {usd}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#10b981", width: 8, height: 8 }}
      />
    </div>
  );
}

function RouterNode({ data }: { data: RouterNodeData }) {
  return (
    <div
      className="flex flex-col items-center rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-center shadow-sm"
      style={{ minWidth: 140 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#6366f1", width: 8, height: 8 }}
      />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Router
      </span>
      <span className="mt-0.5 text-xs font-semibold">{data.label}</span>
      {data.sublabel && (
        <span className="mt-0.5 text-[10px] text-muted-foreground">
          {data.sublabel}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#6366f1", width: 8, height: 8 }}
      />
    </div>
  );
}

function DestinationNode({ data }: { data: DestinationNodeData }) {
  const { vault, chainName } = data;
  const tokens = vault.underlyingTokens ?? [];
  const label =
    tokens.length > 0
      ? tokens.map((t) => t.symbol).join(" / ")
      : vault.name ?? vault.slug;
  const apy = vault.analytics.apy.total;
  const apyStr = apy != null ? `${apy.toFixed(2)}%` : "—";

  return (
    <div
      className="relative rounded-lg border border-emerald-500/60 bg-emerald-500/5 px-3 py-2 shadow-sm"
      style={{ minWidth: 180 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#10b981", width: 8, height: 8 }}
      />
      <div className="flex items-center gap-2">
        {tokens.slice(0, 2).map((t) => (
          <TokenIcon
            key={t.address}
            token={t}
            chainId={vault.chainId}
            className="h-7 w-7 rounded-full border border-background bg-muted object-contain"
          />
        ))}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-semibold">{label}</span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ChainIcon chainId={vault.chainId} size={10} rounded={5} />
            {chainName}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 tabular-nums">
        <span className="text-[10px] text-muted-foreground">
          {vault.protocol.name}
        </span>
        <span className="text-[11px] font-semibold text-emerald-500">
          {apyStr} APY
        </span>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  source: SourceNode as unknown as NodeTypes[string],
  router: RouterNode as unknown as NodeTypes[string],
  destination: DestinationNode as unknown as NodeTypes[string],
};

function FitViewOnChange({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => fitView({ padding: 0.25 }));
    return () => cancelAnimationFrame(id);
  }, [nodeCount, fitView]);
  return null;
}

function statusToBorder(status: LegStatus | "idle"): string {
  switch (status) {
    case "done":
      return "border-emerald-500/70";
    case "failed":
      return "border-red-500/70";
    case "executing":
    case "bridging":
      return "border-amber-500/70";
    case "pending":
    case "idle":
    default:
      return "border-border/50";
  }
}

function statusToEdgeColor(status: LegStatus | "idle"): string {
  switch (status) {
    case "done":
      return "#10b981";
    case "failed":
      return "#ef4444";
    case "executing":
    case "bridging":
      return "#f59e0b";
    case "pending":
    case "idle":
    default:
      return "#6b7280";
  }
}

function statusIsAnimating(status: LegStatus | "idle"): boolean {
  return status === "executing" || status === "bridging";
}

export type RoutingMode = "per-asset" | "consolidate";

interface FlowDiagramProps {
  selections: SelectedSource[];
  consolidatedDestination: EarnVault | null;
  perAssetDestinations: Map<string, EarnVault>;
  routingMode: RoutingMode;
  legs: Leg[];
}

export function FlowDiagram({
  selections,
  consolidatedDestination,
  perAssetDestinations,
  routingMode,
  legs,
}: FlowDiagramProps) {
  const legStatusById = useMemo(() => {
    const m = new Map<string, LegStatus>();
    for (const l of legs) m.set(l.id, l.status);
    return m;
  }, [legs]);

  const { initialNodes, initialEdges } = useMemo(
    () =>
      buildGraph({
        selections,
        consolidatedDestination,
        perAssetDestinations,
        routingMode,
        legStatusById,
      }),
    [
      selections,
      consolidatedDestination,
      perAssetDestinations,
      routingMode,
      legStatusById,
    ]
  );

  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (selections.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
        Select one or more idle assets above to preview the execution path.
      </div>
    );
  }

  const hasAnyDestination =
    routingMode === "consolidate"
      ? consolidatedDestination !== null
      : Array.from(perAssetDestinations.values()).length > 0;

  if (!hasAnyDestination) {
    return (
      <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
        Pick a destination vault to see the execution path.
      </div>
    );
  }

  // Responsive height based on row count
  const rowCount =
    routingMode === "consolidate"
      ? selections.length
      : Math.max(selections.length, perAssetDestinations.size);
  const containerHeight = computeFlowHeight(rowCount);

  return (
    <div
      className="rounded-lg border border-border/40 bg-background/30"
      style={{ height: containerHeight }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.4}
        maxZoom={1.5}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
      >
        <FitViewOnChange nodeCount={nodes.length} />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls
          showInteractive={false}
          position="bottom-right"
          className="!flex !flex-col !gap-0.5 !rounded-md !border !border-border/40 !bg-background/80 !p-0.5 !shadow-md [&_button]:!h-6 [&_button]:!w-6 [&_button]:!rounded [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!text-muted-foreground [&_button:hover]:!bg-muted/60 [&_button:hover]:!text-foreground [&_button_svg]:!max-h-3 [&_button_svg]:!max-w-3 [&_button_svg]:!fill-current"
        />
      </ReactFlow>
    </div>
  );
}

function buildGraph(args: {
  selections: SelectedSource[];
  consolidatedDestination: EarnVault | null;
  perAssetDestinations: Map<string, EarnVault>;
  routingMode: RoutingMode;
  legStatusById: Map<string, LegStatus>;
}) {
  const {
    selections,
    consolidatedDestination,
    perAssetDestinations,
    routingMode,
    legStatusById,
  } = args;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const SOURCE_X = 0;
  const DEST_X = 520;
  const ROUTER_X = 260;
  const ROW_HEIGHT = 110;

  const totalRows = Math.max(1, selections.length);
  const centerY = ((totalRows - 1) * ROW_HEIGHT) / 2;

  selections.forEach((sel, i) => {
    const key = legKey(sel);
    const status = legStatusById.get(key) ?? "idle";
    const amountDecimal = amountDecimalFor(sel);
    const amountUsd =
      sel.asset.amountUsd != null && isSelectionFull(sel)
        ? sel.asset.amountUsd
        : sel.asset.amountUsd != null
          ? sel.asset.amountUsd * (percentOfFull(sel) / 100)
          : null;

    nodes.push({
      id: `src:${key}`,
      type: "source",
      position: { x: SOURCE_X, y: i * ROW_HEIGHT },
      data: {
        asset: sel.asset,
        amountDecimal,
        amountUsd,
        status,
        handleSide: "right",
      } satisfies SourceNodeData,
      draggable: false,
      selectable: false,
    });
  });

  if (routingMode === "consolidate" && consolidatedDestination) {
    // Sources → single router → single destination
    nodes.push({
      id: "router",
      type: "router",
      position: { x: ROUTER_X, y: centerY },
      data: {
        label: "LI.FI Composer",
        sublabel: crossChainLabel(selections, consolidatedDestination),
      } satisfies RouterNodeData,
      draggable: false,
      selectable: false,
    });

    nodes.push({
      id: "dest",
      type: "destination",
      position: { x: DEST_X, y: centerY },
      data: {
        vault: consolidatedDestination,
        chainName: chainNameFromSelections(
          selections,
          consolidatedDestination.chainId
        ),
        handleSide: "left",
      } satisfies DestinationNodeData,
      draggable: false,
      selectable: false,
    });

    selections.forEach((sel) => {
      const key = legKey(sel);
      const status = legStatusById.get(key) ?? "idle";
      edges.push({
        id: `e:src:${key}->router`,
        source: `src:${key}`,
        target: "router",
        type: "default",
        animated: statusIsAnimating(status),
        style: { stroke: statusToEdgeColor(status), strokeWidth: 2 },
      });
    });

    const worstStatus = rollupStatus(
      selections.map((s) => legStatusById.get(legKey(s)) ?? "idle")
    );
    edges.push({
      id: "e:router->dest",
      source: "router",
      target: "dest",
      type: "default",
      animated: statusIsAnimating(worstStatus),
      style: { stroke: statusToEdgeColor(worstStatus), strokeWidth: 2 },
    });
  } else {
    selections.forEach((sel, i) => {
      const key = legKey(sel);
      const dest = perAssetDestinations.get(key);
      if (!dest) return;
      const status = legStatusById.get(key) ?? "idle";

      nodes.push({
        id: `dest:${key}`,
        type: "destination",
        position: { x: DEST_X, y: i * ROW_HEIGHT },
        data: {
          vault: dest,
          chainName: chainNameFromSelections(selections, dest.chainId),
          handleSide: "left",
        } satisfies DestinationNodeData,
        draggable: false,
        selectable: false,
      });

      edges.push({
        id: `e:src:${key}->dest:${key}`,
        source: `src:${key}`,
        target: `dest:${key}`,
        type: "default",
        animated: statusIsAnimating(status),
        style: { stroke: statusToEdgeColor(status), strokeWidth: 2 },
        label: labelForEdge(sel, dest),
        labelStyle: { fontSize: 10, fill: "#9ca3af" },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: "rgba(0,0,0,0.6)" },
      });
    });
  }

  return { initialNodes: nodes, initialEdges: edges };
}

function legKey(sel: SelectedSource): string {
  return `${sel.asset.chainId}:${sel.asset.token.address.toLowerCase()}`;
}

function percentOfFull(sel: SelectedSource): number {
  try {
    const full = BigInt(sel.asset.amountRaw);
    const part = BigInt(sel.amountRaw);
    if (full === 0n) return 0;
    return Number((part * 100n) / full);
  } catch {
    return 0;
  }
}

function isSelectionFull(sel: SelectedSource): boolean {
  try {
    return BigInt(sel.amountRaw) === BigInt(sel.asset.amountRaw);
  } catch {
    return false;
  }
}

function amountDecimalFor(sel: SelectedSource): string {
  try {
    const full = BigInt(sel.asset.amountRaw);
    const part = BigInt(sel.amountRaw);
    if (full === 0n) return sel.asset.amountDecimal;
    if (part === full) return trimDecimal(sel.asset.amountDecimal);
    const ratio = Number(part) / Number(full);
    const fullNum = Number(sel.asset.amountDecimal);
    if (!Number.isFinite(fullNum)) return trimDecimal(sel.asset.amountDecimal);
    return trimDecimal((fullNum * ratio).toFixed(6));
  } catch {
    return sel.asset.amountDecimal;
  }
}

function trimDecimal(s: string): string {
  if (!s.includes(".")) return s;
  const [whole, frac] = s.split(".");
  const clipped = frac.slice(0, 6).replace(/0+$/, "");
  return clipped.length > 0 ? `${whole}.${clipped}` : whole;
}

function crossChainLabel(
  sources: SelectedSource[],
  dest: EarnVault
): string | undefined {
  const crossCount = sources.filter(
    (s) => s.asset.chainId !== dest.chainId
  ).length;
  if (crossCount === 0) return "same-chain";
  if (crossCount === sources.length) return `bridging ${crossCount}`;
  return `bridging ${crossCount} of ${sources.length}`;
}

function chainNameFromSelections(
  sources: SelectedSource[],
  chainId: number
): string {
  const hit = sources.find((s) => s.asset.chainId === chainId);
  return hit?.asset.chainName ?? `chain ${chainId}`;
}

function labelForEdge(sel: SelectedSource, dest: EarnVault): string {
  return sel.asset.chainId === dest.chainId ? "same-chain" : "bridge";
}

function rollupStatus(statuses: Array<LegStatus | "idle">): LegStatus | "idle" {
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some(statusIsAnimating)) return "bridging";
  if (statuses.some((s) => s === "pending")) return "pending";
  if (statuses.every((s) => s === "done")) return "done";
  return "idle";
}
