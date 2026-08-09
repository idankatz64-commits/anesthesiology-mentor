import { describe, it, expect } from 'vitest';
import { dedupeImportRows } from '@/components/admin/dedupeImportRows';

// The importer keys on `id`. Two rows sharing one collapse into a single row,
// which is right for a repeated question and wrong for a hash collision — the
// old code could not tell them apart and dropped both cases without a word.
const row = (id: string, question: string) => ({ id, question });

describe('dedupeImportRows', () => {
  it('drops a repeated question silently', () => {
    const { unique, errors } = dedupeImportRows([
      { line: 2, row: row('A1B2C3', 'What is the MAC of sevoflurane?') },
      { line: 3, row: row('A1B2C3', 'What is the MAC of sevoflurane?') },
    ]);

    expect(unique).toHaveLength(1);
    expect(unique[0].question).toBe('What is the MAC of sevoflurane?');
    expect(errors).toEqual([]);
  });

  it('reports a collision, and names both rows', () => {
    const { unique, errors } = dedupeImportRows([
      { line: 2, row: row('A1B2C3', 'Which agent triggers malignant hyperthermia?') },
      { line: 7, row: row('A1B2C3', 'A completely different question') },
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('שורה 7');   // the row that would have been lost
    expect(errors[0]).toContain('שורה 2');   // the row it collides with
    expect(errors[0]).toContain('A1B2C3');

    // The colliding row is not silently added either - the file fails the gate.
    expect(unique).toHaveLength(1);
  });

  it('leaves a file of distinct ids untouched', () => {
    const { unique, errors } = dedupeImportRows([
      { line: 2, row: row('A1B2C3', 'first') },
      { line: 3, row: row('D4E5F6', 'second') },
      { line: 4, row: row('998877', 'third') },
    ]);

    expect(unique).toHaveLength(3);
    expect(errors).toEqual([]);
  });
});
