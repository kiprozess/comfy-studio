// Reverse proxies can expose HTTPS while Next receives an internal HTTP URL.
// Only server configuration defines the public origin; forwarded headers are
// caller-controlled and must never add arbitrary origins to this check.
export function isAppRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (origin === null) return true; // Preserve non-browser API clients.
  const configured = process.env.APP_ORIGIN
    ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);
  try {
    const expected = new URL(configured ?? request.url);
    const supplied = new URL(origin);
    if (!["http:", "https:"].includes(expected.protocol)) return false;
    // Origin headers contain only scheme, hostname and port (no paths or credentials).
    if (origin !== supplied.origin || supplied.username || supplied.password) return false;
    if (configured && (expected.username || expected.password || expected.pathname !== "/" || expected.search || expected.hash)) return false;
    return supplied.origin === expected.origin;
  } catch {
    return false;
  }
}
