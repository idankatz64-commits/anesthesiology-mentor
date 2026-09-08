import { calculateFsrsReview, type FsrsClaim, type FsrsResult } from "./fsrsAdapter.ts";

export interface FsrsWorkerApi {
  claim(): Promise<FsrsClaim[]>;
  commit(eventId: string, leaseToken: string, result: FsrsResult): Promise<unknown>;
  exclude(eventId: string, leaseToken: string): Promise<unknown>;
  fail(eventId: string, leaseToken: string, errorCode: string): Promise<unknown>;
}

export interface ProcessBatchResult {
  claimed: number;
  applied: number;
  excluded: number;
  failed: number;
}

const errorCode = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 120);
  return normalized || "PROCESSOR_ERROR";
};

export async function processFsrsBatch(api: FsrsWorkerApi): Promise<ProcessBatchResult> {
  const claims = await api.claim();
  const result: ProcessBatchResult = { claimed: claims.length, applied: 0, excluded: 0, failed: 0 };
  for (const claim of claims) {
    try {
      if (!claim.primary_eligible) {
        await api.exclude(claim.event_id, claim.lease_token);
        result.excluded += 1;
      } else {
        await api.commit(claim.event_id, claim.lease_token, calculateFsrsReview(claim));
        result.applied += 1;
      }
    } catch (error) {
      result.failed += 1;
      try {
        await api.fail(claim.event_id, claim.lease_token, errorCode(error));
      } catch {
        // A stale worker must not overwrite a newer lease. The queue lease/retry
        // state remains authoritative, and the aggregate still reports failure.
      }
    }
  }
  return result;
}
