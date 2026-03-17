import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "RESEND_API_KEY לא מוגדר" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const targetEmail: string = body.email || Deno.env.get("ADMIN_EMAIL") || "";
    const hoursBack: number = Number(body.hours) || 24;

    if (!targetEmail) return new Response(JSON.stringify({ error: "לא סופקה כתובת מייל" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    const { data: logData, error: logError } = await supabase.from("question_audit_log").select("question_id").gte("changed_at", since);
    if (logError) throw logError;

    const ids = [...new Set((logData ?? []).map((r: Record<string, unknown>) => r.question_id as string))];
    const dateStr = new Date().toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

    if (ids.length === 0) {
      await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "YouShellNotPass <onboarding@resend.dev>", to: [targetEmail], subject: `[YouShellNotPass] אין שאלות ערוכות — ${dateStr}`, html: `<h2>דו"ח יומי</h2><p>לא נערכו שאלות ב-${hoursBack} שעות האחרונות.</p>` }) });
      return new Response(JSON.stringify({ message: "אין שאלות, נשלח מייל סיכום", count: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: questions, error: qError } = await supabase.from("questions").select("id, ref_id, question, a, b, c, d, correct, explanation, topic, year, source, kind, miller, chapter, media_type, media_link").in("id", ids);
    if (qError) throw qError;

    const csvContent = "\uFEFF" + toCSV(questions ?? []);
    const csvBase64 = btoa(unescape(encodeURIComponent(csvContent)));
    const filename = `questions_edited_${new Date().toISOString().slice(0, 10)}.csv`;

    await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "YouShellNotPass <onboarding@resend.dev>", to: [targetEmail], subject: `[YouShellNotPass] ${ids.length} שאלות ערוכות — ${dateStr}`, html: `<h2>דו"ח יומי</h2><p>נערכו ${ids.length} שאלות ב-${hoursBack} השעות האחרונות. מצורף CSV.</p>`, attachments: [{ filename, content: csvBase64 }] }) });

    return new Response(JSON.stringify({ message: "מייל נשלח", count: ids.length, email: targetEmail }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
