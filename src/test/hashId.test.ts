import { describe, it, expect } from 'vitest';
import { hashId } from '@/components/admin/hashId';

// B106: hashId ended in `.substring(0, 6)`, which threw away the low hex digits
// of an up-to-8-digit hash. Two unrelated questions that already live in the
// bank differ only in those digits, so both mapped to the id 426717 — and the
// single-question form wrote with `upsert`, so creating one silently destroyed
// the other and still reported "created successfully".
//
// These two strings are the real texts of live questions 2307 and 335.
const SCHWANN = 'Where can Schwann cells be found on the nerve to muscle interaction?';
const FLUMAZENIL = 'איזו מהתרופות הבאות לא עוברת REVERSE על ידי FLUMAZENIL? .35';

describe('hashId', () => {
  it('does not collide on the two questions that collided under truncation', () => {
    expect(hashId(SCHWANN)).not.toBe(hashId(FLUMAZENIL));
  });

  it('keeps the full hash instead of truncating to 6 characters', () => {
    expect(hashId(SCHWANN)).toBe('42671738');
    expect(hashId(FLUMAZENIL)).toBe('42671727');
    // both used to become this, which is the whole bug
    expect(hashId(SCHWANN).substring(0, 6)).toBe(hashId(FLUMAZENIL).substring(0, 6));
  });

  it('is deterministic and stable for the same input', () => {
    expect(hashId(SCHWANN)).toBe(hashId(SCHWANN));
  });

  it('handles an empty string without throwing', () => {
    expect(hashId('')).toBe('0');
  });
});
