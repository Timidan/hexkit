/**
 * Event/log decoding utilities
 */

import { ethers } from "ethers";
import { formatDisplayVal } from "./formatting";
import { getCommonEventsInterface } from "./commonAbis";

export function parseLogStack(opName: string | undefined, stackVals: any) {
  if (!opName || !opName.startsWith("LOG")) return null;
  const st = Array.isArray(stackVals) ? stackVals : [];
  const topicCount = Number(opName.replace("LOG", "")) || 0;
  if (st.length < topicCount + 2) return null;
  const size = st[st.length - 1];
  const offset = st[st.length - 2];
  const topicsRaw = st.slice(st.length - (topicCount + 2), st.length - 2);
  const topics = topicsRaw.slice().reverse();
  return { offset, size, topics };
}

export function decodeLogWithFallback(
  logInfo: any,
  iface: ethers.utils.Interface | null,
  memory: any,
  callEvents: any[]
) {
  if (!logInfo) return null;

  // Build list of interfaces to try: provided iface first, then common events fallback
  const interfacesToTry: ethers.utils.Interface[] = [];
  if (iface) interfacesToTry.push(iface);
  interfacesToTry.push(getCommonEventsInterface());
  const topicHex = (logInfo.topics || []).map((t: any) => {
    const hex = String(t).replace(/^0x/, "");
    return "0x" + hex.padStart(64, "0");
  });
  if (!topicHex.length) return null;
  const memArr = Array.isArray(memory) ? memory : [];
  const off = Number(BigInt(logInfo.offset || 0));
  const len = Number(BigInt(logInfo.size || 0));
  const start = Math.max(0, off);
  const end = Math.max(start, Math.min(memArr.length, start + len));
  const truncatedMemory = start + len > memArr.length;
  const slice = memArr.slice(start, end);
  const dataHex =
    "0x" +
    slice
      .map((b: any) => {
        const n = Number(b) & 0xff;
        return n.toString(16).padStart(2, "0");
      })
      .join("");
  const eventsArr = Array.isArray(callEvents) ? callEvents : [];

  // Try each interface in order
  for (const currentIface of interfacesToTry) {
    // First, try to match against call events from EDB
    for (const ev of eventsArr) {
      if (
        !ev ||
        !Array.isArray(ev.topics) ||
        ev.topics.length !== topicHex.length
      )
        continue;
      const tMatch = ev.topics.every(
        (t: any, i: number) =>
          String(t).toLowerCase() === topicHex[i].toLowerCase()
      );
      if (!tMatch) continue;
      try {
        const parsed = currentIface.parseLog({ topics: ev.topics, data: ev.data });
        return {
          name: parsed.name,
          args: parsed.args.map((a: any, i: number) => ({
            name: parsed.eventFragment.inputs[i].name || i,
            value: formatDisplayVal(a),
          })),
          source: currentIface === iface ? "call-event" : "common-event",
          truncated: false,
        };
      } catch {}
    }

    // Then try to decode from memory/stack data
    try {
      const parsed = currentIface.parseLog({ topics: topicHex, data: dataHex });
      return {
        name: parsed.name,
        args: parsed.args.map((a: any, i: number) => ({
          name: parsed.eventFragment.inputs[i].name || i,
          value: formatDisplayVal(a),
        })),
        source: currentIface === iface ? "abi" : "common-abi",
        truncated: truncatedMemory,
      };
    } catch {}
  }

  // Last resort: try to get event fragment by topic hash from any interface
  let fragment: any = null;
  for (const currentIface of interfacesToTry) {
    try {
      fragment = currentIface.getEvent(topicHex[0]);
      if (fragment) break;
    } catch {
      // Continue to next interface
    }
  }
  if (!fragment) return null;
  const inputs = fragment.inputs || [];
  const indexedInputs = inputs.filter((i: any) => i.indexed);
  const nonIndexedInputs = inputs.filter((i: any) => !i.indexed);
  const coder = ethers.utils.defaultAbiCoder;
  const args: any[] = [];
  indexedInputs.forEach((inp: any, i: number) => {
    const topic = topicHex[i + 1];
    let val: any = topic;
    let origin = "topic";
    if (topic && inp && inp.type) {
      const lower = inp.type.toLowerCase();
      const isDynamic =
        (lower.startsWith("bytes") && lower !== "bytes32") ||
        lower === "string";
      if (!isDynamic) {
        try {
          val = coder.decode([inp.type], topicHex[i + 1])[0];
          origin = "topic-decoded";
        } catch {
          val = topic;
        }
      }
    }
    args.push({ name: inp?.name || `arg${i}`, value: val, origin });
  });
  let truncatedData = false;
  if (nonIndexedInputs.length) {
    const minBytes = nonIndexedInputs.length * 32;
    truncatedData =
      truncatedMemory || dataHex.length < 2 + Math.max(minBytes * 2, 0);
    try {
      const decoded = coder.decode(
        nonIndexedInputs.map((i: any) => i.type),
        dataHex
      );
      nonIndexedInputs.forEach((inp: any, idx: number) => {
        const val = decoded[idx];
        args.push({
          name: inp?.name || `arg${indexedInputs.length + idx}`,
          value: val?.toString?.() ?? String(val),
          origin: "data",
        });
      });
    } catch {
      nonIndexedInputs.forEach((inp: any, idx: number) => {
        args.push({
          name: inp?.name || `arg${indexedInputs.length + idx}`,
          value: truncatedData ? "[truncated]" : dataHex,
          origin: "data",
        });
      });
    }
  }
  return {
    name: fragment.name || "event",
    args,
    source: "topic-fallback",
    truncated: truncatedMemory || truncatedData,
  };
}
