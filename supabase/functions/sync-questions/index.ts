import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Parse all fields respecting quoted multi-line fields
  const allFields: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"' && normalized[i + 1] === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = "";
      } else if (ch === '\n') {
        currentRow.push(currentField);
        currentField = "";
        allFields.push(currentRow);
        currentRow = [];
      } else {
        currentField += ch;
      }
    }
  }
  // Push last field and row
  currentRow.push(currentField);
  if (currentRow.some(f => f.trim())) allFields.push(currentRow);

  if (allFields.length < 2) return [];

  const headers = allFields[0].map(h => h.trim().toLowerCase());

  for (let i = 1; i < allFields.length; i++) {
    const values = allFields[i];
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) row[h] = (values[idx] || "").trim();
    });
    rows.push(row);
  }

  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch CSV
    const csvRes = await fetch(SHEET_URL);
    if (!csvRes.ok) {
      throw new Error(`Failed to fetch CSV: ${csvRes.status}`);
    }
    const csvText = await csvRes.text();
    const rawRows = parseCSV(csvText);

    // Process rows
    const questions: Record<string, unknown>[] = [];
    const now = new Date().toISOString();

    const seenIds = new Set<string>();
    let skippedCount = 0;

    for (const row of rawRows) {
      const qText = row["question"] || row["questiontext"] || row["q"] || "";
      const correct = row["correct"] || row["correctanswer"] || row["ans"] || "";

      // Skip rows with no question text
      if (!qText.trim()) {
        skippedCount++;
        continue;
      }

      const normalizedCorrect = normalizeAnswer(correct);
      // Accept any non-empty correct value (don't require A/B/C/D)
      const finalCorrect = normalizedCorrect || correct.trim().toUpperCase();

      let id = row["serial_question_number#"] || row["serial"] || row["id"];
      if (!id || !String(id).trim()) id = hashId(qText);
      id = String(id).trim();

      // Skip duplicate IDs within same sync
      if (seenIds.has(id)) {
        // Append a suffix to make it unique
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

    console.log(`Parsed ${rawRows.length} CSV rows, produced ${questions.length} questions, skipped ${skippedCount} empty rows`);

    if (questions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid questions found in CSV" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert in batches of 100
    let upserted = 0;
    const batchSize = 100;
    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize);
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
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
