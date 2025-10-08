/*
 * ComplexValueViewerVanilla
 * Lightweight tree renderer for ABI-like data with collapsible nodes.
 * This version is framework-agnostic for usage in static demos (e.g. test-wallet.html).
 */

const DEFAULT_OPTIONS = {
  collapse: {
    root: false,
    depth: 2,
    arrayItems: 6,
    objectKeys: 8,
  },
  previewItems: 3,
  showCopy: true,
};

const ICON_EXPANDED = '▾';
const ICON_COLLAPSED = '▸';

export class ComplexValueViewer {
  constructor(container, node, options = {}) {
    if (!container) {
      throw new Error('ComplexValueViewer requires a container element');
    }

    this.container = container;
    this.options = mergeOptions(options);
    this.node = node || null;

    this.container.classList.add('complex-value-viewer');
    this.render();
  }

  setNode(node) {
    this.node = node;
    this.render();
  }

  collapseAll(collapsed = true) {
    const nodes = this.container.querySelectorAll('.cv-node[data-collapsible="true"]');
    nodes.forEach((nodeEl) => {
      nodeEl.dataset.collapsed = collapsed ? 'true' : 'false';
      const toggle = nodeEl.querySelector('.cv-toggle');
      if (toggle) toggle.textContent = collapsed ? ICON_COLLAPSED : ICON_EXPANDED;
    });
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

    const rootNode = this.renderNode(this.node, 0);
    this.container.appendChild(rootNode);
  }

  createGlobalControls() {
    const buttonRow = document.createElement('div');
    buttonRow.className = 'cv-collapse-all';

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'cv-action-btn';
    collapseBtn.textContent = 'Collapse All';
    collapseBtn.addEventListener('click', () => this.collapseAll(true));

    const expandBtn = document.createElement('button');
    expandBtn.className = 'cv-action-btn';
    expandBtn.textContent = 'Expand All';
    expandBtn.addEventListener('click', () => this.collapseAll(false));

    buttonRow.appendChild(collapseBtn);
    buttonRow.appendChild(expandBtn);
    return buttonRow;
  }

  renderNode(node, depth) {
    const isCollapsible = Array.isArray(node.children) && node.children.length > 0;
    const element = document.createElement('div');
    element.className = 'cv-node';
    element.dataset.depth = String(depth);
    element.dataset.collapsible = isCollapsible ? 'true' : 'false';

    const collapsedDefault = isCollapsible ? this.shouldCollapse(node, depth) : false;
    element.dataset.collapsed = collapsedDefault ? 'true' : 'false';

    const header = document.createElement('div');
    header.className = 'cv-node-header';

    const toggle = document.createElement('button');
    toggle.className = 'cv-toggle';
    if (!isCollapsible) {
      toggle.dataset.hidden = 'true';
    }
    toggle.textContent = collapsedDefault ? ICON_COLLAPSED : ICON_EXPANDED;
    toggle.addEventListener('click', () => {
      if (!isCollapsible) return;
      const collapsed = element.dataset.collapsed === 'true';
      element.dataset.collapsed = collapsed ? 'false' : 'true';
      toggle.textContent = collapsed ? ICON_EXPANDED : ICON_COLLAPSED;
    });

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
    if (isCollapsible) {
      valueSpan.textContent = collapsedDefault
        ? collapsedPreview(node, this.options.previewItems)
        : '';
      if (!valueSpan.textContent) valueSpan.dataset.hidden = 'true';
    } else if (node.value !== undefined) {
      valueSpan.textContent = formatDisplay(node.value, node.type);
      valueSpan.dataset.kind = determineKind(node.value, node.type);
    } else {
      valueSpan.textContent = '';
      valueSpan.dataset.hidden = 'true';
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'cv-copy';
    copyBtn.textContent = '⧉';
    if (!this.options.showCopy) {
      copyBtn.dataset.hidden = 'true';
    }
    copyBtn.addEventListener('click', () => {
      const payload = node.raw !== undefined ? node.raw : node.value;
      if (payload === undefined) return;
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      navigator.clipboard?.writeText(text).catch(() => {});
      copyBtn.textContent = '✓';
      setTimeout(() => {
        copyBtn.textContent = '⧉';
      }, 1200);
    });

    header.appendChild(toggle);
    header.appendChild(keyStack);
    header.appendChild(valueSpan);
    header.appendChild(copyBtn);

    element.appendChild(header);

    if (isCollapsible) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'cv-children';
      node.children.forEach((child) => {
        childrenContainer.appendChild(this.renderNode(child, depth + 1));
      });
      element.appendChild(childrenContainer);
    }

    return element;
  }

  shouldCollapse(node, depth) {
    const { collapse } = this.options;
    if (depth === 0) return collapse.root;
    if (!node.children || node.children.length === 0) return false;

    if (node.type && node.type.includes('[]')) {
      return node.children.length >= collapse.arrayItems;
    }

    if (depth >= collapse.depth) {
      return true;
    }

    if (node.children.length >= collapse.objectKeys) {
      return true;
    }

    return false;
  }
}

export function createNodeFromValue(value, metadata = {}) {
  const { label = 'value', type, components } = metadata;
  const node = {
    label,
    type: type || inferTypeFromValue(value),
    raw: value,
  };

  if (Array.isArray(value)) {
    node.children = value.map((entry, index) => {
      const componentMeta = Array.isArray(components) ? components[index] || components[0] || {} : {};
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
    if (type && type.startsWith('bytes') && value.length > 20) {
      return `${value.slice(0, 10)}…${value.slice(-4)} (${(value.length - 2) / 2} bytes)`;
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

  const items = node.children.slice(0, previewItems).map((child) => {
    if (child.children && child.children.length > 0) {
      return '{…}';
    }
    if (child.value !== undefined) {
      return formatDisplay(child.value, child.type);
    }
    return '…';
  });

  const suffix = node.children.length > previewItems ? '…' : '';
  return `[ ${items.join(', ')}${suffix ? ',' : ''}${suffix} ]`;
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
    return '0x0000…0000';
  }
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
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
