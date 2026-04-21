import { useHeimdallVersion } from "./hooks";

export interface HeimdallAvailability {
  isAvailable: boolean;
  isLoading: boolean;
  version?: string;
}

export function useHeimdallAvailability(): HeimdallAvailability {
  const { data, isLoading } = useHeimdallVersion({
    throwOnError: false,
    retry: false,
  });
  return {
    isAvailable: Boolean(data?.available),
    isLoading,
    version: data?.version,
  };
}
