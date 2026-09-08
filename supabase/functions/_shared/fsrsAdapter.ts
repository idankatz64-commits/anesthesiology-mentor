// @ts-types="./vendor/ts-fsrs-5.4.2/index.d.ts"
import {
  Rating,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type CardInput,
  type Grade,
} from "./vendor/ts-fsrs-5.4.2/index.mjs";

export const FSRS_ALGORITHM_VERSION = "ts-fsrs@5.4.2";
export const FSRS_PARAMETER_VERSION = "default-r0.90-v1";
export const FSRS_PARAMETERS = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: false,
});

export interface SerializedCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

export interface FsrsClaim {
  event_id: string;
  lease_token: string;
  user_id: string;
  question_id: string;
  confirmed_at: string;
  is_correct: boolean | null;
  confidence: "confident" | "hesitant" | "guessed" | null;
  confidence_estimated: boolean;
  primary_eligible: boolean;
  exclusion_reason: "unscored" | "missing_confidence" | "estimated_confidence" | null;
  feedback_exposed_before: boolean;
  prior_feedback_at: string | null;
  answer_ms: number | null;
  algorithm_version: string;
  parameter_version: string;
  parameters: Record<string, unknown>;
  previous_card: SerializedCard;
  state_revision: number;
}

export interface FsrsResult {
  algorithm_version: string;
  parameter_version: string;
  parameters: typeof FSRS_PARAMETERS;
  rating: number;
  previous_card: SerializedCard;
  new_card: SerializedCard;
  predicted_due: string;
  retrievability_before: number | null;
}

const scheduler = fsrs(FSRS_PARAMETERS);

export function ratingForEvent(event: Pick<FsrsClaim, "primary_eligible" | "is_correct" | "confidence" | "confidence_estimated">): Grade {
  if (!event.primary_eligible || event.is_correct === null || event.confidence === null || event.confidence_estimated) {
    throw new Error("EVENT_NOT_ELIGIBLE");
  }
  if (!event.is_correct) return Rating.Again;
  if (event.confidence === "guessed") return Rating.Hard;
  return Rating.Good;
}

export function serializeCard(card: Card): SerializedCard {
  return {
    due: new Date(card.due).toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? new Date(card.last_review).toISOString() : null,
  };
}

export function deserializeCard(card: SerializedCard): CardInput {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

export function calculateFsrsReview(claim: FsrsClaim): FsrsResult {
  if (claim.algorithm_version !== FSRS_ALGORITHM_VERSION || claim.parameter_version !== FSRS_PARAMETER_VERSION) {
    throw new Error("VERSION_MISMATCH");
  }
  const reviewedAt = new Date(claim.confirmed_at);
  if (!Number.isFinite(reviewedAt.getTime())) throw new Error("INVALID_CONFIRMED_AT");
  const previous = deserializeCard(claim.previous_card);
  const rating = ratingForEvent(claim);
  return calculateFsrsRating(claim, previous, reviewedAt, rating);
}

export function calculateFsrsRating(
  claim: FsrsClaim,
  previous: CardInput,
  reviewedAt: Date,
  rating: Grade,
): FsrsResult {
  const retrievability = previous.state === 0
    ? null
    : scheduler.get_retrievability(previous, reviewedAt, false);
  const record = scheduler.next(previous, reviewedAt, rating);
  const next = serializeCard(record.card);
  return {
    algorithm_version: FSRS_ALGORITHM_VERSION,
    parameter_version: FSRS_PARAMETER_VERSION,
    parameters: FSRS_PARAMETERS,
    rating,
    previous_card: serializeCard(previous as Card),
    new_card: next,
    predicted_due: next.due,
    retrievability_before: retrievability,
  };
}

export const emptySerializedCard = (at: string): SerializedCard => serializeCard(createEmptyCard(new Date(at)));
