import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Verify Supabase JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // Optional: restrict to specific user IDs (set ALLOWED_USER_IDS env var to restrict)
    const allowedIds = Deno.env.get("ALLOWED_USER_IDS");
    if (allowedIds) {
      const ids = allowedIds.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (ids.length > 0 && !ids.includes(user.id)) {
        return new Response("Forbidden — AI feature not enabled for this account", { status: 403, headers: corsHeaders });
      }
    }

    const ANTHROPIC_API_KEY = Deno.env.get("supabase-anesthesia") || Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response("ANTHROPIC_API_KEY not configured", { status: 500, headers: corsHeaders });
    }

    const body = await req.json();
    const { messages, systemPrompt } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("messages array is required", { status: 400, headers: corsHeaders });
    }

    const system = systemPrompt || `אתה מדריך מומחה בהרדמה וטיפול נמרץ, עוזר לרופאים מתמחים המתכוננים לבחינת שלב א' ישראלית.
ענה תמיד בעברית, בצורה ברורה וקלינית.
עבור הסברים על שאלות בחינה: תן פירוט מלא של למה התשובה הנכונה נכונה, ולמה כל אחת מהאפשרויות האחרות שגויה.
הדגש נקודות קליניות חשובות, מנמוניקות שימושיות, ו-pearls מעשיים.
שמור על סגנון ישיר וממוקד — כמו מנחה ב-teaching session.`;

    // Call Claude API (non-streaming, returns JSON)
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 2048,
        system,
        messages,
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      return new Response(`Claude API error: ${errText}`, {
        status: claudeResponse.status,
        headers: corsHeaders,
      });
    }

    const claudeData = await claudeResponse.json();
    const content = claudeData?.content?.[0]?.text ?? "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
