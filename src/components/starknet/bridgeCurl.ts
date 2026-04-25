// Body is formatted as a single-quoted shell string with embedded
// apostrophes escaped via the close-escape-reopen trick — no JSON
// unicode tricks needed because bridge request bodies are pure ASCII
// felt arrays.

import { getStarknetSimBridgeUrl } from "@/utils/env";

export interface CurlOptions {
  method?: "GET" | "POST";
  /** Path under the bridge base URL — e.g. "/simulate", "/trace/0x123". */
  path: string;
  /** Optional JSON body. Stringified with 2-space indent for legibility
   *  in the terminal; the bridge accepts pretty-printed JSON. */
  body?: unknown;
}

export function buildBridgeCurl({ method = "POST", path, body }: CurlOptions): string {
  const url = `${resolveBaseUrl()}${path}`;
  const headerLines: string[] = [];
  if (body !== undefined) headerLines.push(`-H 'content-type: application/json'`);
  const parts: string[] = [`curl -sS -X ${method} '${shellEscape(url)}'`];
  parts.push(...headerLines);
  if (body !== undefined) {
    const json = JSON.stringify(body, null, 2);
    parts.push(`--data ${escapeSingleQuoted(json)}`);
  }
  return parts.join(" \\\n  ");
}

/** Configured base URL — falls back to the dev-server proxy path so a
 *  user can paste the curl into a terminal next to a running `vite`
 *  and have it hit the same bridge the browser does. Drops the origin
 *  prefix when the configured URL is relative (the common dev case). */
function resolveBaseUrl(): string {
  const configured = getStarknetSimBridgeUrl().replace(/\/+$/, "");
  if (!configured) return "";
  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return configured;
  }
  // Relative path (e.g. "/api/starknet-sim") — anchor against the
  // current page origin so the output is copy-paste runnable.
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${configured}`;
  }
  return configured;
}

function shellEscape(value: string): string {
  // Inside single quotes, only the single quote itself needs special
  // handling — close, escape, reopen.
  return value.replace(/'/g, `'"'"'`);
}

function escapeSingleQuoted(value: string): string {
  return `'${shellEscape(value)}'`;
}
