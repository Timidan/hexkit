import React from "react";
import { EventCard } from "./EventCard";
import { decodeRawEvent } from "./eventDecoder";
import { shortenAddress } from "../shared/AddressDisplay";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { SimulationResult } from "../../types/transaction";

interface EventsTabProps {
  result: SimulationResult;
  artifacts: any;
  contractContext: any;
  decodedTrace: any;
  lookedUpEventNames: Record<string, string>;
  eventNameFilter: string;
  setEventNameFilter: (v: string) => void;
  eventContractFilter: string;
  setEventContractFilter: (v: string) => void;
}

export const EventsTab: React.FC<EventsTabProps> = ({
  result,
  artifacts,
  contractContext,
  decodedTrace,
  lookedUpEventNames,
  eventNameFilter,
  setEventNameFilter,
  eventContractFilter,
  setEventContractFilter,
}) => {
  const proxyAddress = contractContext?.address?.toLowerCase() || undefined;
  const isAddress = (value: string | undefined): boolean =>
    !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
  const toTraceId = (value: unknown): number | undefined => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  const resolveTraceId = (row: any): number | undefined => {
    if (typeof row?.traceId === "number") return row.traceId;
    if (Array.isArray(row?.frame_id) && row.frame_id.length > 0) {
      return toTraceId(row.frame_id[0]);
    }
    return undefined;
  };
  const firstAddress = (...values: Array<string | undefined>) =>
    values.find((value) => typeof value === "string" && isAddress(value));

  const traceMetaByTraceId = new Map<
    number,
    {
      targetAddress?: string;
      codeAddress?: string;
      callType?: string;
      targetContractName?: string;
      codeContractName?: string;
    }
  >();
  if (decodedTrace?.rows && Array.isArray(decodedTrace.rows)) {
    decodedTrace.rows.forEach((row: any) => {
      const traceId = resolveTraceId(row);
      if (traceId === undefined || !row?.entryMeta) return;
      traceMetaByTraceId.set(traceId, {
        targetAddress: row.entryMeta.target,
        codeAddress: row.entryMeta.codeAddress,
        callType: row.entryMeta.callType,
        targetContractName: row.entryMeta.targetContractName,
        codeContractName: row.entryMeta.codeContractName,
      });
    });
  }

  const contractNameByAddress = new Map<string, string>();
  const addContractName = (address: string | undefined, name: string | undefined) => {
    if (!address || !name || !isAddress(address) || isAddress(name)) return;
    const normalized = address.toLowerCase();
    if (!contractNameByAddress.has(normalized)) {
      contractNameByAddress.set(normalized, name);
    }
  };
  addContractName(contractContext?.address, contractContext?.name);
  if (Array.isArray(contractContext?.diamondFacets)) {
    contractContext.diamondFacets.forEach((facet: any) => {
      addContractName(facet?.address, facet?.name);
    });
  }
  if (Array.isArray((result as any)?.contracts)) {
    (result as any).contracts.forEach((contract: any) => {
      addContractName(contract?.address, contract?.name);
    });
  }
  traceMetaByTraceId.forEach((meta) => {
    addContractName(meta.targetAddress, meta.targetContractName);
    addContractName(meta.codeAddress, meta.codeContractName);
  });
  if (Array.isArray(artifacts?.events)) {
    artifacts.events.forEach((event: any) => {
      addContractName(event?.address, event?.contractName || event?.name);
    });
  }

  // Extract events from decoded trace rows (LOG opcodes with decodedLog)
  const traceEvents: any[] = [];
  if (decodedTrace?.rows) {
    decodedTrace.rows.forEach((row: any) => {
      if (row.name?.startsWith("LOG") && row.decodedLog) {
        const rawTopics = (row.logInfo?.topics || []).map((t: any) => {
          const hex = String(t).replace(/^0x/, "");
          return "0x" + hex.padStart(64, "0");
        });

        let rawData = "";
        if (row.logInfo && row.memory) {
          const memArr = Array.isArray(row.memory) ? row.memory : [];
          const off = Number(BigInt(row.logInfo.offset || 0));
          const len = Number(BigInt(row.logInfo.size || 0));
          const start = Math.max(0, off);
          const end = Math.min(memArr.length, start + len);
          const slice = memArr.slice(start, end);
          rawData =
            "0x" +
            slice
              .map((b: any) => {
                const n = Number(b) & 0xff;
                return n.toString(16).padStart(2, "0");
              })
              .join("");
        }

        const traceId = resolveTraceId(row);
        const frameMeta = traceId !== undefined ? traceMetaByTraceId.get(traceId) : undefined;
        const callType = frameMeta?.callType || row.entryMeta?.callType;
        const eventAddress =
          firstAddress(
            row.logInfo?.address,
            row.targetAddress,
            row.entryMeta?.target,
            frameMeta?.targetAddress,
            row.bytecodeAddress,
            row.entryMeta?.codeAddress,
            frameMeta?.codeAddress,
            contractContext?.address,
          ) || contractContext?.address;
        const normalizedEventAddress = eventAddress?.toLowerCase();
        const eventContractName =
          row.contractName ||
          (normalizedEventAddress ? contractNameByAddress.get(normalizedEventAddress) : undefined) ||
          (normalizedEventAddress && proxyAddress && normalizedEventAddress === proxyAddress
            ? contractContext?.name
            : undefined) ||
          (callType?.toUpperCase().includes("DELEGATE")
            ? frameMeta?.codeContractName || frameMeta?.targetContractName
            : frameMeta?.targetContractName || frameMeta?.codeContractName);

        traceEvents.push({
          eventName: row.decodedLog.name || "Event",
          eventArgs: row.decodedLog.args,
          address: eventAddress,
          logInfo: row.logInfo,
          contractName: eventContractName,
          source: row.decodedLog.source,
          topics: rawTopics,
          rawData: rawData,
        });
      }
    });
  }

  const sourceEvents =
    traceEvents.length > 0 ? traceEvents : artifacts?.events || [];

  // Collect all ABIs for fallback decoding
  const allAbis: any[] = [];
  if (contractContext?.abi) {
    allAbis.push(contractContext.abi);
  }
  if (contractContext?.diamondFacets) {
    contractContext.diamondFacets.forEach((facet: any) => {
      if (facet.abi) {
        allAbis.push(facet.abi);
      }
    });
  }

  // Process events
  const processedEvents = sourceEvents.map((event: any, index: number) => {
    let eventName = event.eventName;
    let eventArgs = event.eventArgs;

    if (!eventName || eventName === "Anonymous Event") {
      const decoded = decodeRawEvent(event, allAbis);
      if (decoded?.name) {
        eventName = decoded.name;
        eventArgs = decoded.args;
      }
      if (!eventName || eventName === "Anonymous Event") {
        let topic0: string | null = null;
        if (event.data?.topics?.[0]) {
          topic0 =
            "0x" +
            String(event.data.topics[0]).replace(/^0x/, "").padStart(64, "0");
        } else if (event.topics?.[0]) {
          topic0 =
            "0x" + String(event.topics[0]).replace(/^0x/, "").padStart(64, "0");
        } else if (event.logInfo?.topics?.[0]) {
          topic0 =
            "0x" +
            String(event.logInfo.topics[0])
              .replace(/^0x/, "")
              .padStart(64, "0");
        }
        if (topic0 && lookedUpEventNames[topic0]) {
          eventName = lookedUpEventNames[topic0];
        }
      }
    }

    const displayAddress =
      firstAddress(
        event.address,
        event.data?.address,
        event.logInfo?.address,
        event.entryMeta?.target,
        event.entryMeta?.codeAddress,
        contractContext?.address,
      ) || contractContext?.address;
    const normalizedDisplayAddress = displayAddress?.toLowerCase();
    const displayContractName =
      event.contractName ||
      (normalizedDisplayAddress ? contractNameByAddress.get(normalizedDisplayAddress) : undefined) ||
      (normalizedDisplayAddress && proxyAddress && normalizedDisplayAddress === proxyAddress
        ? contractContext?.name
        : undefined) ||
      "Unknown Contract";

    return {
      ...event,
      index,
      eventName: eventName || event.name || "Anonymous Event",
      eventSignature: event.signature,
      eventArgs: eventArgs || event.decoded,
      address: displayAddress,
      contractName: displayContractName,
    };
  });

  const uniqueEventNames = [
    ...new Set(processedEvents.map((e: any) => e.eventName)),
  ].sort();
  const uniqueContracts = [
    ...new Set(processedEvents.map((e: any) => e.address).filter(Boolean)),
  ] as string[];

  const filteredEvents = processedEvents.filter((event: any) => {
    if (eventNameFilter && event.eventName !== eventNameFilter) return false;
    if (
      eventContractFilter &&
      event.address?.toLowerCase() !== eventContractFilter.toLowerCase()
    )
      return false;
    return true;
  });

  const contractDisplayMap: Record<string, string> = {};
  uniqueContracts.forEach((addr) => {
    const matchingEvent = processedEvents.find((e: any) => e.address === addr);
    const name = matchingEvent?.contractName || "Unknown";
    contractDisplayMap[addr] = `${name} (${shortenAddress(addr)})`;
  });

  return (
    <section className="sim-panel">
      {/* Header with count */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ margin: 0 }}>Events</h2>
        {processedEvents.length > 0 && (
          <span
            style={{
              padding: "4px 12px",
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "4px",
              fontSize: "0.875rem",
              color: "#ffffff",
            }}
          >
            {eventNameFilter || eventContractFilter
              ? `${filteredEvents.length} of ${processedEvents.length}`
              : processedEvents.length}{" "}
            event{processedEvents.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Filter dropdowns */}
      {processedEvents.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "20px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Select
            value={eventNameFilter || "__all__"}
            onValueChange={(v) => setEventNameFilter(v === "__all__" ? "" : v)}
          >
            <SelectTrigger
              className="h-auto cursor-pointer"
              style={{
                padding: "8px 12px",
                background: "#16161e",
                border: "1px solid #2d2d3a",
                borderRadius: "6px",
                color: "#f6f6fb",
                fontSize: "0.875rem",
                minWidth: "180px",
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All events ({uniqueEventNames.length})</SelectItem>
              {uniqueEventNames.map((name: any) => {
                const count = processedEvents.filter(
                  (e: any) => e.eventName === name,
                ).length;
                return (
                  <SelectItem key={name} value={name}>
                    {name} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Select
            value={eventContractFilter || "__all__"}
            onValueChange={(v) => setEventContractFilter(v === "__all__" ? "" : v)}
          >
            <SelectTrigger
              className="h-auto cursor-pointer"
              style={{
                padding: "8px 12px",
                background: "#16161e",
                border: "1px solid #2d2d3a",
                borderRadius: "6px",
                color: "#f6f6fb",
                fontSize: "0.875rem",
                minWidth: "220px",
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All contracts ({uniqueContracts.length})</SelectItem>
              {uniqueContracts.map((addr) => {
                const count = processedEvents.filter(
                  (e: any) => e.address === addr,
                ).length;
                return (
                  <SelectItem key={addr} value={addr}>
                    {contractDisplayMap[addr]} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {(eventNameFilter || eventContractFilter) && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEventNameFilter("");
                setEventContractFilter("");
              }}
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "6px",
                color: "#ef4444",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Event cards */}
      {filteredEvents.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredEvents.map((event: any) => (
            <EventCard
              key={event.index}
              event={event}
              shortAddress={shortenAddress}
            />
          ))}
        </div>
      ) : processedEvents.length > 0 ? (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--sim-text-muted, #9a9aac)",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px dashed var(--sim-border, #1f2026)",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "8px", opacity: 0.5 }}>
            Search
          </div>
          <div>No events match the current filters</div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEventNameFilter("");
              setEventContractFilter("");
            }}
            style={{
              marginTop: "12px",
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              borderRadius: "6px",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--sim-text-muted, #9a9aac)",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px dashed var(--sim-border, #1f2026)",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "8px", opacity: 0.5 }}>
            Events
          </div>
          <div>No events were emitted during this simulation</div>
        </div>
      )}
    </section>
  );
};
