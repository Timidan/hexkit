import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from 'react';

import '../../styles/ComplexValueViewer.css';
import {
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  ChevronsDownUp,
  Wallet,
  Hash,
  Binary,
  ToggleLeft,
  Braces,
  List,
  FileText,
  CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CopyButton } from './copy-button';
import { Button } from './button';
import { ScrollArea } from './scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './collapsible';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from './hover-card';
import {
  buildSummary,
  collapsedPreview,
  createNodeFromValue,
  DEFAULT_OPTIONS,
  formatDisplayValue,
  serializeNode,
  shouldCollapseNode,
  type ComplexValueMetadata,
  type ComplexValueNode,
  type NormalizedViewerOptions,
  type ViewerOptions,
} from '../../utils/complexValueBuilder';

interface ComplexValueViewerProps {
  value?: any;
  node?: ComplexValueNode;
  metadata?: ComplexValueMetadata;
  label?: string;
  options?: ViewerOptions;
  className?: string;
  showControls?: boolean;
}

type GlobalAction = {
  type: 'collapse' | 'expand';
  timestamp: number;
};

const VIRTUALIZATION_THRESHOLD = 24;
const DEFAULT_ROW_HEIGHT = 48;
const VIRTUAL_OVERSCAN = 6;

// Unified styling — neutral warm-gray badges, white text, dark bg
const BADGE_STYLE = {
  color: 'text-zinc-300',
  bgColor: 'bg-zinc-700/60',
  borderColor: 'border-zinc-600/50',
} as const;

const typeConfig: Record<string, {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  address:  { icon: Wallet,    ...BADGE_STYLE },
  uint256:  { icon: Hash,      ...BADGE_STYLE },
  uint:     { icon: Hash,      ...BADGE_STYLE },
  int256:   { icon: Hash,      ...BADGE_STYLE },
  bytes:    { icon: Binary,    ...BADGE_STYLE },
  bytes32:  { icon: Binary,    ...BADGE_STYLE },
  bool:     { icon: ToggleLeft,...BADGE_STYLE },
  tuple:    { icon: Braces,    ...BADGE_STYLE },
  array:    { icon: List,      ...BADGE_STYLE },
  string:   { icon: FileText,  ...BADGE_STYLE },
  default:  { icon: CircleDot, ...BADGE_STYLE },
};

// Get type configuration based on Solidity type
const getTypeConfig = (type?: string) => {
  if (!type) return typeConfig.default;

  const normalizedType = type.toLowerCase();

  if (normalizedType === 'address') return typeConfig.address;
  if (normalizedType.startsWith('uint')) return typeConfig.uint256;
  if (normalizedType.startsWith('int')) return typeConfig.int256;
  if (normalizedType === 'bytes' || normalizedType.startsWith('bytes')) return typeConfig.bytes;
  if (normalizedType === 'bool') return typeConfig.bool;
  if (normalizedType === 'string') return typeConfig.string;
  if (normalizedType.startsWith('tuple')) return typeConfig.tuple;
  if (normalizedType.includes('[]') || normalizedType.includes('[')) return typeConfig.array;

  return typeConfig.default;
};

const ComplexValueViewer: React.FC<ComplexValueViewerProps> = ({
  value,
  node: nodeProp,
  metadata,
  label,
  options,
  className,
  showControls = true,
}) => {
  const resolvedMetadata = useMemo<ComplexValueMetadata | undefined>(() => {
    if (!metadata && !label) return metadata;
    return {
      ...metadata,
      label: label ?? metadata?.label,
    };
  }, [metadata, label]);

  const node = useMemo<ComplexValueNode>(() => {
    if (nodeProp) {
      return nodeProp;
    }
    return createNodeFromValue(value, resolvedMetadata);
  }, [nodeProp, resolvedMetadata, value]);

  const [globalAction, setGlobalAction] = useState<GlobalAction | null>(null);
  const [isAllExpanded, setIsAllExpanded] = useState(false);

  const collapseConfig = useMemo<NormalizedViewerOptions>(() => {
    return {
      collapse: {
        root: options?.collapse?.root ?? DEFAULT_OPTIONS.collapse.root,
        depth: options?.collapse?.depth ?? DEFAULT_OPTIONS.collapse.depth,
        arrayItems:
          options?.collapse?.arrayItems ?? DEFAULT_OPTIONS.collapse.arrayItems,
        objectKeys:
          options?.collapse?.objectKeys ?? DEFAULT_OPTIONS.collapse.objectKeys,
      },
      previewItems: options?.previewItems ?? DEFAULT_OPTIONS.previewItems,
    };
  }, [options]);

  return (
    <div
      className={cn(
        'cv-container relative overflow-hidden',
        'rounded-lg border border-neutral-800/60 bg-transparent',
        'font-mono text-sm text-white',
        className
      )}
    >
      {/* Subtle grid background pattern */}
      <div className="absolute inset-0 cv-grid-bg opacity-[0.02] pointer-events-none" />

      {/* Header with controls */}
      {showControls && node.children && node.children.length > 0 && (
        <div className="relative flex items-center justify-between px-3 py-2 border-b border-neutral-800/60 bg-transparent">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            Decoded Parameters
          </span>
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6 text-slate-500 hover:text-slate-300 hover:bg-neutral-800/60"
                onClick={() => {
                  const next = isAllExpanded ? 'collapse' : 'expand';
                  setIsAllExpanded(!isAllExpanded);
                  setGlobalAction({ type: next, timestamp: Date.now() });
                }}
              >
                {isAllExpanded
                  ? <ChevronsDownUp className="h-3.5 w-3.5" />
                  : <ChevronsUpDown className="h-3.5 w-3.5" />}
              </Button>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" className="text-xs">
              {isAllExpanded ? 'Collapse all' : 'Expand all'}
            </HoverCardContent>
          </HoverCard>
        </div>
      )}

      {/* Content area */}
      <div className="relative p-2">
        <NodeRenderer
          node={node}
          depth={0}
          options={collapseConfig}
          globalAction={globalAction}
        />
      </div>
    </div>
  );
};

interface NodeRendererProps {
  node: ComplexValueNode;
  depth: number;
  options: NormalizedViewerOptions;
  globalAction: GlobalAction | null;
}

const NodeRendererComponent: React.FC<NodeRendererProps> = ({
  node,
  depth,
  options,
  globalAction,
}) => {
  const isCollapsible = Boolean(node.children && node.children.length > 0);

  const defaultCollapsed = useMemo(
    () => shouldCollapseNode(node, depth, options),
    [depth, node, options]
  );

  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  const [isHovered, setIsHovered] = useState(false);
  const [isValueExpanded, setIsValueExpanded] = useState(false);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  useEffect(() => {
    if (!globalAction) return;
    startTransition(() => {
      setCollapsed(globalAction.type === 'collapse');
    });
  }, [globalAction]);

  const preview = useMemo(() => {
    if (!isCollapsible) return '';
    if (!collapsed) return '';
    return collapsedPreview(node, options.previewItems ?? DEFAULT_OPTIONS.previewItems);
  }, [collapsed, isCollapsible, node, options.previewItems]);

  const summary = useMemo(() => buildSummary(node), [node]);

  const simpleCopyValue = useMemo(() => {
    if (node.value === undefined) return undefined;
    if (typeof node.value === 'string') return node.value;
    if (typeof node.value === 'number' || typeof node.value === 'boolean') {
      return String(node.value);
    }
    if (typeof node.value === 'bigint') {
      return node.value.toString();
    }
    return formatDisplayValue(node.value, node.type);
  }, [node.value, node.type]);

  const hasCopyCapability = useMemo(() => {
    if (simpleCopyValue && simpleCopyValue.length > 0) return true;
    if (node.raw !== undefined) return true;
    if (node.children && node.children.length > 0) return true;
    return false;
  }, [node.children, node.raw, simpleCopyValue]);

  const getSerializedCopyValue = useCallback(() => serializeNode(node), [node]);

  const displayValue = node.value !== undefined
    ? formatDisplayValue(node.value, node.type)
    : preview;

  const typeStyle = getTypeConfig(node.type);
  const TypeIcon = typeStyle.icon;

  const shouldVirtualize =
    !collapsed && node.children && node.children.length > VIRTUALIZATION_THRESHOLD;

  const isRoot = depth === 0;

  const nodeContent = (
    <div
      className={cn(
        'cv-node group relative rounded-md px-2 py-1.5',
        isCollapsible && 'cursor-pointer'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Depth indicator line */}
      {!isRoot && (
        <div
          className={cn(
            'absolute left-0 top-3 w-0.5 h-3 rounded-full',
            'transition-all duration-150',
            'bg-zinc-500/30',
            isHovered && 'h-5'
          )}
        />
      )}

      {/* Single flowing row: [toggle] [label] [badge] [summary] [data...wraps] [copy] */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {/* Toggle button — always stays on first line */}
        {isCollapsible ? (
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                'h-5 w-5 p-0 shrink-0 text-slate-500 hover:text-slate-300',
                'transition-transform duration-200',
                !collapsed && 'text-slate-400'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </CollapsibleTrigger>
        ) : (
          <span className="w-5 h-5 inline-flex items-center justify-center shrink-0">
            <span className="w-1 h-1 rounded-full bg-zinc-500/30" />
          </span>
        )}

        {/* Label */}
        <span
          className={cn(
            'font-medium text-[13px] tracking-tight shrink-0 whitespace-nowrap',
            isRoot ? 'text-slate-200' : 'text-white',
            'transition-colors duration-150',
            isHovered && 'text-white'
          )}
        >
          {node.label}
        </span>

        {/* Type badge with icon */}
        {node.type && (
          <span
            className={cn(
              'cv-type-badge inline-flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap',
              'text-[10px] font-medium uppercase tracking-wider',
              'border transition-all duration-150',
              'bg-zinc-700/60 border-zinc-600/50 text-zinc-300'
            )}
          >
            <TypeIcon className="h-2.5 w-2.5" />
            <span>{node.type}</span>
          </span>
        )}

        {/* Summary count */}
        {summary && summary.length > 0 && (
          <span className="text-[10px] text-slate-400 tabular-nums shrink-0 whitespace-nowrap">
            ({summary})
          </span>
        )}

        {/* Value — truncated for long values with expand toggle */}
        {displayValue && (() => {
          const isLong = displayValue.length > 120;
          const truncated = isLong && !isValueExpanded
            ? displayValue.slice(0, 120) + '…'
            : displayValue;

          return (
            <div className="flex flex-col gap-1 min-w-0">
              <div
                className={cn(
                  'cv-value font-mono text-xs tabular-nums',
                  'break-all',
                  'transition-colors duration-150',
                  'text-white/80',
                  isLong && isValueExpanded && 'max-h-40 overflow-y-auto cv-long-value-scroll'
                )}
              >
                {truncated}
              </div>
              {isLong && (
                <button
                  type="button"
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors self-start"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsValueExpanded(!isValueExpanded);
                  }}
                >
                  {isValueExpanded ? '▲ Collapse' : '▼ Show full value'}
                </button>
              )}
            </div>
          );
        })()}

        {/* Copy button */}
        {hasCopyCapability && (
          <CopyButton
            value={simpleCopyValue}
            getValue={simpleCopyValue ? undefined : getSerializedCopyValue}
            ariaLabel={`Copy ${node.label}`}
            iconSize={12}
            className={cn(
              'h-5 w-5 text-slate-600 shrink-0',
              'opacity-0 group-hover:opacity-100',
              'transition-opacity duration-150',
              'hover:text-slate-300 hover:bg-slate-700/50'
            )}
          />
        )}
      </div>
    </div>
  );

  if (!isCollapsible) {
    return <div className="mb-0.5">{nodeContent}</div>;
  }

  return (
    <Collapsible
      open={!collapsed}
      onOpenChange={(open) => startTransition(() => setCollapsed(!open))}
      className="mb-0.5"
    >
      {nodeContent}

      <CollapsibleContent>
        <div className={cn(
          'cv-children ml-4 mt-0.5 pl-3',
          'border-l border-neutral-800/60',
          'transition-all duration-200'
        )}>
          {shouldVirtualize ? (
            <VirtualizedChildList
              nodes={node.children!}
              depth={depth + 1}
              options={options}
              globalAction={globalAction}
            />
          ) : (
            <div className="space-y-0.5">
              {node.children!.map((child, index) => (
                <NodeRenderer
                  key={`${child.label ?? 'child'}-${index}`}
                  node={child}
                  depth={depth + 1}
                  options={options}
                  globalAction={globalAction}
                />
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const NodeRenderer = React.memo(NodeRendererComponent, (prev, next) => {
  if (prev.node !== next.node) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.options !== next.options) return false;

  const prevAction = prev.globalAction;
  const nextAction = next.globalAction;

  if (prevAction === nextAction) return true;
  if (!prevAction || !nextAction) return false;
  return (
    prevAction.type === nextAction.type &&
    prevAction.timestamp === nextAction.timestamp
  );
});

interface VirtualizedChildListProps {
  nodes: ComplexValueNode[];
  depth: number;
  options: NormalizedViewerOptions;
  globalAction: GlobalAction | null;
}

interface VirtualizedRowProps {
  node: ComplexValueNode;
  depth: number;
  options: NormalizedViewerOptions;
  globalAction: GlobalAction | null;
  onMeasure: (height: number) => void;
}

function VirtualizedChildList({
  nodes,
  depth,
  options,
  globalAction,
}: VirtualizedChildListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const estimatedHeightRef = useRef<number>(DEFAULT_ROW_HEIGHT);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateHeight = () => {
      setViewportHeight(el.clientHeight || 0);
    };
    updateHeight();
    const resizeObserver = new ResizeObserver(() => updateHeight());
    resizeObserver.observe(el);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(event.currentTarget.scrollTop);
    },
    []
  );

  const total = nodes.length;
  const estimatedHeight = estimatedHeightRef.current || DEFAULT_ROW_HEIGHT;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / estimatedHeight) - VIRTUAL_OVERSCAN
  );
  const visibleCount = viewportHeight
    ? Math.ceil(viewportHeight / estimatedHeight) + VIRTUAL_OVERSCAN * 2
    : total;
  const endIndex = Math.min(total, startIndex + visibleCount);
  const paddingTop = startIndex * estimatedHeight;
  const paddingBottom = Math.max(0, (total - endIndex) * estimatedHeight);

  const handleMeasure = useCallback((height: number) => {
    if (!height || Number.isNaN(height)) return;
    estimatedHeightRef.current = Math.max(
      24,
      Math.min(
        estimatedHeightRef.current * 0.6 + height * 0.4,
        400
      )
    );
  }, []);

  const rows: React.ReactNode[] = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    const child = nodes[index];
    rows.push(
      <VirtualizedRow
        key={`${child.label ?? 'child'}-${index}`}
        node={child}
        depth={depth}
        options={options}
        globalAction={globalAction}
        onMeasure={handleMeasure}
      />
    );
  }

  return (
    <ScrollArea className="max-h-[60vh]">
      <div
        ref={containerRef}
        className="overflow-y-auto"
        onScroll={handleScroll}
      >
        <div style={{ paddingTop, paddingBottom }}>
          <div className="space-y-0.5">
            {rows}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function VirtualizedRow({
  node,
  depth,
  options,
  globalAction,
  onMeasure,
}: VirtualizedRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const measure = () => {
      const height = el.offsetHeight || DEFAULT_ROW_HEIGHT;
      onMeasure(height);
    };
    measure();

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length) return;
      const { height } = entries[0].contentRect;
      if (height) {
        onMeasure(height);
      }
    });

    resizeObserver.observe(el);
    return () => {
      resizeObserver.disconnect();
    };
  }, [onMeasure]);

  return (
    <div ref={rowRef}>
      <NodeRenderer
        node={node}
        depth={depth}
        options={options}
        globalAction={globalAction}
      />
    </div>
  );
}

export default ComplexValueViewer;
