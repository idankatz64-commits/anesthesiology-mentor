import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://anesthesiology-mentor.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toIsraelDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

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

    const { period } = await req.json(); // 'day' | 'week'
    const hours = period === "week" ? 168 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Use service role to fetch data
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch answered questions in period
    const { data: historyRows } = await supabaseAdmin
      .from("answer_history")
      .select("question_id, topic, is_correct, answered_at")
      .eq("user_id", user.id)
      .gte("answered_at", since);

    if (!historyRows || historyRows.length === 0) {
      return new Response(JSON.stringify({ text: "לא נמצאו שאלות שנענו בתקופה זו." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get unique question IDs
    const questionIds = [...new Set(historyRows.map((r: any) => r.question_id))];

    // 3. Fetch question text + correct answer from DB (no explanations - keep it short)
    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("id, question_text, correct_answer, topic")
      .in("id", questionIds.slice(0, 100)); // cap at 100 questions

    const questionMap = new Map((questions || []).map((q: any) => [q.id, q]));

    // 4. Aggregate by topic
    const topicMap: Record<string, { correct: number; total: number; questions: string[] }> = {};
    for (const row of historyRows) {
      const topic = row.topic || "ללא נושא";
      if (!topicMap[topic]) topicMap[topic] = { correct: 0, total: 0, questions: [] };
      topicMap[topic].total++;
      if (row.is_correct) topicMap[topic].correct++;
      const q = questionMap.get(row.question_id);
      if (q && topicMap[topic].questions.length < 5) {
        const mark = row.is_correct ? "✓" : "✗";
        topicMap[topic].questions.push(`${mark} ${q.question_text?.slice(0, 120) || ""}...`);
      }
    }

    // 5. Build prompt
    const periodLabel = period === "week" ? "7 הימים האחרונים" : "24 השעות האחרונות";
    const totalQ = historyRows.length;
    const totalCorrect = historyRows.filter((r: any) => r.is_correct).length;
    const accuracy = Math.round((totalCorrect / totalQ) * 100);

    const topicLines = Object.entries(topicMap)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([topic, s]) => {
        const acc = Math.round((s.correct / s.total) * 100);
        const examples = s.questions.map(q => `  - ${q}`).join("\n");
        return `**${topic}** — ${s.total} שאלות, ${acc}% דיוק\n${examples}`;
      })
      .join("\n\n");

    const prompt = `אתה מורה להרדמה מומחה. המתמחה ענה על ${totalQ} שאלות ב${periodLabel} עם דיוק כללי של ${accuracy}%.

להלן פירוט לפי נושאים:

${topicLines}

צור סיכום לימודי קצר ומכוון בעברית רפואית. כלול:
1. הערכה כללית קצרה (משפט אחד)
2. נושאים חזקים (דיוק מעל 70%) — מה עשה טוב
3. נושאים לחיזוק (דיוק מתחת 60%) — מה לחזור עליו ולמה זה קליניקלי חשוב
4. המלצה אחת ספציפית למחר

היה קצר, ישיר, וקליני. אל תחזור על המספרים — הם כבר ידועים. התמקד בתוכן הרפואי.`;

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
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", response.status, errText);
      return new Response(JSON.stringify({ error: "שגיאה בשירות ה-AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const text = aiData.content?.[0]?.text || "לא התקבלה תשובה.";

    return new Response(JSON.stringify({ text, totalQ, accuracy, period }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("ai-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
