// =============================================================================
// HTTP Response Compression — gzip/brotli for remote VPS transport
//
// Provides `sendJson(res, req, statusCode, data)` that automatically negotiates
// Accept-Encoding and compresses the JSON body when beneficial.
//
// Rules:
//   - Prefer brotli (br) when accepted, fallback to gzip, else identity.
//   - Skip compression for bodies smaller than MIN_COMPRESS_BYTES.
//   - Uses async zlib streams to avoid blocking the event loop.
//   - SSE endpoints must NOT use this — write directly to res.
//   - Sets Vary: Accept-Encoding for correct caching at reverse proxies.
// =============================================================================

import { createGzip, createBrotliCompress, constants } from "node:zlib";

/**
 * Minimum response body size (bytes) before compression kicks in.
 * Smaller payloads compress poorly and the overhead isn't worth it.
 */
const MIN_COMPRESS_BYTES = 1024;

/**
 * Parse the Accept-Encoding header and pick the best encoding.
 * @param {import('node:http').IncomingMessage} req
 * @returns {"br" | "gzip" | "identity"}
 */
function negotiateEncoding(req) {
  const accept = req.headers["accept-encoding"] || "";
  // Check brotli first (better ratio)
  if (accept.includes("br")) return "br";
  if (accept.includes("gzip")) return "gzip";
  return "identity";
}

/**
 * Send a JSON response with transparent compression.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {import('node:http').IncomingMessage} req
 * @param {number} statusCode
 * @param {unknown} data — will be JSON.stringify'd
 * @param {Record<string, string>} [extraHeaders] — optional extra response headers
 *        (e.g. Retry-After). Reserved headers (Content-Type, Content-Length,
 *        Content-Encoding, Vary) managed by this function are not overridable.
 */
export function sendJson(res, req, statusCode, data, extraHeaders) {
  const jsonBody = JSON.stringify(data);
  const bodyBytes = Buffer.byteLength(jsonBody, "utf8");

  // Small responses: skip compression overhead
  if (bodyBytes < MIN_COMPRESS_BYTES) {
    res.writeHead(statusCode, {
      ...(extraHeaders || {}),
      "Content-Type": "application/json",
      "Content-Length": String(bodyBytes),
      "Vary": "Accept-Encoding",
    });
    res.end(jsonBody);
    return;
  }

  const encoding = negotiateEncoding(req);

  if (encoding === "identity") {
    res.writeHead(statusCode, {
      ...(extraHeaders || {}),
      "Content-Type": "application/json",
      "Content-Length": String(bodyBytes),
      "Vary": "Accept-Encoding",
    });
    res.end(jsonBody);
    return;
  }

  // Stream-based compression (non-blocking)
  const compressor =
    encoding === "br"
      ? createBrotliCompress({
          params: {
            // Quality 4 is a good speed/ratio tradeoff for dynamic content
            [constants.BROTLI_PARAM_QUALITY]: 4,
          },
        })
      : createGzip({ level: 6 });

  // Remove Content-Length since we're streaming compressed data
  res.writeHead(statusCode, {
    ...(extraHeaders || {}),
    "Content-Type": "application/json",
    "Content-Encoding": encoding,
    "Vary": "Accept-Encoding",
  });

  compressor.pipe(res);
  compressor.end(jsonBody);
}

/**
 * Send an error JSON response through the compression pipeline.
 *
 * This is a thin wrapper over sendJson that exists to mark the call site as
 * an error path and keep the wire shape of `payload` identical to the
 * pre-migration inline `res.writeHead(...); res.end(JSON.stringify(payload))`.
 *
 * The `payload` object is passed through to sendJson unchanged — no fields
 * are added, renamed, or dropped. Callers that were emitting `{ error }`,
 * `{ error, details }`, `{ success: false, error, ... }`, or nested shapes
 * continue to emit exactly the same JSON on the wire.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {import('node:http').IncomingMessage} req
 * @param {number} statusCode
 * @param {unknown} payload — the error object to serialize (shape unchanged)
 * @param {Record<string, string>} [extraHeaders] — e.g. { "Retry-After": "30" }
 */
export function sendError(res, req, statusCode, payload, extraHeaders) {
  sendJson(res, req, statusCode, payload, extraHeaders);
}
