// deno test supabase/functions/_shared  — no imports, no network.
import { requireEditorialOwner } from "./editorialOwner.ts";

const OWNER = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const ADMIN = "44444444-4444-4444-4444-444444444444";
const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

// Fake clients: `writes` counts anything that would be a side effect; `rpcCalls` records lookups.
function fakes(opts: { user?: { id?: string } | null; authError?: unknown; authThrows?: boolean; owner?: unknown; rpcError?: unknown; rpcThrows?: boolean }) {
  const rpcCalls: unknown[] = [];
  let writes = 0;
  const userClient = {
    auth: {
      getUser: async () => {
        if (opts.authThrows) throw new Error("network");
        return { data: { user: opts.user === undefined ? null : opts.user }, error: opts.authError ?? null };
      },
    },
  };
  const serviceClient = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args]);
      if (opts.rpcThrows) throw new Error("db down");
      return { data: opts.owner, error: opts.rpcError ?? null };
    },
    from: () => { writes++; throw new Error("write attempted"); },
  };
  return { userClient, serviceClient, rpcCalls, writes: () => writes };
}
const BEARER = "Bearer eyJ.fake.jwt";

Deno.test("owner with a verified JWT is allowed and the lookup uses the verified id, not anything from the request", async () => {
  const f = fakes({ user: { id: OWNER }, owner: true });
  eq(await requireEditorialOwner(BEARER, f.userClient, f.serviceClient), { ok: true, userId: OWNER }, "owner");
  eq(f.rpcCalls, [["is_editorial_owner", { _uid: OWNER }]], "lookup by verified id");
});

Deno.test("admin / editor / contributor / approved resident with a valid JWT are denied 403 when not the owner", async () => {
  for (const id of [ADMIN, "55555555-5555-5555-5555-555555555555", "22222222-2222-2222-2222-222222222222", "11111111-1111-1111-1111-111111111111"]) {
    const f = fakes({ user: { id }, owner: false });
    eq(await requireEditorialOwner(BEARER, f.userClient, f.serviceClient), { ok: false, status: 403, code: "NOT_OWNER" }, id);
    eq(f.writes(), 0, "no side effect");
  }
});

Deno.test("anonymous / missing / malformed bearer is denied 401 before any lookup", async () => {
  for (const h of [null, "", "Bearer", "Bearer ", "Basic abc", "token eyJ"]) {
    const f = fakes({ user: { id: OWNER }, owner: true });
    eq(await requireEditorialOwner(h, f.userClient, f.serviceClient), { ok: false, status: 401, code: "NOT_AUTHENTICATED" }, String(h));
    eq(f.rpcCalls.length, 0, "no lookup");
  }
});

Deno.test("forged or expired JWT (GoTrue rejects it) is denied 401 even if the owner lookup would say yes", async () => {
  for (const f of [fakes({ authError: { message: "invalid JWT" }, owner: true }), fakes({ user: null, owner: true }), fakes({ authThrows: true, owner: true }), fakes({ user: { id: "not-a-uuid" }, owner: true })]) {
    eq(await requireEditorialOwner(BEARER, f.userClient, f.serviceClient), { ok: false, status: 401, code: "NOT_AUTHENTICATED" }, "forged");
    eq(f.rpcCalls.length, 0, "no lookup");
    eq(f.writes(), 0, "no side effect");
  }
});

Deno.test("owner lookup error or exception is denied 500 (fail closed), never allowed", async () => {
  for (const f of [fakes({ user: { id: OWNER }, rpcError: { message: "permission denied" } }), fakes({ user: { id: OWNER }, rpcThrows: true })]) {
    eq(await requireEditorialOwner(BEARER, f.userClient, f.serviceClient), { ok: false, status: 500, code: "OWNER_LOOKUP_FAILED" }, "lookup error");
    eq(f.writes(), 0, "no side effect");
  }
});

Deno.test("anything but the literal boolean true from the lookup is denied (null owner row, string, object)", async () => {
  for (const owner of [null, undefined, "true", 1, { owner: true }, [true]]) {
    const f = fakes({ user: { id: OWNER }, owner });
    eq(await requireEditorialOwner(BEARER, f.userClient, f.serviceClient), { ok: false, status: 403, code: "NOT_OWNER" }, JSON.stringify(owner));
  }
});
