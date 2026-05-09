import * as net from "node:net";

export interface RpcUrlValidationOptions {
  allowedHostsEnv?: string;
}

export interface RpcUrlValidationResult {
  ok: boolean;
  reason?: string;
}

export function validatePublicRpcUrl(
  raw: string,
  options: RpcUrlValidationOptions = {},
): RpcUrlValidationResult {
  if (raw.length > 2048) return { ok: false, reason: "rpc_url_too_long" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_rpc_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_rpc_scheme" };
  }

  if (url.username || url.password) {
    return { ok: false, reason: "rpc_url_credentials_not_allowed" };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return { ok: false, reason: "missing_rpc_host" };

  if (isPrivateHost(host)) {
    return { ok: false, reason: "private_rpc_host_not_allowed" };
  }

  const allowedHosts = parseAllowedHosts(options.allowedHostsEnv);
  if (allowedHosts.length > 0 && !hostMatchesAllowlist(host, allowedHosts)) {
    return { ok: false, reason: "rpc_host_not_allowed" };
  }

  return { ok: true };
}

function parseAllowedHosts(envName?: string): string[] {
  if (!envName) return [];
  return (process.env[envName] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatchesAllowlist(host: string, allowedHosts: string[]): boolean {
  return allowedHosts.some((allowed) => {
    if (host === allowed) return true;
    if (allowed.startsWith(".")) return host.endsWith(allowed);
    return false;
  });
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host === "localhost." || host.endsWith(".localhost")) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) return isPrivateIpv6(host);

  return false;
}

function isPrivateIpv4(host: string): boolean {
  const octets = host.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  const mappedIpv4 = ipv4FromMappedIpv6(normalized);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:169.254.")
  );
}

function ipv4FromMappedIpv6(host: string): string | null {
  const prefix = "::ffff:";
  if (!host.startsWith(prefix)) return null;

  const suffix = host.slice(prefix.length);
  if (suffix.includes(".")) return suffix;

  const groups = suffix.split(":");
  if (groups.length !== 2) return null;

  const [hiRaw, loRaw] = groups;
  const hi = Number.parseInt(hiRaw, 16);
  const lo = Number.parseInt(loRaw, 16);
  if (
    !Number.isInteger(hi) ||
    !Number.isInteger(lo) ||
    hi < 0 ||
    hi > 0xffff ||
    lo < 0 ||
    lo > 0xffff
  ) {
    return null;
  }

  return [
    (hi >> 8) & 0xff,
    hi & 0xff,
    (lo >> 8) & 0xff,
    lo & 0xff,
  ].join(".");
}
