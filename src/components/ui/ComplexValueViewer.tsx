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
import InlineCopyButton from './InlineCopyButton';
import {
  buildSummary,
  collapsedPreview,
  createNodeFromValue,
  determineValueKind,
  DEFAULT_OPTIONS,
  formatDisplayValue,
  serializeNode,
  shouldCollapseNode,
  type ComplexValueMetadata,
  type ComplexValueNode,
  type NormalizedViewerOptions,
  type ViewerOptions,
} from '../../utils/complexValueBuilder';
import { CollapseAllIcon, ExpandAllIcon } from '../icons/IconLibrary';

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
  const classes = ['complex-value-viewer'];
  if (className) {
    classes.push(className);
  }

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
    <div className={classes.join(' ')}>
      {showControls && node.children && node.children.length > 0 && (
        <div className="cv-collapse-all" role="group" aria-label="Tree controls">
          <button
            type="button"
            className="cv-action-btn"
            onClick={() =>
              setGlobalAction({ type: 'collapse', timestamp: Date.now() })
            }
            title="Collapse all nodes"
            aria-label="Collapse all nodes"
          >
            <CollapseAllIcon width={16} height={16} />
          </button>
          <button
            type="button"
            className="cv-action-btn"
            onClick={() =>
              setGlobalAction({ type: 'expand', timestamp: Date.now() })
            }
            title="Expand all nodes"
            aria-label="Expand all nodes"
          >
            <ExpandAllIcon width={16} height={16} />
          </button>
        </div>
      )}

      <NodeRenderer
        node={node}
        depth={0}
        options={collapseConfig}
        globalAction={globalAction}
      />
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

  const valueKind = determineValueKind(node.value ?? displayValue, node.type);

  const shouldVirtualize =
    !collapsed && node.children && node.children.length > VIRTUALIZATION_THRESHOLD;

  return (
    <div
      className="cv-node"
      data-depth={depth}
      data-collapsible={isCollapsible ? 'true' : 'false'}
      data-collapsed={collapsed && isCollapsible ? 'true' : 'false'}
    >
      <div className="cv-node-header">
        <ToggleButton
          hidden={!isCollapsible}
          collapsed={collapsed}
          onToggle={() =>
            startTransition(() => setCollapsed((prev) => !prev))
          }
        />

        <div className="cv-key-stack">
          <div className="cv-key">{node.label}</div>
          {node.type && <div className="cv-meta">{node.type}</div>}
          {summary && summary.length > 0 && (
            <div className="cv-summary">{summary}</div>
          )}
        </div>

        {displayValue && (
          <div className="cv-value" data-kind={valueKind}>
            {displayValue}
          </div>
        )}

        {hasCopyCapability && (
          <div className="cv-copy-button-wrapper">
            <InlineCopyButton
              value={simpleCopyValue}
              getValue={simpleCopyValue ? undefined : getSerializedCopyValue}
              ariaLabel={`Copy ${node.label}`}
              iconSize={14}
              size={28}
            />
          </div>
        )}
      </div>

      {isCollapsible && !collapsed && node.children && (
        shouldVirtualize ? (
          <VirtualizedChildList
            nodes={node.children}
            depth={depth + 1}
            options={options}
            globalAction={globalAction}
          />
        ) : (
          <div className="cv-children cv-children--plain">
            {node.children.map((child, index) => (
              <div key={`${child.label ?? 'child'}-${index}`} className="cv-child">
                <NodeRenderer
                  node={child}
                  depth={depth + 1}
                  options={options}
                  globalAction={globalAction}
                />
              </div>
            ))}
          </div>
        )
      )}
    </div>
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
    <div
      ref={containerRef}
      className="cv-children cv-children--virtual"
      onScroll={handleScroll}
    >
      <div
        className="cv-virtual-spacer"
        style={{ paddingTop, paddingBottom }}
      >
        {rows}
      </div>
    </div>
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
    <div ref={rowRef} className="cv-child">
      <NodeRenderer
        node={node}
        depth={depth}
        options={options}
        globalAction={globalAction}
      />
    </div>
  );
}

interface ToggleButtonProps {
  hidden?: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  hidden,
  collapsed,
  onToggle,
}) => {
  return (
    <button
      type="button"
      className="cv-toggle"
      data-hidden={hidden ? 'true' : undefined}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (hidden) return;
        onToggle();
      }}
    >
      {collapsed ? '▸' : '▾'}
    </button>
  );
};

export default ComplexValueViewer;
