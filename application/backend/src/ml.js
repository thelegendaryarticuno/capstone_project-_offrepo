// REST client for the FastAPI ML service (server-to-server).
const ML_URL = process.env.ML_URL || "http://localhost:8000";

export class MlError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function ml(path, body) {
  let res;
  try {
    res = await fetch(`${ML_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Internal-Key": process.env.ML_INTERNAL_KEY || "dev-internal-key" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    // SRS NFR-SA-04: explicit failure, never invented numbers
    throw new MlError(503, "ML_UNAVAILABLE", "ML service is unavailable");
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new MlError([422, 503].includes(res.status) ? res.status : 502, j.detail?.code || "ML_FAILED", j.detail?.message || "Model computation failed");
  return j;
}
