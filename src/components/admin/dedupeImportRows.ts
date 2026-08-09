/**
 * Collapse rows that resolve to the same `id`, and tell the two cases apart.
 *
 * The importer keys on `id`, so two rows sharing one can only produce one row
 * in the table. That is correct when they are the same question twice, and it
 * is a lost question when they are not:
 *
 *   same id, same text        the file repeats a question — drop the repeat
 *   same id, different text   two questions collapsed into one — report it
 *
 * The old code compared `id` alone and dropped both cases silently, so a file
 * with a hash collision reported "499 imported" for 500 rows with nothing to
 * say which one went missing.
 */

export interface StagedRow<R> {
  /** 1-based line in the CSV, header counted, so it matches the other errors. */
  line: number;
  row: R;
}

export interface DedupeResult<R> {
  unique: R[];
  errors: string[];
}

export function dedupeImportRows<R extends { id: string; question: string }>(
  staged: StagedRow<R>[],
): DedupeResult<R> {
  const firstSeen = new Map<string, StagedRow<R>>();
  const unique: R[] = [];
  const errors: string[] = [];

  for (const entry of staged) {
    const previous = firstSeen.get(entry.row.id);
    if (!previous) {
      firstSeen.set(entry.row.id, entry);
      unique.push(entry.row);
      continue;
    }
    if (previous.row.question === entry.row.question) continue; // the same question twice
    errors.push(
      `שורה ${entry.line}: מזהה ${entry.row.id} כבר בשימוש בשורה ${previous.line} ` +
        `עם שאלה אחרת — אחת מהשתיים תיעלם`,
    );
  }

  return { unique, errors };
}
