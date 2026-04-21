import { useCallback } from "react";
import { useLlmConfig } from "../contexts/LlmConfigContext";

export function useLlmConsent() {
  const { config, acknowledgeConsent } = useLlmConfig();
  const requestAck = useCallback(() => acknowledgeConsent(), [acknowledgeConsent]);
  return { acknowledged: config.consentAcknowledged, requestAck };
}
