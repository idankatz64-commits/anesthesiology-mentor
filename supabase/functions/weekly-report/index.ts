import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://anesthesiology-mentor.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Squid Game HTML template ────────────────────────────────────────────────

function buildHTML(questions: Record<string, unknown>[], generatedAt: string, daysBack: number): string {
  const count = questions.length;

  const rows = questions.map((q, i) => {
    const topic = String(q.topic || "—");
    const chapter = q.chapter ? `פרק ${q.chapter}` : "—";
    const question = String(q.question || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const explanation = String(q.explanation || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const correct = String(q.correct || "").toUpperCase();
    const options = ["A", "B", "C", "D"].map((letter) => {
      const val = String((q as Record<string, unknown>)[letter.toLowerCase()] || "").replace(/</g, "&lt;");
      const isCorrect = letter === correct;
      return `<div class="option ${isCorrect ? "correct" : ""}">
        <span class="opt-label">${letter}</span>
        <span class="opt-text">${val}</span>
        ${isCorrect ? '<span class="badge-correct">✓ נכון</span>' : ""}
      </div>`;
    }).join("");

    return `
    <div class="question-card" data-index="${i + 1}">
      <div class="card-header">
        <div class="q-number">
          <span class="shape triangle"></span>
          ${i + 1}
        </div>
        <div class="meta-tags">
          <span class="tag topic-tag">${topic}</span>
          <span class="tag chapter-tag">${chapter}</span>
        </div>
      </div>
      <div class="question-text">${question}</div>
      <div class="options">${options}</div>
      ${explanation ? `<details class="explanation">
        <summary><span class="shape square"></span> הסבר</summary>
        <div class="explanation-body">${explanation}</div>
      </details>` : ""}
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>YouShellNotPass — דוח שבועי</title>
<style>
  :root {
    --pink: #E31C64;
    --pink-light: #ff4d8d;
    --dark: #0d0d0d;
    --card-bg: #161616;
    --border: #2a2a2a;
    --text: #f0f0f0;
    --text-muted: #888;
    --green: #00e676;
    --teal: #1de9b6;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    background: var(--dark);
    color: var(--text);
    direction: rtl;
    min-height: 100vh;
  }

  /* ── Header ── */
  .hero {
    background: linear-gradient(135deg, #0d0d0d 0%, #1a0011 50%, #0d0d0d 100%);
    border-bottom: 2px solid var(--pink);
    padding: 40px 20px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 50%, rgba(227,28,100,0.08) 0%, transparent 70%);
  }
  .hero-shapes {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-bottom: 20px;
  }
  .shape-big {
    width: 36px; height: 36px;
    opacity: 0.7;
  }
  .shape-circle { border-radius: 50%; background: var(--pink); }
  .shape-triangle-big {
    width: 0; height: 0;
    border-left: 18px solid transparent;
    border-right: 18px solid transparent;
    border-bottom: 36px solid var(--pink);
    background: transparent;
  }
  .shape-square-big { background: var(--pink); }

  .hero h1 {
    font-size: 2.2em;
    font-weight: 900;
    letter-spacing: -0.5px;
    color: #fff;
    position: relative;
  }
  .hero h1 span { color: var(--pink); }
  .hero-sub {
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 0.95em;
    position: relative;
  }
  .hero-stats {
    display: flex;
    justify-content: center;
    gap: 32px;
    margin-top: 24px;
    position: relative;
  }
  .stat-box {
    text-align: center;
    background: rgba(227,28,100,0.08);
    border: 1px solid rgba(227,28,100,0.3);
    border-radius: 12px;
    padding: 12px 24px;
  }
  .stat-box .num {
    font-size: 2em;
    font-weight: 900;
    color: var(--pink);
    line-height: 1;
  }
  .stat-box .label { font-size: 0.8em; color: var(--text-muted); margin-top: 4px; }

  /* ── Container ── */
  .container { max-width: 900px; margin: 0 auto; padding: 32px 16px; }

  /* ── Question Card ── */
  .question-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 20px;
    transition: border-color 0.2s;
  }
  .question-card:hover { border-color: rgba(227,28,100,0.4); }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .q-number {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.1em;
    font-weight: 700;
    color: var(--pink);
    min-width: 40px;
  }

  /* ── Shapes ── */
  .shape {
    display: inline-block;
    width: 14px; height: 14px;
    flex-shrink: 0;
  }
  .shape.circle { border-radius: 50%; background: var(--pink); }
  .shape.triangle {
    width: 0; height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-bottom: 14px solid var(--pink);
    background: transparent;
  }
  .shape.square { background: var(--pink); }

  .meta-tags { display: flex; gap: 8px; flex-wrap: wrap; }
  .tag {
    font-size: 0.75em;
    padding: 3px 10px;
    border-radius: 20px;
    font-weight: 600;
  }
  .topic-tag { background: rgba(227,28,100,0.12); color: var(--pink-light); border: 1px solid rgba(227,28,100,0.3); }
  .chapter-tag { background: rgba(29,233,182,0.08); color: var(--teal); border: 1px solid rgba(29,233,182,0.2); }

  .question-text {
    font-size: 1.05em;
    line-height: 1.7;
    margin-bottom: 16px;
    color: #eee;
  }

  .options { display: flex; flex-direction: column; gap: 8px; }
  .option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    font-size: 0.93em;
  }
  .option.correct {
    background: rgba(0,230,118,0.06);
    border-color: rgba(0,230,118,0.3);
  }
  .opt-label {
    font-weight: 700;
    color: var(--pink);
    min-width: 20px;
  }
  .option.correct .opt-label { color: var(--green); }
  .opt-text { flex: 1; color: #ddd; }
  .badge-correct {
    font-size: 0.75em;
    color: var(--green);
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid rgba(0,230,118,0.3);
    background: rgba(0,230,118,0.06);
  }

  /* ── Explanation ── */
  .explanation {
    margin-top: 16px;
    border: 1px solid rgba(227,28,100,0.2);
    border-radius: 10px;
    overflow: hidden;
  }
  .explanation summary {
    cursor: pointer;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    color: var(--pink);
    font-size: 0.9em;
    background: rgba(227,28,100,0.05);
    user-select: none;
  }
  .explanation summary:hover { background: rgba(227,28,100,0.1); }
  .explanation-body {
    padding: 14px 16px;
    font-size: 0.92em;
    line-height: 1.7;
    color: #ccc;
    border-top: 1px solid rgba(227,28,100,0.15);
  }

  /* ── Footer ── */
  .footer {
    text-align: center;
    padding: 32px 16px;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.85em;
  }
  .footer strong { color: var(--pink); }

  @media print {
    body { background: white; color: black; }
    .question-card { border: 1px solid #ccc; break-inside: avoid; }
    .hero { background: white; border-bottom: 2px solid #E31C64; }
  }
</style>
</head>
<body>

<div class="hero">
  <div class="hero-shapes">
    <div class="shape-big shape-circle"></div>
    <div class="shape-big shape-triangle-big"></div>
    <div class="shape-big shape-square-big"></div>
  </div>
  <h1>You<span>Shell</span>NotPass</h1>
  <div class="hero-sub">שאלות עם הסברים חדשים — ${daysBack} ימים אחרונים · ${generatedAt}</div>
  <div class="hero-stats">
    <div class="stat-box">
      <div class="num">${count}</div>
      <div class="label">שאלות עודכנו</div>
    </div>
  </div>
</div>

<div class="container">
${rows}
</div>

<div class="footer">
  נוצר אוטומטית על ידי <strong>YouShellNotPass</strong> · שלב א׳ בהרדמה
</div>

</body>
</html>`;
}

// ── CSV builder ──────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = ["id", "question", "a", "b", "c", "d", "correct", "explanation", "topic", "chapter", "year", "source"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const daysBack: number = Number(body.days) || 7;
    const format: string = body.format || "html"; // "html" | "csv" | "both"

    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    // Get question IDs that had explanation changes in the last N days
    const { data: auditRows, error: auditErr } = await supabase
      .from("question_audit_log")
      .select("question_id")
      .eq("field_changed", "explanation")
      .gte("changed_at", since);

    if (auditErr) throw new Error(`Audit query failed: ${auditErr.message}`);

    const questionIds = [...new Set((auditRows || []).map((r) => r.question_id))];

    if (questionIds.length === 0) {
      return new Response(
        JSON.stringify({ message: `אין שאלות עם הסברים חדשים ב-${daysBack} הימים האחרונים` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch full question data
    const { data: questions, error: qErr } = await supabase
      .from("questions")
      .select("id, question, a, b, c, d, correct, explanation, topic, chapter, year, source, miller")
      .in("id", questionIds)
      .order("topic");

    if (qErr) throw new Error(`Questions query failed: ${qErr.message}`);

    const generatedAt = new Date().toLocaleDateString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "numeric", month: "long", year: "numeric"
    });

    if (format === "csv") {
      const csv = toCSV(questions || []);
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="weekly_questions_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // Default: HTML (Squid Game theme)
    const html = buildHTML(questions || [], generatedAt, daysBack);
    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
