import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ownerDenied, requireEditorialOwner } from "../_shared/editorialOwner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://anesthesiology-mentor.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only the configured editorial owner may add admins/editors. The caller's
    // JWT is verified by GoTrue first (verify_jwt is off for this function);
    // broad is_admin / editor status never suffices, and the old "editor can
    // add editors" branch is gone: that was a privilege-granting path open to
    // every admin_users row. Denial happens before the body is read.
    const authHeader = req.headers.get("Authorization");
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader ?? "" } } }
    );
    const owner = await requireEditorialOwner(authHeader, supabaseUser, supabaseAdmin);
    if (!owner.ok) return ownerDenied(owner, corsHeaders);

    const { action, email, role } = await req.json();

    if (action === "add") {
      if (!email) throw new Error("Email is required");

      if (role !== undefined && role !== "admin" && role !== "editor") throw new Error("Invalid role");

      // Find auth user by email using admin API with pagination
      let targetUser = null;
      let page = 1;
      const perPage = 100;
      while (!targetUser) {
        const { data: { users: batch }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (listError) throw new Error("Failed to list users: " + listError.message);
        if (!batch || batch.length === 0) break;
        targetUser = batch.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (batch.length < perPage) break;
        page++;
      }
      if (!targetUser) {
        throw new Error("משתמש עם אימייל זה לא נמצא במערכת. המשתמש חייב להירשם קודם.");
      }

      // Check if already admin
      const { data: existing } = await supabaseAdmin
        .from("admin_users")
        .select("id")
        .eq("id", targetUser.id)
        .maybeSingle();

      if (existing) throw new Error("המשתמש כבר קיים כאדמין");

      const { error: insertError } = await supabaseAdmin
        .from("admin_users")
        .insert({ id: targetUser.id, email: targetUser.email!, role: role || "editor" });

      if (insertError) throw new Error("Insert failed: " + insertError.message);

      return new Response(
        JSON.stringify({ success: true, userId: targetUser.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Unknown action: " + action);
  } catch (err: unknown) {
    console.error("admin-manage-users error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
