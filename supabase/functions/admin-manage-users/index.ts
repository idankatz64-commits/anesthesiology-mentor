import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the caller is authenticated and is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Check if caller is admin
    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) throw new Error("Forbidden: not an admin");

    const { action, email, role } = await req.json();

    if (action === "add") {
      if (!email) throw new Error("Email is required");

      // Find auth user by email using admin API with pagination
      let targetUser = null;
      let page = 1;
      const perPage = 100;
      while (!targetUser) {
        const { data: { users: batch }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (listError) throw new Error("Failed to list users: " + listError.message);
        if (!batch || batch.length === 0) break;
        targetUser = batch.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
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
