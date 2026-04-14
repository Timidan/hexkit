import crypto from "crypto";

interface ServiceAccountKey {
  project_id: string;
  private_key: string;
  client_email: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

/**
 * Load the service account key from either:
 *   1. GOOGLE_SA_KEY_JSON env var (raw JSON string — for Vercel)
 *   2. A local JSON file path in GOOGLE_APPLICATION_CREDENTIALS
 */
function loadServiceAccountKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SA_KEY_JSON;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath) {
    try {
      // Dynamic require for local dev — Vercel bundles won't hit this path
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("fs");
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  return null;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

/**
 * Create a signed JWT for Google OAuth2 token exchange.
 */
function createJwt(sa: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/cloud-platform",
    iat: now,
    exp: now + 3600,
  };

  const segments = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(payload)),
  ];
  const signingInput = segments.join(".");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key);

  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Get a valid access token, minting a new one if the cached token is expired.
 * Returns null if no service account key is configured.
 */
export async function getAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const sa = loadServiceAccountKey();
  if (!sa) return null;

  const jwt = createJwt(sa);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[vertexAuth] Token exchange failed:", res.status, text);
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

/**
 * Get the Vertex AI project ID from the service account key.
 */
export function getProjectId(): string | null {
  const sa = loadServiceAccountKey();
  return sa?.project_id ?? null;
}
