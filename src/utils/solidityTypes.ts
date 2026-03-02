export interface ParsedSolidityParameter {
  name?: string;
  type: string;
  components?: ParsedSolidityParameter[];
}

const splitTopLevelParameters = (source: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      current += char;
      continue;
    }
    if (char === ',' && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
};

const splitTypeAndName = (segment: string): { type: string; name?: string } => {
  const trimmed = segment.trim();
  if (!trimmed) {
    return { type: trimmed };
  }

  let depth = 0;
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const char = trimmed[i];
    if (char === ')') {
      depth += 1;
      continue;
    }
    if (char === '(') {
      depth -= 1;
      continue;
    }
    if (char === ' ' && depth === 0) {
      const potentialType = trimmed.slice(0, i).trim();
      const potentialName = trimmed.slice(i + 1).trim();
      if (potentialType) {
        return {
          type: potentialType,
          name: potentialName || undefined
        };
      }
      break;
    }
  }

  return { type: trimmed };
};

const canonicalizeType = (rawType: string): { type: string; components?: ParsedSolidityParameter[] } => {
  const trimmed = rawType.trim();
  if (!trimmed) {
    return { type: trimmed };
  }

  const tupleMatch = trimmed.match(/^\((.*)\)(.*)$/s);
  if (tupleMatch) {
    const inner = tupleMatch[1];
    const suffix = tupleMatch[2] ?? '';
    const componentSegments = splitTopLevelParameters(inner);
    const components = componentSegments.map((segment) => {
      const { type, name } = splitTypeAndName(segment);
      const parsed = canonicalizeType(type);
      return {
        name,
        type: parsed.type,
        components: parsed.components
      };
    });
    return {
      type: `tuple${suffix}`,
      components
    };
  }

  return { type: trimmed };
};

export const parseSolidityType = (type: string): { type: string; components?: ParsedSolidityParameter[] } =>
  canonicalizeType(type);

const parseParameterSegment = (segment: string): ParsedSolidityParameter => {
  const { type, name } = splitTypeAndName(segment);
  const parsed = parseSolidityType(type);
  return {
    name,
    type: parsed.type,
    components: parsed.components
  };
};

export const parseFunctionSignatureParameters = (signature: string): ParsedSolidityParameter[] => {
  if (!signature) return [];
  const match = signature.match(/\((.*)\)/s);
  if (!match) return [];

  const inner = match[1];
  if (!inner.trim()) return [];

  const segments = splitTopLevelParameters(inner);
  return segments.map(parseParameterSegment);
};

export const stripArraySuffix = (type: string): string => {
  let base = type.trim();
  while (base.endsWith(']')) {
    const openIndex = base.lastIndexOf('[');
    if (openIndex === -1) break;
    base = base.slice(0, openIndex);
  }
  return base || type;
};

export const isTupleType = (type: string): boolean => stripArraySuffix(type) === 'tuple';
