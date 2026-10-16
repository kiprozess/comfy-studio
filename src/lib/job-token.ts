// Job tickets are `base64url(JSON payload).signature`. The payload is signed, not secret,
// so the client may read it for display; only the server can verify it.
function readPayload(token: string): { id?: unknown; expires?: unknown } | null {
  try {
    return JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
}

/** Comfy request ID of the job, as shown in the Comfy platform. */
export function tokenRequestId(token: string) {
  const id = readPayload(token)?.id;
  return typeof id === "string" ? id : undefined;
}

/** Tickets expire 24 hours after submission, which recovers the start time of a restored job. */
export function tokenCreatedAt(token: string) {
  const expires = readPayload(token)?.expires;
  return typeof expires === "number" ? expires - 24 * 60 * 60 * 1000 : undefined;
}
