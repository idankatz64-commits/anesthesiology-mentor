// Manually-edited question ids, read completely or not at all (8.9.2026).
//
// `sync-questions` bulk-overwrites `questions` with the service key and uses
// this set as its only protection for rows a human curated by hand. Two
// properties matter, and the previous inline read had neither:
//
//   COMPLETE — the read is keyset-paginated over the primary key. A single
//   unpaginated select is silently capped by PostgREST's `max-rows` (1000 by
//   default), so once the protected set outgrows that cap the overflow rows
//   look unprotected and get overwritten by the sheet. Termination is on an
//   EMPTY page, never on a short one: a server-side cap below our page size
//   makes every page short, and "short means last" would then stop after the
//   first page while rows remain.
//
//   FAIL CLOSED — every read error, and any response with no rows array,
//   throws. The old code destructured only `data` and fell back to an empty
//   set, so a transient failure downgraded to "nothing is protected" and the
//   sync proceeded to overwrite every manually edited question. Callers must
//   invoke this BEFORE the first upsert so a throw aborts the whole sync.
//
// Dependency-free so the same file runs under Deno (edge) and under the local
// Deno test with a fake client. Performs no writes.

const PAGE_SIZE = 1000;

// The minimum of the PostgREST builder this helper touches. Split in two the
// way the real client is: filters only exist after `select()`.
export interface PagedFilter extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(column: string, value: unknown): PagedFilter;
  gt(column: string, value: string): PagedFilter;
  order(column: string, opts: { ascending: boolean }): PagedFilter;
  limit(count: number): PagedFilter;
}
export interface PagedReadClient {
  from(table: string): { select(columns: string): PagedFilter };
}

export async function fetchManuallyEditedIds(client: PagedReadClient): Promise<Set<string>> {
  const ids = new Set<string>();
  // null on the first page: the cursor filter is omitted entirely rather than
  // sent as an empty string, so nothing depends on how the server parses a
  // `gt.` with no value.
  let cursor: string | null = null;

  for (;;) {
    let query = client
      .from("questions")
      .select("id")
      .eq("manually_edited", true)
      .order("id", { ascending: true });
    if (cursor !== null) query = query.gt("id", cursor);
    const { data, error } = await query.limit(PAGE_SIZE);

    if (error) {
      const detail = error instanceof Error ? error.message : JSON.stringify(error);
      throw new Error(`MANUALLY_EDITED_READ_FAILED: ${detail}`);
    }
    if (!Array.isArray(data)) {
      throw new Error("MANUALLY_EDITED_READ_FAILED: no rows returned");
    }
    if (data.length === 0) return ids;

    for (const row of data as { id?: unknown }[]) {
      if (typeof row?.id !== "string" || row.id === "") {
        throw new Error("MANUALLY_EDITED_READ_FAILED: row without a usable id");
      }
      ids.add(row.id);
    }

    // The cursor must strictly advance. If the server ignored the ordering or
    // the filter, looping would either spin forever or silently re-read the
    // same page; fail closed instead of guessing.
    const last = (data[data.length - 1] as { id: string }).id;
    if (cursor !== null && last <= cursor) {
      throw new Error("MANUALLY_EDITED_READ_FAILED: pagination cursor did not advance");
    }
    cursor = last;
  }
}
