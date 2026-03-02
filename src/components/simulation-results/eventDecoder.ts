import { ethers } from "ethers";
import { COMMON_EVENTS_ABI } from "./constants";

// Lazy-init common events interface
let commonEventsIface: ethers.utils.Interface | null = null;
function getCommonEventsInterface(): ethers.utils.Interface {
  if (!commonEventsIface) {
    commonEventsIface = new ethers.utils.Interface(COMMON_EVENTS_ABI);
  }
  return commonEventsIface;
}

// Format event argument values for display
export function formatEventValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value._isBigNumber) {
    return value.toString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return '[' + value.map(formatEventValue).join(', ') + ']';
  }
  return String(value);
}

// Interface cache to avoid re-creating ethers Interface objects
const interfaceCache = new Map<string, ethers.utils.Interface>();

function getOrCreateInterface(abi: any[]): ethers.utils.Interface | null {
  const key = JSON.stringify(abi);
  let iface = interfaceCache.get(key);
  if (!iface) {
    try {
      iface = new ethers.utils.Interface(abi);
      interfaceCache.set(key, iface);
      if (interfaceCache.size > 100) {
        const first = interfaceCache.keys().next().value;
        if (first) interfaceCache.delete(first);
      }
    } catch { return null; }
  }
  return iface;
}

// Decode a raw event from topics and data
// Accepts optional contract ABI for custom event decoding (Diamond facets, etc.)
export function decodeRawEvent(
  event: any,
  contractAbis?: any[] | null
): { name: string; signature?: string; args?: any[] } | null {
  if (!event) return null;

  let rawData: string | undefined;
  let rawTopics: string[] | undefined;

  if (typeof event.data === 'object' && event.data !== null && event.data.topics) {
    rawData = event.data.data;
    rawTopics = event.data.topics;
  }
  else if (typeof event.data === 'string' && event.data.startsWith('{')) {
    try {
      const parsed = JSON.parse(event.data);
      rawData = parsed.data;
      rawTopics = parsed.topics;
    } catch {
      // Not JSON, use as-is
    }
  }

  if (!rawTopics && event.topics) {
    rawTopics = event.topics;
  }
  if (!rawData && event.rawData) {
    rawData = event.rawData;
  }

  if (!rawTopics || rawTopics.length === 0) return null;

  const topicHex = rawTopics.map((t: any) => {
    const hex = String(t).replace(/^0x/, '');
    return '0x' + hex.padStart(64, '0');
  });

  const interfacesToTry: ethers.utils.Interface[] = [];

  if (contractAbis && contractAbis.length > 0) {
    for (const abi of contractAbis) {
      if (abi && Array.isArray(abi) && abi.length > 0) {
        const iface = getOrCreateInterface(abi);
        if (iface) interfacesToTry.push(iface);
      }
    }
  }

  interfacesToTry.push(getCommonEventsInterface());

  for (const iface of interfacesToTry) {
    try {
      const parsed = iface.parseLog({ topics: topicHex, data: rawData || '0x' });
      return {
        name: parsed.name,
        signature: parsed.eventFragment.format('sighash'),
        args: parsed.args.map((a: any, i: number) => ({
          name: parsed.eventFragment.inputs[i]?.name || `arg${i}`,
          value: formatEventValue(a),
        })),
      };
    } catch {
      // Try next interface
    }
  }

  for (const iface of interfacesToTry) {
    try {
      const fragment = iface.getEvent(topicHex[0]);
      if (fragment) {
        return {
          name: fragment.name,
          signature: fragment.format('sighash'),
        };
      }
    } catch {
      // Continue to next
    }
  }

  return null;
}
