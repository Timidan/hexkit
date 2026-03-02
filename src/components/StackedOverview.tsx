import React from 'react';
import '../styles/StackedOverview.css';
import {
  parseSolidityType,
  stripArraySuffix,
  isTupleType,
  type ParsedSolidityParameter
} from '../utils/solidityTypes';

export interface ParameterDisplayEntry {
  name: string;
  type: string;
  value: any;
  components?: ParsedSolidityParameter[] | null;
}

type SummaryChip = {
  text: string;
  tone?: 'default' | 'warning' | 'success';
};

export interface StackedOverviewProps {
  parameterData: ParameterDisplayEntry[];
}

const arrayElementType = (type?: string): string => {
  if (!type) return 'unknown';
  const base = stripArraySuffix(type);
  return base || 'unknown';
};

const isArrayType = (type?: string): boolean => {
  if (!type) return false;
  return type.endsWith('[]') || /\[\d+\]$/.test(type);
};

const mergeTypeStructure = (
  type: string,
  existing?: ParsedSolidityParameter[] | null
): { normalizedType: string; components?: ParsedSolidityParameter[] } => {
  const parsed = parseSolidityType(type || '');
  const normalizedType = parsed.type || type || 'unknown';
  const components =
    existing && existing.length
      ? existing
      : parsed.components && parsed.components.length
      ? parsed.components
      : undefined;
  return { normalizedType, components };
};

const formatValue = (value: any): string => {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[${value.map((item) => formatValue(item)).join(', ')}]`;
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  if (value === null || value === undefined) {
    return '—';
  }

  return String(value);
};

const ChevronIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    role="img"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M6 4l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const getFieldValue = (entry: any, index: number, component?: ParsedSolidityParameter): any => {
  if (Array.isArray(entry)) {
    return entry[index];
  }

  if (entry && typeof entry === 'object') {
    if (component?.name && Object.prototype.hasOwnProperty.call(entry, component.name)) {
      return entry[component.name];
    }
    if (Object.prototype.hasOwnProperty.call(entry, index)) {
      return entry[index];
    }
  }

  return undefined;
};

const renderTupleBody = (
  entry: any,
  components: ParsedSolidityParameter[] | null | undefined,
  baseKey: string
): React.ReactNode => {
  // Handle primitive values (strings, numbers, booleans, bigints)
  if (entry === null || entry === undefined || typeof entry !== 'object') {
    return (
      <div className="stacked-kv-list">
        <div className="stacked-kv-item" key={`${baseKey}-value`}>
          <span className="stacked-kv-label">
            <span>Value</span>
          </span>
          <p className="stacked-kv-value">{formatValue(entry)}</p>
        </div>
      </div>
    );
  }

  if (!components || components.length === 0) {
    return (
      <div className="stacked-kv-list">
        {Array.isArray(entry)
          ? entry.map((value, index) => (
              <div className="stacked-kv-item" key={`${baseKey}-${index}`}>
                <span className="stacked-kv-label">
                  <span>{`Field ${index + 1}`}</span>
                </span>
                <p className="stacked-kv-value">{formatValue(value)}</p>
              </div>
            ))
          : Object.entries(entry ?? {}).map(([key, value]) => (
              <div className="stacked-kv-item" key={`${baseKey}-${key}`}>
                <span className="stacked-kv-label">
                  <span>{key}</span>
                </span>
                <p className="stacked-kv-value">{formatValue(value)}</p>
              </div>
            ))}
      </div>
    );
  }

  return (
    <div className="stacked-kv-list">
      {components.map((component, componentIndex) => {
        const value = getFieldValue(entry, componentIndex, component);
        const label = component.name && component.name.length > 0
          ? component.name
          : `Field ${componentIndex + 1}`;

        return (
          <div className="stacked-kv-item" key={`${baseKey}-${componentIndex}`}>
            <span className="stacked-kv-label">
              <span>{label}</span>
              <span className="stacked-type-chip">{component.type}</span>
            </span>
            <p className="stacked-kv-value">{formatValue(value)}</p>
          </div>
        );
      })}
    </div>
  );
};

const StackedOverview: React.FC<StackedOverviewProps> = ({ parameterData }) => {
  return (
    <div className="stacked-overview">
      <section className="stacked-overview-panel" aria-labelledby="stacked-parameters-heading">
        <p id="stacked-parameters-heading" className="stacked-section-heading">
          Parameters
        </p>

        {parameterData.length === 0 ? (
          <p className="stacked-empty-state">No decoded parameters were found for this call.</p>
        ) : (
          <div className="stacked-card-stack">
            {parameterData.map((param, paramIndex) => {
              const isGeneric = param.name.startsWith('param_');
              const { normalizedType, components } = mergeTypeStructure(
                param.type || 'unknown',
                param.components ?? undefined
              );
              const displayType = normalizedType || param.type || 'unknown';
              const hasStructuredChildren =
                Array.isArray(param.value) &&
                param.value.some(
                  (entry) =>
                    Array.isArray(entry) ||
                    (entry && typeof entry === 'object' && !entry._isBigNumber)
                );
              const isStructuredArray =
                Array.isArray(param.value) &&
                (isTupleType(displayType) ||
                  Boolean(components?.length) ||
                  hasStructuredChildren);
              const elementType = Array.isArray(param.value)
                ? arrayElementType(displayType)
                : displayType;
              const chips: SummaryChip[] = [];

              // Only show chip for generated/generic parameter names
              if (isGeneric) {
                chips.push({ text: 'Generated', tone: 'warning' });
              }

              return (
                <article className="stacked-card" key={`${param.name}-${paramIndex}`}>
                  <div className="stacked-card-header">
                    <span className="stacked-param-title">{param.name || `Parameter ${paramIndex + 1}`}</span>
                    <span className="stacked-type-chip">{displayType || 'unknown'}</span>
                    <div className="stacked-meta-row">
                      {chips.map((chip, chipIndex) => (
                        <span
                          key={`${param.name}-chip-${chipIndex}`}
                          className={[
                            'stacked-chip',
                            chip.tone === 'warning' ? 'stacked-chip--warning' : '',
                            chip.tone === 'success' ? 'stacked-chip--success' : ''
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {chip.text}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="stacked-card-body">
                    {Array.isArray(param.value) ? (
                      // Type "tuple" (not "tuple[]") with array value = single tuple's fields
                      isTupleType(displayType) && !isArrayType(displayType) ? (
                        renderTupleBody(
                          param.value,
                          components ?? undefined,
                          `${param.name}-tuple`
                        )
                      ) : isStructuredArray ? (
                        // Type "tuple[]" or actual structured array = multiple tuples
                        param.value.map((entry, entryIndex) => (
                          <details
                            key={`${param.name}-${entryIndex}`}
                            className="stacked-tuple"
                          >
                            <summary>
                              <ChevronIcon className="stacked-chevron" />
                              <span>{`Tuple ${entryIndex + 1}`}</span>
                              <span className="stacked-type-chip">{elementType || 'tuple'}</span>
                            </summary>
                            <div className="stacked-tuple-body">
                              {renderTupleBody(
                                entry,
                                components ?? undefined,
                                `${param.name}-${entryIndex}`
                              )}
                            </div>
                          </details>
                        ))
                      ) : (
                        // Simple array of primitives
                        <div className="stacked-kv-list">
                          {param.value.map((entry, entryIndex) => (
                            <div
                              className="stacked-kv-item"
                              key={`${param.name}-${entryIndex}`}
                            >
                              <span className="stacked-kv-label">
                                <span>{`Item ${entryIndex}`}</span>
                                <span className="stacked-type-chip">{elementType}</span>
                              </span>
                              <p className="stacked-kv-value">{formatValue(entry)}</p>
                            </div>
                          ))}
                        </div>
                      )
                    ) : param && typeof param.value === 'object' ? (
                      isTupleType(displayType) ? (
                        renderTupleBody(
                          param.value,
                          components ?? undefined,
                          `${param.name}-tuple`
                        )
                      ) : (
                        <div className="stacked-kv-list">
                          {Object.entries(param.value ?? {}).map(([key, value]) => (
                            <div className="stacked-kv-item" key={`${param.name}-${key}`}>
                              <span className="stacked-kv-label">
                                <span>{key}</span>
                              </span>
                              <p className="stacked-kv-value">{formatValue(value)}</p>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <p className="stacked-kv-value" style={{ padding: '8px 12px' }}>{formatValue(param.value)}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default StackedOverview;
