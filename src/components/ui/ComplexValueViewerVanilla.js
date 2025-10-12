/*
 * ComplexValueViewerVanilla
 * Lightweight tree renderer for ABI-like data with collapsible nodes.
 * This version is framework-agnostic for usage in static demos (e.g. test-wallet.html).
 */

const DEFAULT_OPTIONS = {
  collapse: {
    root: true,
    depth: 2,
    arrayItems: 6,
    objectKeys: 8,
  },
  previewItems: 3,
  showCopy: true,
};

const ICON_EXPANDED = '▾';
const ICON_COLLAPSED = '▸';
const MIN_AUTO_COLLAPSE_ARRAY_SIZE = 12;
const LARGE_CHILDREN_THRESHOLD = 120;
const CHILD_BATCH_SIZE = 200;

const COLLAPSE_SVG = `
  <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
    <path d="M6 8h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M6 16h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    <path d="m9 11 3-3 3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`;

const EXPAND_SVG = `
  <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
    <path d="M6 8h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M6 16h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    <path d="m9 13 3 3 3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`;

export class ComplexValueViewer {
  constructor(container, node, options = {}) {
    if (!container) {
      throw new Error('ComplexValueViewer requires a container element');
    }

    this.container = container;
    this.options = mergeOptions(options);
    this.node = node || null;
    this.collapsedState = new Map();
    this.visibleChildrenState = new Map();
    this.globalAction = null;

    this.container.classList.add('complex-value-viewer');
    this.render();
  }

  setNode(node) {
    this.node = node;
    this.collapsedState.clear();
    this.visibleChildrenState.clear();
    this.render();
  }

  collapseAll(collapsed = true) {
    this.globalAction = collapsed ? 'collapse' : 'expand';
    if (collapsed) {
      this.visibleChildrenState.clear();
    }
    this.render();
  }

  render() {
    this.container.innerHTML = '';

    if (!this.node) {
      const empty = document.createElement('div');
      empty.textContent = 'No result';
      empty.style.color = 'var(--cv-text-secondary, #94a3b8)';
      empty.style.fontSize = '12px';
      this.container.appendChild(empty);
      return;
    }

    const controls = this.createGlobalControls();
    if (controls) {
      this.container.appendChild(controls);
    }

    const rootNode = this.renderNode(this.node, 0, 'root');
    this.container.appendChild(rootNode);
    this.globalAction = null;
  }

  createGlobalControls() {
    const buttonRow = document.createElement('div');
    buttonRow.className = 'cv-collapse-all';

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'inline-copy-icon inline-action-icon';
    collapseBtn.style.setProperty('--inline-copy-size', '32px');
    collapseBtn.innerHTML = COLLAPSE_SVG;
    collapseBtn.title = 'Collapse all nodes';
    collapseBtn.setAttribute('aria-label', 'Collapse all nodes');
    collapseBtn.addEventListener('click', () => this.collapseAll(true));

    const expandBtn = document.createElement('button');
    expandBtn.className = 'inline-copy-icon inline-action-icon';
    expandBtn.style.setProperty('--inline-copy-size', '32px');
    expandBtn.innerHTML = EXPAND_SVG;
    expandBtn.title = 'Expand all nodes';
    expandBtn.setAttribute('aria-label', 'Expand all nodes');
    expandBtn.addEventListener('click', () => this.collapseAll(false));

    buttonRow.appendChild(collapseBtn);
    buttonRow.appendChild(expandBtn);
    return buttonRow;
  }

  renderNode(node, depth, pathKey) {
    const isCollapsible = Array.isArray(node.children) && node.children.length > 0;
    const element = document.createElement('div');
    element.className = 'cv-node';
    element.dataset.depth = String(depth);
    element.dataset.collapsible = isCollapsible ? 'true' : 'false';

    const key = pathKey;
    let collapsedState;
    if (this.globalAction === 'collapse') {
      collapsedState = true;
    } else if (this.globalAction === 'expand') {
      collapsedState = false;
    } else if (this.collapsedState.has(key)) {
      collapsedState = this.collapsedState.get(key);
    } else {
      collapsedState = isCollapsible ? this.shouldCollapse(node, depth) : false;
    }
    this.collapsedState.set(key, collapsedState);
    element.dataset.collapsed = collapsedState ? 'true' : 'false';

    const header = document.createElement('div');
    header.className = 'cv-node-header';

    const toggle = document.createElement('button');
    toggle.className = 'cv-toggle';
    if (!isCollapsible) {
      toggle.dataset.hidden = 'true';
    }
    toggle.textContent = collapsedState ? ICON_COLLAPSED : ICON_EXPANDED;

    const keyStack = document.createElement('div');
    keyStack.className = 'cv-key-stack';

    const keyLabel = document.createElement('div');
    keyLabel.className = 'cv-key';
    keyLabel.textContent = node.label ?? '(value)';
    keyStack.appendChild(keyLabel);

    const meta = document.createElement('div');
    meta.className = 'cv-meta';
    meta.textContent = node.type ? node.type : inferType(node);
    keyStack.appendChild(meta);

    const summary = document.createElement('div');
    summary.className = 'cv-summary';
    summary.textContent = buildSummary(node);
    if (!summary.textContent) {
      summary.dataset.hidden = 'true';
    }
    keyStack.appendChild(summary);

    const valueSpan = document.createElement('div');
    valueSpan.className = 'cv-value';

    const updatePreview = () => {
      if (!isCollapsible) return;
      if (collapsedState) {
        const preview = collapsedPreview(node, this.options.previewItems);
        valueSpan.textContent = preview;
        if (preview) {
          delete valueSpan.dataset.hidden;
        } else {
          valueSpan.dataset.hidden = 'true';
        }
      } else {
        valueSpan.textContent = '';
        valueSpan.dataset.hidden = 'true';
      }
    };

    if (isCollapsible) {
      updatePreview();
    } else if (node.value !== undefined) {
      valueSpan.textContent = formatDisplay(node.value, node.type);
      valueSpan.dataset.kind = determineKind(node.value, node.type);
    } else {
      valueSpan.textContent = '';
      valueSpan.dataset.hidden = 'true';
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'cv-copy';
    copyBtn.textContent = 'Copy';
    if (!this.options.showCopy) {
      copyBtn.dataset.hidden = 'true';
    }
    copyBtn.addEventListener('click', () => {
      const payload = node.raw !== undefined ? node.raw : node.value;
      if (payload === undefined) return;
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      navigator.clipboard?.writeText(text).catch(() => {});
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
      }, 1200);
    });

    header.appendChild(toggle);
    header.appendChild(keyStack);
    header.appendChild(valueSpan);
    header.appendChild(copyBtn);

    element.appendChild(header);

    if (isCollapsible) {
      let visibleCount = this.visibleChildrenState.has(key)
        ? this.visibleChildrenState.get(key)
        : computeInitialVisibleChildren(node);
      if (this.globalAction === 'expand') {
        visibleCount = node.children.length;
      } else if (this.globalAction === 'collapse') {
        visibleCount = computeInitialVisibleChildren(node);
      }
      visibleCount = Math.min(visibleCount, node.children.length);
      this.visibleChildrenState.set(key, visibleCount);

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'cv-children';

      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'cv-load-more';

      const renderSlice = () => {
        childrenContainer.innerHTML = '';
        if (!collapsedState) {
          const slice = node.children.slice(0, visibleCount);
          slice.forEach((child, index) => {
            childrenContainer.appendChild(
              this.renderNode(child, depth + 1, `${key}.${index}`)
            );
          });
        }
      };

      const updateLoadMore = () => {
        const remaining = collapsedState
          ? node.children.length - visibleCount
          : node.children.length - visibleCount;
        if (collapsedState || remaining <= 0) {
          loadMoreBtn.style.display = 'none';
        } else {
          loadMoreBtn.style.display = '';
          loadMoreBtn.textContent = `Show next ${Math.min(
            CHILD_BATCH_SIZE,
            remaining
          )} of ${remaining} remaining`;
        }
      };

      loadMoreBtn.addEventListener('click', () => {
        visibleCount = Math.min(
          visibleCount + CHILD_BATCH_SIZE,
          node.children.length
        );
        this.visibleChildrenState.set(key, visibleCount);
        renderSlice();
        updateLoadMore();
      });

      const refreshChildren = () => {
        renderSlice();
        updateLoadMore();
      };

      toggle.addEventListener('click', () => {
        collapsedState = !collapsedState;
        this.collapsedState.set(key, collapsedState);
        element.dataset.collapsed = collapsedState ? 'true' : 'false';
        toggle.textContent = collapsedState ? ICON_COLLAPSED : ICON_EXPANDED;
        updatePreview();
        refreshChildren();
      });

      const observer = new MutationObserver(() => {
        if (element.dataset.collapsed === 'true') {
          loadMoreBtn.style.display = 'none';
        } else {
          refreshChildren();
        }
      });
      observer.observe(element, { attributes: true, attributeFilter: ['data-collapsed'] });

      refreshChildren();

      element.appendChild(childrenContainer);
      element.appendChild(loadMoreBtn);
    }

    return element;
  }

  shouldCollapse(node, depth) {
    const { collapse } = this.options;
    if (!node.children || node.children.length === 0) return false;
    if (depth === 0) return collapse.root ?? true;
    return true;
  }
}

function computeInitialVisibleChildren(node) {
  if (!node.children) return 0;
  if (node.children.length <= LARGE_CHILDREN_THRESHOLD) {
    return node.children.length;
  }
  return LARGE_CHILDREN_THRESHOLD;
}

export function createNodeFromValue(value, metadata = {}) {
  const { label = 'value', type, components } = metadata;
  const node = {
    label,
    type: type || inferTypeFromValue(value),
    raw: value,
  };

  if (Array.isArray(value)) {
    const typeHint = type || inferTypeFromValue(value);
    const isTupleArray =
      typeof typeHint === 'string' &&
      typeHint.startsWith('tuple') &&
      typeHint.endsWith('[]') &&
      Array.isArray(components) &&
      components.length > 0;

    node.children = value.map((entry, index) => {
      if (isTupleArray) {
        return createNodeFromValue(entry, {
          label: `[${index}]`,
          type: typeHint.replace(/\[\]$/, ''),
          components,
        });
      }

      const componentMeta = Array.isArray(components) ? components[index] || {} : {};
      return createNodeFromValue(entry, {
        label: componentMeta?.name ?? `[${index}]`,
        type: componentMeta?.type ?? inferTypeFromValue(entry),
        components: componentMeta?.components,
      });
    });
  } else if (isPlainObject(value) && !isBigNumber(value)) {
    const keys = components?.length
      ? components.map((c, idx) => c?.name ?? `field_${idx}`)
      : Object.keys(value);
    node.children = keys.map((key, index) => {
      const childValue = value[key] !== undefined ? value[key] : value[index];
      const componentMeta = components?.[index] || {};
      return createNodeFromValue(childValue, {
        label: key,
        type: componentMeta?.type ?? inferTypeFromValue(childValue),
        components: componentMeta?.components,
      });
    });
  } else {
    node.value = value;
  }

  return node;
}

function inferType(node) {
  if (node.type) return node.type;
  if (!node.children) return inferTypeFromValue(node.value);
  if (Array.isArray(node.children)) return `array(${node.children.length})`;
  return 'tuple';
}

function inferTypeFromValue(value) {
  if (value === null || value === undefined) return 'unknown';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number' || typeof value === 'bigint') return 'number';
  if (typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)) return 'address';
  if (typeof value === 'string' && value.startsWith('0x')) return 'bytes';
  if (typeof value === 'string') return 'string';
  if (isBigNumber(value)) return 'uint';
  if (isPlainObject(value)) return 'tuple';
  return typeof value;
}

function formatDisplay(value, type) {
  if (value === null || value === undefined) return 'null';

  if (isBigNumber(value)) {
    return value.toString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'string') {
    if (type === 'address') {
      return formatAddress(value);
    }
    return value;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => formatDisplay(item)).join(', ')}]`;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function determineKind(value, type) {
  if (typeof value === 'boolean') return value ? 'bool-true' : 'bool-false';
  if (typeof value === 'number' || typeof value === 'bigint' || isBigNumber(value)) return 'number';
  if (typeof value === 'string') {
    if (type === 'address') return 'address';
    if (type && type.startsWith('bytes')) return 'bytes';
    return 'string';
  }
  return 'string';
}

function buildSummary(node) {
  if (!node.children || node.children.length === 0) {
    return '';
  }

  if (node.type && node.type.includes('[]')) {
    return `${node.children.length} item${node.children.length === 1 ? '' : 's'}`;
  }

  return `${node.children.length} field${node.children.length === 1 ? '' : 's'}`;
}

function collapsedPreview(node, previewItems) {
  if (!node.children || node.children.length === 0) return '';

  const isArrayNode =
    (node.type && node.type.includes('[]')) ||
    Array.isArray(node.raw) ||
    node.children.every((child) => /^\[\d+\]$/.test(child.label || ''));

  if (isArrayNode) {
    const items = node.children.map((child) => {
      if (child.children && child.children.length > 0 && child.value === undefined) {
        return '{…}';
      }
      if (child.value !== undefined) {
        return formatDisplay(child.value, child.type);
      }
      if (child.raw !== undefined) {
        return formatDisplay(child.raw, child.type);
      }
      return '…';
    });
    return `[${items.join(', ')}]`;
  }

  const items = node.children.slice(0, previewItems).map((child) => {
    if (child.children && child.children.length > 0) {
      return '{…}';
    }
    if (child.value !== undefined) {
      return formatDisplay(child.value, child.type);
    }
    return '…';
  });

  const list = items.join(', ');
  const suffixNeeded = node.children.length > previewItems;
  const suffix = suffixNeeded ? `${list.length > 0 ? ', ' : ''}…` : '';
  return `[${list}${suffix}]`;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isBigNumber(value) {
  return value && typeof value === 'object' &&
    (value._isBigNumber === true || value.type === 'BigNumber');
}

function formatAddress(value) {
  if (value === '0x0000000000000000000000000000000000000000') {
    return value;
  }
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value;
  }
  return value;
}

function mergeOptions(custom) {
  return {
    ...DEFAULT_OPTIONS,
    ...custom,
    collapse: {
      ...DEFAULT_OPTIONS.collapse,
      ...(custom.collapse || {}),
    },
  };
}

export default ComplexValueViewer;
