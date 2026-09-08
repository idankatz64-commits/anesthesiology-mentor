import {
  FSRS_ALGORITHM_VERSION,
  FSRS_PARAMETER_VERSION,
  FSRS_PARAMETERS,
  calculateFsrsRating,
  calculateFsrsReview,
  deserializeCard,
  emptySerializedCard,
  ratingForEvent,
  type FsrsClaim,
} from "./fsrsAdapter.ts";
import { Rating } from "./vendor/ts-fsrs-5.4.2/index.mjs";

const equal = (actual: unknown, expected: unknown, message: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
};
const close = (actual: number, expected: number, message: string) => {
  if (Math.abs(actual - expected) > 1e-7) throw new Error(`${message}: ${actual} != ${expected}`);
};
const base = (overrides: Partial<FsrsClaim> = {}): FsrsClaim => ({
  event_id: "event-1", lease_token: "lease-1", user_id: "user-1", question_id: "q1",
  confirmed_at: "2026-09-08T00:00:00.000Z", is_correct: true, confidence: "confident",
  confidence_estimated: false, primary_eligible: true, exclusion_reason: null,
  feedback_exposed_before: false, prior_feedback_at: null, answer_ms: 1000,
  algorithm_version: FSRS_ALGORITHM_VERSION, parameter_version: FSRS_PARAMETER_VERSION,
  parameters: FSRS_PARAMETERS as unknown as Record<string, unknown>,
  previous_card: emptySerializedCard("2026-09-08T00:00:00.000Z"), state_revision: 0, ...overrides,
});

Deno.test("baseline mapping never emits Easy", () => {
  equal(ratingForEvent(base({ is_correct: false, confidence: "confident" })), 1, "wrong -> Again");
  equal(ratingForEvent(base({ is_correct: true, confidence: "guessed" })), 2, "correct guess -> Hard");
  equal(ratingForEvent(base({ is_correct: true, confidence: "hesitant" })), 3, "correct hesitant -> Good");
  equal(ratingForEvent(base({ is_correct: true, confidence: "confident" })), 3, "correct confident -> Good");
});

Deno.test("official 5.4.2 new-card fixtures and replay are deterministic", () => {
  const cases = [
    { event: base({ is_correct: false }), rating: 1, due: "2026-09-08T00:01:00.000Z", stability: 0.212, difficulty: 6.4133 },
    { event: base({ confidence: "guessed" }), rating: 2, due: "2026-09-08T00:06:00.000Z", stability: 1.2931, difficulty: 5.11217071 },
    { event: base({ confidence: "hesitant" }), rating: 3, due: "2026-09-08T00:10:00.000Z", stability: 2.3065, difficulty: 2.11810397 },
  ];
  for (const item of cases) {
    const first = calculateFsrsReview(item.event);
    equal(first.rating, item.rating, "rating"); equal(first.predicted_due, item.due, "due");
    close(first.new_card.stability, item.stability, "stability"); close(first.new_card.difficulty, item.difficulty, "difficulty");
    equal(calculateFsrsReview(item.event), first, "repeat replay");
  }
});

Deno.test("official Easy fixture is pinned but baseline mapping does not select it", () => {
  const event = base();
  const result = calculateFsrsRating(
    event,
    deserializeCard(event.previous_card),
    new Date(event.confirmed_at),
    Rating.Easy,
  );
  equal(result.rating, 4, "Easy fixture rating");
  equal(result.predicted_due, "2026-09-16T00:00:00.000Z", "Easy fixture due");
  close(result.new_card.stability, 8.2956, "Easy fixture stability");
  close(result.new_card.difficulty, 1, "Easy fixture difficulty");
});

Deno.test("serialized second Good replay and retrievability match pinned fixture", () => {
  const first = calculateFsrsReview(base({ confidence: "confident" }));
  const claim = base({ event_id: "event-2", lease_token: "lease-2", confirmed_at: "2026-09-09T00:00:00.000Z", previous_card: first.new_card, state_revision: 1 });
  const second = calculateFsrsReview(claim);
  equal(second.predicted_due, "2026-09-16T00:00:00.000Z", "second due");
  close(second.new_card.stability, 7.31530068, "second stability");
  close(second.retrievability_before!, 0.9468475, "retrievability");
});

Deno.test("ineligible and estimated events cannot be rated", () => {
  for (const event of [base({ primary_eligible: false, is_correct: null, exclusion_reason: "unscored" }), base({ confidence_estimated: true })]) {
    let failed = false; try { ratingForEvent(event); } catch { failed = true; }
    if (!failed) throw new Error("ineligible event received a rating");
  }
});
