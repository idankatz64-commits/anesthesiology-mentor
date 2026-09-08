// deno test supabase/functions/_shared  — no imports, no network.
import { fetchManuallyEditedIds } from "./manuallyEditedIds.ts";

const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
async function throwsWith(fn: () => Promise<unknown>, needle: string, msg: string) {
  try {
    await fn();
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    if (!m.includes(needle)) throw new Error(`${msg}: expected message containing ${needle}, got ${m}`);
    return;
  }
  throw new Error(`${msg}: expected a throw, got none`);
}

interface Row { id: string; manually_edited: boolean }
interface Opts {
  /** Server-side row cap, as PostgREST `max-rows` applies it — independent of the requested limit. */
  maxRows?: number;
  /** Zero-based page index → the error that page returns. */
  errorOnPage?: Record<number, unknown>;
  /** Zero-based page index → return `{ data: null, error: null }`. */
  nullDataOnPage?: number;
  /** Simulate a server that ignores the keyset filter (would loop forever). */
  ignoreCursor?: boolean;
}

// Fake PostgREST-shaped client. The builder records the query it was handed so
// the tests can assert the read is ordered, filtered and keyset-paginated, and
// any write method fails loudly: this helper must never mutate.
function fake(rows: Row[], opts: Opts = {}) {
  const queries: Record<string, unknown>[] = [];
  let writes = 0;
  const client = {
    from(table: string) {
      const state: { table: string; columns: string; eq: [string, unknown][]; gt: [string, string] | null; order: [string, { ascending: boolean }] | null; limit: number | null } =
        { table, columns: "", eq: [], gt: null, order: null, limit: null };
      const builder = {
        select(columns: string) { state.columns = columns; return builder; },
        eq(column: string, value: unknown) { state.eq.push([column, value]); return builder; },
        gt(column: string, value: string) { state.gt = [column, value]; return builder; },
        order(column: string, o: { ascending: boolean }) { state.order = [column, o]; return builder; },
        limit(count: number) { state.limit = count; return builder; },
        upsert() { writes++; throw new Error("write attempted"); },
        insert() { writes++; throw new Error("write attempted"); },
        update() { writes++; throw new Error("write attempted"); },
        delete() { writes++; throw new Error("write attempted"); },
        then<R1, R2>(res?: ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>) | null, rej?: ((r: unknown) => R2 | PromiseLike<R2>) | null) {
          const page = queries.length;
          queries.push({ ...state });
          if (opts.errorOnPage && page in opts.errorOnPage) return Promise.resolve({ data: null, error: opts.errorOnPage[page] }).then(res, rej);
          if (opts.nullDataOnPage === page) return Promise.resolve({ data: null, error: null }).then(res, rej);
          if (state.table !== "questions") return Promise.resolve({ data: null, error: { message: `unexpected table ${state.table}` } }).then(res, rej);

          let out = rows.filter((r) => state.eq.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v));
          if (state.gt && !opts.ignoreCursor) out = out.filter((r) => r.id > state.gt![1]);
          if (state.order?.[1].ascending) out = [...out].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          const cap = Math.min(state.limit ?? out.length, opts.maxRows ?? out.length);
          return Promise.resolve({ data: out.slice(0, cap).map((r) => ({ id: r.id })), error: null }).then(res, rej);
        },
      };
      return builder;
    },
  };
  return { client, queries, writes: () => writes };
}

// Ids are text and sort as text, so pad to keep the keyset order unambiguous.
const edited = (n: number, from = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `Q${String(i + from).padStart(6, "0")}`, manually_edited: true }));

Deno.test("reads every manually edited id when the set spans several pages — the unpaginated read returned only the first 1000", async () => {
  const rows = [...edited(2500), { id: "PLAIN", manually_edited: false }];
  const f = fake(rows);
  const ids = await fetchManuallyEditedIds(f.client);
  eq(ids.size, 2500, "all protected ids");
  eq(ids.has("Q000000") && ids.has("Q001000") && ids.has("Q002499"), true, "first, past-the-cap and last are all present");
  eq(ids.has("PLAIN"), false, "unedited rows are not protected");
  eq(f.writes(), 0, "no side effect");
});

Deno.test("a server row cap below the page size does not truncate the set — termination is on an empty page, not a short one", async () => {
  // Every page comes back short (200 < 1000). `data.length < PAGE_SIZE` would
  // have stopped after the first page and left 1800 rows unprotected.
  const f = fake(edited(2000), { maxRows: 200 });
  const ids = await fetchManuallyEditedIds(f.client);
  eq(ids.size, 2000, "all ids despite the cap");
  eq(f.queries.length, 11, "ten full pages plus the terminating empty one");
});

Deno.test("the read is keyset-paginated on the primary key: ordered ascending, cursor omitted on the first page then strictly advancing", async () => {
  const f = fake(edited(2001), { maxRows: 1000 });
  await fetchManuallyEditedIds(f.client);
  // 2001 rows at 1000 per page: three non-empty pages plus the empty one that ends the loop.
  eq(f.queries.length, 4, "three pages plus the terminating empty one");
  eq(f.queries.every((q) => JSON.stringify(q.order) === JSON.stringify(["id", { ascending: true }])), true, "always ordered");
  eq(f.queries.map((q) => q.gt), [null, ["id", "Q000999"], ["id", "Q001999"], ["id", "Q002000"]], "no cursor first, then the last id of the previous page");
  eq(f.queries.every((q) => JSON.stringify(q.eq) === JSON.stringify([["manually_edited", true]])), true, "filter kept on every page");
  eq(f.queries.every((q) => q.limit === 1000 && q.columns === "id"), true, "same page size and projection throughout");
});

Deno.test("a set that is exactly one page long is read completely", async () => {
  const f = fake(edited(1000));
  eq((await fetchManuallyEditedIds(f.client)).size, 1000, "exactly one page");
  eq(f.queries.length, 2, "the page plus the terminating empty one");
});

Deno.test("an empty protected set is one query and an empty set, not an error", async () => {
  const f = fake([{ id: "PLAIN", manually_edited: false }]);
  eq((await fetchManuallyEditedIds(f.client)).size, 0, "nothing protected");
  eq(f.queries.length, 1, "single query");
});

Deno.test("a read error on the FIRST page throws instead of returning an empty set — the caller must not proceed to overwrite", async () => {
  const f = fake(edited(10), { errorOnPage: { 0: { message: "connection reset" } } });
  await throwsWith(() => fetchManuallyEditedIds(f.client), "MANUALLY_EDITED_READ_FAILED", "first-page error");
  await throwsWith(() => fetchManuallyEditedIds(fake(edited(10), { errorOnPage: { 0: { message: "connection reset" } } }).client), "connection reset", "detail preserved");
});

Deno.test("a read error on a LATER page throws too — a partially read set would leave the unread remainder unprotected", async () => {
  const f = fake(edited(2500), { errorOnPage: { 2: { message: "statement timeout" } } });
  await throwsWith(() => fetchManuallyEditedIds(f.client), "MANUALLY_EDITED_READ_FAILED", "later-page error");
});

Deno.test("a response with neither rows nor an error throws rather than being read as 'nothing is protected'", async () => {
  await throwsWith(() => fetchManuallyEditedIds(fake(edited(10), { nullDataOnPage: 0 }).client), "no rows returned", "null data, first page");
  await throwsWith(() => fetchManuallyEditedIds(fake(edited(1500), { nullDataOnPage: 1 }).client), "no rows returned", "null data, later page");
});

Deno.test("a row without a usable id throws instead of being skipped", async () => {
  const bad = [{ id: "Q1", manually_edited: true }, { id: "", manually_edited: true }] as Row[];
  await throwsWith(() => fetchManuallyEditedIds(fake(bad).client), "row without a usable id", "empty id");
});

Deno.test("a server that ignores the cursor is detected and throws, rather than looping forever", async () => {
  const f = fake(edited(2000), { maxRows: 1000, ignoreCursor: true });
  await throwsWith(() => fetchManuallyEditedIds(f.client), "cursor did not advance", "non-advancing cursor");
  eq(f.queries.length, 2, "stopped on the second page");
});
