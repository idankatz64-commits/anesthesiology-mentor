import { cors } from "./cors.ts";

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const preflight = (origin: string) => new Request("https://example.supabase.co/functions/v1/fsrs-shadow", { method: "OPTIONS", headers: { Origin: origin } });
const allowOrigin = (origin: string) => cors(preflight(origin))["Access-Control-Allow-Origin"];

Deno.test("cors echoes the approved QA loopback origins", () => {
  assert(allowOrigin("http://127.0.0.1:5178") === "http://127.0.0.1:5178", "QA origin 127.0.0.1:5178 not echoed back");
  assert(allowOrigin("http://localhost:5178") === "http://localhost:5178", "dev origin localhost:5178 not echoed back");
  assert(allowOrigin("https://anesthesiology-mentor.vercel.app") === "https://anesthesiology-mentor.vercel.app", "production origin not echoed back");
});

Deno.test("cors marks the response as varying by Origin", () => {
  for (const origin of ["http://127.0.0.1:5178", "https://attacker.example", ""]) {
    assert(cors(preflight(origin))["Vary"] === "Origin", `Vary: Origin missing for ${origin || "(none)"}`);
  }
});

Deno.test("cors never wildcards or echoes an unlisted origin", () => {
  for (const origin of ["https://attacker.example", "http://127.0.0.1:5179", "http://127.0.0.1", ""]) {
    assert(allowOrigin(origin) === "https://anesthesiology-mentor.vercel.app", `unlisted origin ${origin || "(none)"} was not rejected`);
  }
});
