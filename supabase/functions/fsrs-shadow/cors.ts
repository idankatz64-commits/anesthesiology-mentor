// Origin allowlist for fsrs-shadow. Lives outside index.ts so it is importable by a test:
// index.ts calls Deno.serve() on import and would start a server inside the test run.
const DEFAULT_ORIGIN = "https://anesthesiology-mentor.vercel.app";

// Loopback aliases are distinct CORS origins (plain string match, no DNS), so QA on
// http://127.0.0.1:5178 needs its own entry even though localhost:5178 is listed.
export const allowedOrigins = (): Set<string> => new Set([
  DEFAULT_ORIGIN,
  "http://localhost:5178",
  "http://127.0.0.1:5178",
  ...(Deno.env.get("YSNP_ALLOWED_ORIGINS") ?? "").split(",").map((v) => v.trim()).filter(Boolean),
]);

export const cors = (request: Request): Record<string, string> => {
  const origin = request.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins().has(origin) ? origin : DEFAULT_ORIGIN,
    // The allow-origin header is computed from the request Origin, so any shared cache
    // (or the browser's own) must key on it — otherwise one origin's response is replayed to another.
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};
