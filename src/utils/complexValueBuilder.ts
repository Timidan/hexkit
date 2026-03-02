export type ComplexValueChild = {
  label?: string;
  name?: string;
  type?: string;
  components?: ComplexValueChild[];
};

export interface ComplexValueMetadata extends ComplexValueChild {}

export interface ComplexValueNode {
  label: string;
  type?: string;
  value?: any;
  raw?: any;
  children?: ComplexValueNode[];
}

export interface CollapseConfig {
  root?: boolean;
  depth?: number;
  arrayItems?: number;
  objectKeys?: number;
}

export interface ViewerOptions {
  collapse?: CollapseConfig;
  previewItems?: number;
}

export interface NormalizedViewerOptions {
  collapse: {
    root: boolean;
    depth: number;
    arrayItems: number;
    objectKeys: number;
  };
  previewItems: number;
}

const DEFAULT_METADATA: ComplexValueMetadata = {
  label: 'value',
  type: 'tuple',
  components: [],
};

export const DEFAULT_OPTIONS: NormalizedViewerOptions = {
  collapse: {
    root: true,
    depth: 2,
    arrayItems: 6,
    objectKeys: 8,
  },
  previewItems: 3,
};

export function createNodeFromValue(
  value: any,
  metadata: ComplexValueMetadata = DEFAULT_METADATA
): ComplexValueNode {
  const normalizedMeta = metadata ?? DEFAULT_METADATA;
  const label = normalizedMeta.label ?? 'value';
  const type = normalizedMeta.type ?? inferTypeFromValue(value);

  if (Array.isArray(value)) {
    const metaType = normalizedMeta.type ?? '';
    const isTupleArray =
      metaType.startsWith('tuple') &&
      metaType.endsWith('[]') &&
      Array.isArray(normalizedMeta.components) &&
      normalizedMeta.components.length > 0;

    const children = value.map((entry, index) => {
      if (isTupleArray) {
        return createNodeFromValue(entry, {
          label: `[${index}]`,
          type: metaType.replace(/\[\]$/, ''),
          components: normalizedMeta.components,
        });
      }

      const componentMeta = selectComponentMeta(normalizedMeta, index);
      return createNodeFromValue(entry, {
        ...componentMeta,
        label: componentMeta?.name ?? componentMeta?.label ?? `[${index}]`,
      });
    });

    return {
      label,
      type,
      children,
      raw: value,
    };
  }

  if (isPlainObject(value)) {
    const keys = computeObjectKeys(value, normalizedMeta);
    const children = keys.map((key, index) => {
      const componentMeta = selectComponentMeta(normalizedMeta, index, key);
      const childValue = value[key] ?? value[index];

      return createNodeFromValue(childValue, {
        ...componentMeta,
        label: componentMeta?.name ?? componentMeta?.label ?? key,
      });
    });

    return {
      label,
      type: type ?? 'tuple',
      children,
      raw: value,
    };
  }

  const normalizedValue = normalizePrimitive(value, type);

  return {
    label,
    type: type ?? inferTypeFromValue(value),
    value: normalizedValue,
    raw: value,
  };
}

export function shouldCollapseNode(
  node: ComplexValueNode,
  depth: number,
  options: NormalizedViewerOptions = DEFAULT_OPTIONS
): boolean {
  const config = options.collapse;
  if (!node.children || node.children.length === 0) {
    return false;
  }

  if (depth === 0) {
    return config.root ?? true;
  }

  return true;
}

export function collapsedPreview(
  node: ComplexValueNode,
  previewItems: number = DEFAULT_OPTIONS.previewItems
): string {
  if (!node.children || node.children.length === 0) {
    return '';
  }

  const isArrayNode =
    (node.type && node.type.includes('[]')) ||
    Array.isArray(node.raw) ||
    node.children.every((child) => /^\[\d+\]$/.test(child.label ?? ''));

  if (isArrayNode) {
    const items = node.children.map((child) => {
      if (child.children && child.children.length > 0 && child.value === undefined) {
        return '{…}';
      }
      if (child.value !== undefined) {
        return formatDisplayValue(child.value, child.type);
      }
      if (child.raw !== undefined) {
        return formatDisplayValue(child.raw, child.type);
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
      return formatDisplayValue(child.value, child.type);
    }
    return '…';
  });

  const suffixNeeded = node.children.length > previewItems;
  const compactItems = items.join(', ');
  const suffix = suffixNeeded ? `${compactItems.length > 0 ? ', ' : ''}…` : '';
  return `[${compactItems}${suffix}]`;
}

export function buildSummary(node: ComplexValueNode): string {
  if (!node.children || node.children.length === 0) {
    return '';
  }

  if (node.type && node.type.includes('[]')) {
    return `${node.children.length} item${node.children.length === 1 ? '' : 's'}`;
  }

  return `${node.children.length} field${node.children.length === 1 ? '' : 's'}`;
}

export function formatDisplayValue(value: any, type?: string): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'string') {
    if (type === 'address') {
      return value;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => formatDisplayValue(item)).join(', ')}]`;
  }

  if (isPlainObject(value)) {
    return JSON.stringify(value);
  }

  return String(value);
}

export function determineValueKind(value: any, type?: string): string {
  if (typeof value === 'boolean') {
    return value ? 'bool-true' : 'bool-false';
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return 'number';
  }

  if (typeof value === 'string') {
    if (type === 'address') {
      return 'address';
    }
    if (type && type.startsWith('bytes')) {
      return 'bytes';
    }
    return 'string';
  }

  return 'string';
}

export function serializeNode(node: ComplexValueNode): string {
  if (node.raw !== undefined) {
    if (typeof node.raw === 'string') {
      return node.raw;
    }
    try {
      return JSON.stringify(node.raw, null, 2);
    } catch (error) {
      return String(node.raw);
    }
  }

  if (node.value !== undefined) {
    if (typeof node.value === 'string') {
      return node.value;
    }
    try {
      return JSON.stringify(node.value, null, 2);
    } catch (error) {
      return String(node.value);
    }
  }

  if (node.children) {
    try {
      return JSON.stringify(
        node.children.map((child) => JSON.parse(serializeNode(child))),
        null,
        2
      );
    } catch (error) {
      return node.children
        .map((child) => serializeNode(child))
        .join('\n');
    }
  }

  return '';
}

function selectComponentMeta(
  metadata: ComplexValueMetadata,
  index: number,
  key?: string
): ComplexValueMetadata | undefined {
  if (metadata.components && metadata.components.length > 0) {
    const directByName = key
      ? metadata.components.find((component) => component.name === key)
      : undefined;
    if (directByName) {
      return directByName;
    }
    return metadata.components[index] ?? metadata.components[0];
  }
  return undefined;
}

function computeObjectKeys(
  value: Record<string, any>,
  metadata: ComplexValueMetadata
): string[] {
  if (metadata.components && metadata.components.length > 0) {
    const keysFromComponents = metadata.components.map(
      (component, index) => component.name ?? component.label ?? `field_${index}`
    );

    // Ensure numeric indexes are included when result is array-like
    const numericKeys = Object.keys(value).filter((key) => /^\d+$/.test(key));
    const merged = Array.from(new Set([...keysFromComponents, ...numericKeys]));
    return merged;
  }

  return Object.keys(value);
}

function normalizePrimitive(value: any, type?: string): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (isBigNumberLike(value)) {
    try {
      return value.toString();
    } catch (error) {
      return String(value);
    }
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }

  return value;
}

function inferTypeFromValue(value: any): string {
  if (value === null || value === undefined) {
    return 'unknown';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'boolean') {
    return 'bool';
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return 'uint';
  }

  if (typeof value === 'string') {
    if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
      return 'address';
    }
    if (value.startsWith('0x')) {
      return 'bytes';
    }
    return 'string';
  }

  if (isPlainObject(value)) {
    return 'tuple';
  }

  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).constructor === Object
  );
}

function isBigNumberLike(value: any): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value._isBigNumber === true ||
        typeof value.toHexString === 'function' ||
        typeof value.toString === 'function')
  );
}

