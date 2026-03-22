import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://anesthesiology-mentor.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { period } = await req.json();
    const hours = period === "week" ? 168 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch answered questions in period
    const { data: historyRows } = await supabaseAdmin
      .from("answer_history")
      .select("question_id, topic, is_correct")
      .eq("user_id", user.id)
      .gte("answered_at", since);

    if (!historyRows || historyRows.length === 0) {
      return new Response(JSON.stringify({ text: "לא נמצאו שאלות שנענו בתקופה זו." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get unique question IDs (cap at 80)
    const questionIds = [...new Set(historyRows.map((r: any) => r.question_id))].slice(0, 80);

    // 3. Fetch question text + explanation
    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("id, question_text, correct_answer, explanation, topic")
      .in("id", questionIds);

    const questionMap = new Map((questions || []).map((q: any) => [q.id, q]));

    // 4. Group by topic — collect explanations
    const topicMap: Record<string, { explanations: string[]; missed: string[] }> = {};

    for (const row of historyRows) {
      const topic = row.topic || "ללא נושא";
      if (topic === "#N/A" || topic === "N/A") continue; // skip uncategorized
      if (!topicMap[topic]) topicMap[topic] = { explanations: [], missed: [] };

      const q = questionMap.get(row.question_id);
      if (!q) continue;

      const explanation = q.explanation?.replace(/<[^>]*>/g, '').trim(); // strip HTML
      if (explanation && explanation.length > 20 && topicMap[topic].explanations.length < 6) {
        topicMap[topic].explanations.push(explanation.slice(0, 400));
      }
      if (!row.is_correct && topicMap[topic].missed.length < 3) {
        topicMap[topic].missed.push(q.question_text?.slice(0, 100) || "");
      }
    }

    // 5. Build prompt — real medical content
    const periodLabel = period === "week" ? "7 הימים האחרונים" : "24 השעות האחרונות";

    const topicSections = Object.entries(topicMap)
      .filter(([, s]) => s.explanations.length > 0)
      .slice(0, 8) // max 8 topics
      .map(([topic, s]) => {
        const expText = s.explanations.join("\n---\n");
        const missedText = s.missed.length > 0
          ? `\nשאלות שנכשל בהן:\n${s.missed.map(m => `- ${m}`).join("\n")}`
          : "";
        return `=== נושא: ${topic} ===\n${expText}${missedText}`;
      })
      .join("\n\n");

    if (!topicSections) {
      return new Response(JSON.stringify({ text: "אין הסברים זמינים לשאלות שנענו בתקופה זו." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `אתה מורה להרדמה מומחה. להלן הסברים לשאלות שמתמחה ענה עליהן ב${periodLabel}.

${topicSections}

צור סיכום לימודי קליני לפי נושאים. לכל נושא:
- כותרת הנושא
- 2-3 נקודות מפתח קליניות שעולות מהחומר (לא סטטיסטיקה — תוכן רפואי)
- אם היו שאלות שנכשל — ציין את הנקודה הספציפית שצריך לחזק

כתוב בעברית רפואית. היה קצר וממוקד. אל תכתוב מבוא ואל תסכם בסוף.`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic error:", response.status, await response.text());
      return new Response(JSON.stringify({ error: "שגיאה בשירות ה-AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const text = aiData.content?.[0]?.text || "לא התקבלה תשובה.";

    return new Response(JSON.stringify({ text, period }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("ai-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
