import { useEffect, useState } from "react";
import {
  lookupEventSignatures,
  getCachedSignatures,
  cacheSignature,
} from "../../utils/signatureDatabase";
import { decodeRawEvent } from "./eventDecoder";
import type { SimulatorTab } from "./types";

interface Args {
  activeTab: SimulatorTab;
  events: any[];
  contractContext: any;
}

/**
 * Resolves human-readable names for anonymous events by checking the local
 * signature cache first, then batching unknowns to the signature DB.
 * Also owns the event-tab filter state because it sits alongside the same
 * event data and has no other home.
 */
export function useEventSignatureLookup({
  activeTab,
  events,
  contractContext,
}: Args) {
  const [lookedUpEventNames, setLookedUpEventNames] = useState<
    Record<string, string>
  >({});
  const [eventNameFilter, setEventNameFilter] = useState<string>("");
  const [eventContractFilter, setEventContractFilter] = useState<string>("");

  useEffect(() => {
    if (activeTab !== "events" || events.length === 0) return;

    const lookupUnknownEvents = async () => {
      const cachedSignatures = getCachedSignatures("event");
      const cachedNamesToAdd: Record<string, string> = {};
      const allAbis: any[] = [];
      if (contractContext?.abi) allAbis.push(contractContext.abi);
      if (contractContext?.diamondFacets) {
        contractContext.diamondFacets.forEach((f: any) => {
          if (f.abi) allAbis.push(f.abi);
        });
      }
      const unknownTopics: string[] = [];

      events.forEach((event: any) => {
        if (event.name && event.name !== "Anonymous Event") return;
        let topic0: string | null = null;
        if (event.data?.topics?.[0]) topic0 = String(event.data.topics[0]);
        else if (event.topics?.[0]) topic0 = String(event.topics[0]);
        if (!topic0) return;
        const normalizedTopic =
          "0x" + topic0.replace(/^0x/, "").padStart(64, "0");
        if (cachedSignatures[normalizedTopic]) {
          if (!lookedUpEventNames[normalizedTopic]) {
            cachedNamesToAdd[normalizedTopic] =
              cachedSignatures[normalizedTopic].name;
          }
          return;
        }
        if (lookedUpEventNames[normalizedTopic]) return;
        const decoded = decodeRawEvent(event, allAbis);
        if (decoded?.name) return;
        if (!unknownTopics.includes(normalizedTopic))
          unknownTopics.push(normalizedTopic);
      });

      if (Object.keys(cachedNamesToAdd).length > 0) {
        setLookedUpEventNames((prev) => ({ ...prev, ...cachedNamesToAdd }));
      }

      if (unknownTopics.length > 0) {
        try {
          const response = await lookupEventSignatures(unknownTopics);
          if (response.ok && response.result?.event) {
            const newNames: Record<string, string> = {};
            Object.entries(response.result.event).forEach(
              ([hash, signatures]) => {
                if (signatures && signatures.length > 0) {
                  const name = signatures[0].name;
                  const eventName = name.split("(")[0];
                  newNames[hash] = eventName;
                  cacheSignature(hash, eventName, "event");
                }
              },
            );
            if (Object.keys(newNames).length > 0) {
              setLookedUpEventNames((prev) => ({ ...prev, ...newNames }));
            }
          }
        } catch (err) {
          console.warn("[Events] Failed to look up event signatures:", err);
        }
      }
    };

    lookupUnknownEvents();
  }, [activeTab, events, contractContext, lookedUpEventNames]);

  return {
    lookedUpEventNames,
    eventNameFilter,
    setEventNameFilter,
    eventContractFilter,
    setEventContractFilter,
  };
}
