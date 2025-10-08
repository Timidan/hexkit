import React, { useEffect, useMemo, useState } from 'react';

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
        <div className="cv-collapse-all">
          <button
            type="button"
            className="cv-action-btn"
            onClick={() =>
              setGlobalAction({ type: 'collapse', timestamp: Date.now() })
            }
          >
            Collapse All
          </button>
          <button
            type="button"
            className="cv-action-btn"
            onClick={() =>
              setGlobalAction({ type: 'expand', timestamp: Date.now() })
            }
          >
            Expand All
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

const NodeRenderer: React.FC<NodeRendererProps> = ({
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
  }, [defaultCollapsed, node]);

  useEffect(() => {
    if (!globalAction) return;
    setCollapsed(globalAction.type === 'collapse');
  }, [globalAction]);

  const preview = useMemo(() => {
    if (!isCollapsible) return '';
    if (!collapsed) return '';
    return collapsedPreview(node, options.previewItems ?? DEFAULT_OPTIONS.previewItems);
  }, [collapsed, isCollapsible, node, options.previewItems]);

  const summary = useMemo(() => buildSummary(node), [node]);

  const copyValue = useMemo(() => serializeNode(node), [node]);

  const displayValue = node.value !== undefined
    ? formatDisplayValue(node.value, node.type)
    : preview;

  const valueKind = determineValueKind(node.value ?? displayValue, node.type);

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
          onToggle={() => setCollapsed((prev) => !prev)}
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

        {copyValue && copyValue.length > 0 && (
          <div className="cv-copy-button-wrapper">
            <InlineCopyButton
              value={copyValue}
              ariaLabel={`Copy ${node.label}`}
              iconSize={14}
              size={28}
            />
          </div>
        )}
      </div>

      {isCollapsible && !collapsed && node.children && (
        <div className="cv-children">
          {node.children.map((child, index) => (
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
  );
};

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
