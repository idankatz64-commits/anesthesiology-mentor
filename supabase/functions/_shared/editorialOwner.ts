// Editorial-owner gate for service-role Edge Functions (8.9.2026).
//
// Any handler that writes `questions` or privilege rows with the service key
// must pass this check first. It is deliberately dependency-free so the same
// file runs under Deno (edge) and under the local Deno test with fake clients.
//
// Order: bearer header present → the JWT is verified by GoTrue through the
// user-scoped client (a forged or expired token yields an error) → the
// verified user id is checked against public.editorial_owner through the
// `is_editorial_owner(_uid)` RPC using the service client. Broad is_admin /
// editor never suffices; a missing owner row, a lookup error, or anything that
// is not the literal boolean `true` denies. The helper performs no writes.

export type OwnerCheck =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 | 500; code: "NOT_AUTHENTICATED" | "NOT_OWNER" | "OWNER_LOOKUP_FAILED" };

export interface UserAuthClient {
  auth: { getUser(): Promise<{ data: { user: { id?: string } | null }; error: unknown }> };
}
export interface ServiceRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireEditorialOwner(
  authHeader: string | null,
  userClient: UserAuthClient,
  serviceClient: ServiceRpcClient,
): Promise<OwnerCheck> {
  if (!authHeader || !/^Bearer\s+\S+$/.test(authHeader)) return { ok: false, status: 401, code: "NOT_AUTHENTICATED" };

  let userId: string | undefined;
  try {
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user?.id) return { ok: false, status: 401, code: "NOT_AUTHENTICATED" };
    userId = data.user.id;
  } catch {
    return { ok: false, status: 401, code: "NOT_AUTHENTICATED" };
  }
  if (!UUID.test(userId)) return { ok: false, status: 401, code: "NOT_AUTHENTICATED" };

  try {
    const { data, error } = await serviceClient.rpc("is_editorial_owner", { _uid: userId });
    if (error) return { ok: false, status: 500, code: "OWNER_LOOKUP_FAILED" };
    if (data !== true) return { ok: false, status: 403, code: "NOT_OWNER" };
  } catch {
    return { ok: false, status: 500, code: "OWNER_LOOKUP_FAILED" };
  }
  return { ok: true, userId };
}

export function ownerDenied(check: Extract<OwnerCheck, { ok: false }>, headers: HeadersInit): Response {
  return new Response(JSON.stringify({ error: check.code }), { status: check.status, headers: { ...headers, "Content-Type": "application/json" } });
}
