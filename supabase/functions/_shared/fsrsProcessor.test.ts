import { emptySerializedCard, FSRS_ALGORITHM_VERSION, FSRS_PARAMETER_VERSION, FSRS_PARAMETERS, type FsrsClaim, type FsrsResult } from "./fsrsAdapter.ts";
import { processFsrsBatch, type FsrsWorkerApi } from "./fsrsProcessor.ts";

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const claim = (overrides: Partial<FsrsClaim> = {}): FsrsClaim => ({
  event_id: "eligible", lease_token: "lease-1", user_id: "user", question_id: "q",
  confirmed_at: "2026-09-08T00:00:00.000Z", is_correct: true, confidence: "confident",
  confidence_estimated: false, primary_eligible: true, exclusion_reason: null,
  feedback_exposed_before: false, prior_feedback_at: null, answer_ms: 500,
  algorithm_version: FSRS_ALGORITHM_VERSION, parameter_version: FSRS_PARAMETER_VERSION,
  parameters: FSRS_PARAMETERS as unknown as Record<string, unknown>, previous_card: emptySerializedCard("2026-09-08T00:00:00.000Z"), state_revision: 0, ...overrides,
});

Deno.test("processor applies eligible and records excluded events", async () => {
  const calls: string[] = []; const committed: FsrsResult[] = [];
  const api: FsrsWorkerApi = {
    claim: async () => [claim(), claim({ event_id: "excluded", lease_token: "lease-2", primary_eligible: false, is_correct: null, exclusion_reason: "unscored" })],
    commit: async (id, _lease, result) => { calls.push(`commit:${id}`); committed.push(result); },
    exclude: async (id) => { calls.push(`exclude:${id}`); },
    fail: async (id) => { calls.push(`fail:${id}`); },
  };
  const result = await processFsrsBatch(api);
  assert(JSON.stringify(result) === JSON.stringify({ claimed: 2, applied: 1, excluded: 1, failed: 0 }), "wrong batch totals");
  assert(calls.join(",") === "commit:eligible,exclude:excluded", "wrong worker calls");
  assert(committed[0]?.rating === 3 && committed[0]?.new_card.reps === 1, "real FSRS result not committed");
});

Deno.test("processor reports calculation failure through bounded error API", async () => {
  const failures: string[] = [];
  const api: FsrsWorkerApi = {
    claim: async () => [claim({ algorithm_version: "wrong" })],
    commit: async () => { throw new Error("unexpected commit"); }, exclude: async () => {},
    fail: async (_id, _lease, code) => { failures.push(code); },
  };
  const result = await processFsrsBatch(api);
  assert(result.failed === 1 && failures[0] === "VERSION_MISMATCH", "failure was not safely recorded");
});
