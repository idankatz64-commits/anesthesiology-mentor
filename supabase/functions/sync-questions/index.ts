import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from "https://deno.land/std@0.224.0/csv/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLqVYyyxd2HTiccI520BEhLE29HV0G6BVUkDyKnXNvCJ_c41WZBGJyfLcbGTeRGZr8k2-Uq0VukZg2/pub?gid=1958019419&single=true&output=csv";

function normalizeAnswer(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const map: Record<string, string> = {
    א: "A", ב: "B", ג: "C", ד: "D",
    a: "A", b: "B", c: "C", d: "D",
    A: "A", B: "B", C: "C", D: "D",
    "1": "A", "2": "B", "3": "C", "4": "D",
  };
  return map[trimmed] || trimmed.toUpperCase();
}

function hashId(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).substring(0, 6).toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate caller and verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: not an admin" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = supabaseAdmin;

    // Fetch CSV
    const csvRes = await fetch(SHEET_URL);
    if (!csvRes.ok) {
      throw new Error(`Failed to fetch CSV: ${csvRes.status}`);
    }
    const csvText = await csvRes.text();

    // Use Deno's standard CSV parser which correctly handles quoted multi-line fields
    const rawRows = parse(csvText, {
      skipFirstRow: true,
      columns: undefined, // auto-detect from first row
    });

    // Log headers for debugging
    if (rawRows.length > 0) {
      const headers = Object.keys(rawRows[0]);
      console.log(`CSV headers (${headers.length}):`, headers.join(", "));
    }

    // Normalize headers to lowercase
    const rows: Record<string, string>[] = rawRows.map((row: Record<string, string | undefined>) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key.trim().toLowerCase()] = (value || "").trim();
      }
      return normalized;
    });

    console.log(`Parsed ${rows.length} CSV rows`);

    // Process rows
    const questions: Record<string, unknown>[] = [];
    const now = new Date().toISOString();

    const seenIds = new Set<string>();
    let skippedCount = 0;

    for (const row of rows) {
      const qText = row["question"] || row["questiontext"] || row["q"] || "";
      const correct = row["correct"] || row["correctanswer"] || row["ans"] || "";

      // Skip rows with no question text
      if (!qText.trim()) {
        skippedCount++;
        continue;
      }

      const normalizedCorrect = normalizeAnswer(correct);
      const finalCorrect = normalizedCorrect || correct.trim().toUpperCase();

      let id = row["serial_question_number#"] || row["serial"] || row["id"];
      if (!id || !String(id).trim()) id = hashId(qText);
      id = String(id).trim();

      // Skip duplicate IDs within same sync
      if (seenIds.has(id)) {
        let suffix = 2;
        while (seenIds.has(id + "_" + suffix)) suffix++;
        id = id + "_" + suffix;
      }
      seenIds.add(id);

      const refId = row["questionid"] || row["question_id"] || row["ref_id"] || "N/A";
      const institution = row["institution"] || row["source"] || "N/A";

      questions.push({
        id,
        ref_id: String(refId).trim(),
        question: qText,
        a: row["optiona"] || row["a"] || row["option a"] || "",
        b: row["optionb"] || row["b"] || row["option b"] || "",
        c: row["optionc"] || row["c"] || row["option c"] || "",
        d: row["optiond"] || row["d"] || row["option d"] || "",
        correct: finalCorrect || "",
        explanation: row["explanation"] || row["explanation_correct"] || "",
        topic: row["topic_main"] || row["topic"] || row["main topic"] || "",
        year: row["year"] || "",
        source: institution,
        kind: row["kind"] || row["type"] || "",
        miller: row["miller"] || row["miller page"] || "N/A",
        chapter: parseInt(row["chapter"] || row["topic num"] || "0") || 0,
        media_type: (row["mediakind"] || row["media type"] || "").toLowerCase(),
        media_link: row["medialink"] || row["media link"] || "",
        synced_at: now,
      });
    }

    console.log(`Produced ${questions.length} questions, skipped ${skippedCount} empty rows`);

    if (questions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid questions found in CSV" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get manually edited question IDs to skip them
    const { data: editedRows } = await supabase
      .from("questions")
      .select("id")
      .eq("manually_edited", true);
    const editedIds = new Set((editedRows || []).map((r: { id: string }) => r.id));
    console.log(`Skipping ${editedIds.size} manually edited questions`);

    // Filter out manually edited questions
    const toUpsert = questions.filter((q: any) => !editedIds.has(q.id));

    // Upsert in batches of 200
    let upserted = 0;
    const batchSize = 200;
    for (let i = 0; i < toUpsert.length; i += batchSize) {
      const batch = toUpsert.slice(i, i + batchSize);
      const { error } = await supabase
        .from("questions")
        .upsert(batch, { onConflict: "id" });
      if (error) {
        console.error("Upsert error:", error);
        throw new Error(`Upsert failed: ${error.message}`);
      }
      upserted += batch.length;
    }

    return new Response(
      JSON.stringify({ success: true, count: upserted, synced_at: now }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("Sync error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
