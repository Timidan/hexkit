import React from "react";
import {
  WifiSlash,
  Clock,
  Shield,
  WarningCircle,
  ArrowClockwise,
  Robot,
} from "@phosphor-icons/react";
import { Alert, AlertTitle, AlertDescription } from "../../../../components/ui/alert";
import { Button } from "../../../../components/ui/button";

// Classify raw `llmError` strings ("Failed to fetch", "signal timed out",
// "schema: ...") into human buckets so each bucket can render a targeted
// message, icon, and conditional Retry button.

type LlmErrorCategory =
  | "network"
  | "timeout"
  | "upstream"
  | "schema"
  | "auth"
  | "unknown";

interface Classification {
  category: LlmErrorCategory;
  title: string;
  description: string;
  icon: React.ReactNode;
  retryable: boolean;
}

function classify(rawError: string): Classification {
  const msg = rawError.toLowerCase();

  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("err_network") ||
    msg.includes("load failed")
  ) {
    return {
      category: "network",
      title: "Can't reach the recommender",
      description:
        "Your browser couldn't contact our AI proxy. Check your connection, disable any VPN or privacy extensions that might be blocking /api/llm-recommend, and try again.",
      icon: <WifiSlash weight="duotone" className="h-4 w-4" />,
      retryable: true,
    };
  }

  if (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("aborterror")
  ) {
    return {
      category: "timeout",
      title: "Recommender timed out",
      description:
        "Gemini didn't respond in time. The thinking model is slower on large candidate lists — retrying usually works.",
      icon: <Clock weight="duotone" className="h-4 w-4" />,
      retryable: true,
    };
  }

  if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized")) {
    return {
      category: "auth",
      title: "Recommender not authorized",
      description:
        "The AI proxy rejected our request. This usually means the GEMINI_API_KEY isn't set on the server or the Origin allow-list is misconfigured. Rules-based picks are still safe to use.",
      icon: <Shield weight="duotone" className="h-4 w-4" />,
      retryable: false,
    };
  }

  if (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("gemini_api_key") ||
    msg.includes("upstream")
  ) {
    return {
      category: "upstream",
      title: "Recommender is down",
      description:
        "Gemini (or our proxy in front of it) returned an error. This usually clears up on its own — you can retry, or keep using the rules-based picks below.",
      icon: <WarningCircle weight="duotone" className="h-4 w-4" />,
      retryable: true,
    };
  }

  if (
    msg.startsWith("schema:") ||
    msg.includes("schema invalid") ||
    msg.includes("did not return json") ||
    msg.includes("empty llm response")
  ) {
    return {
      category: "schema",
      title: "Recommender returned something we couldn't parse",
      description:
        "Gemini's response didn't match the shape we expect. We already retried once and fell back to rules-based picks — they're safe to use. Try again to see if a second call returns clean JSON.",
      icon: <Robot weight="duotone" className="h-4 w-4" />,
      retryable: true,
    };
  }

  return {
    category: "unknown",
    title: "AI recommender unavailable",
    description:
      "Something went wrong while fetching AI recommendations. Rules-based picks are still shown below and are safe to use.",
    icon: <WarningCircle weight="duotone" className="h-4 w-4" />,
    retryable: true,
  };
}

export interface LlmErrorAlertProps {
  error: string | null | undefined;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function LlmErrorAlert({ error, onRetry, isRetrying = false }: LlmErrorAlertProps) {
  if (!error) return null;
  const { title, description, icon, retryable } = classify(error);

  return (
    <Alert variant="destructive" className="border-amber-500/40 bg-amber-500/5 text-amber-200">
      {icon}
      <AlertTitle className="text-amber-100">{title}</AlertTitle>
      <AlertDescription className="text-amber-200/90">
        <p>{description}</p>
        <details className="mt-1 text-[10px] opacity-70">
          <summary className="cursor-pointer select-none">Technical detail</summary>
          <code className="mt-1 block break-all font-mono text-[10px]">{error}</code>
        </details>
        {retryable && onRetry && (
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={isRetrying}
              className="h-7 border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-100 hover:bg-amber-500/20"
            >
              <ArrowClockwise
                weight="bold"
                className={`mr-1 h-3 w-3 ${isRetrying ? "animate-spin" : ""}`}
              />
              {isRetrying ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
