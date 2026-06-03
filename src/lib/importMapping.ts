import { hashId } from "./questionId";

export type MappedQuestion = {
  id: string;
  question: string;
  a: string;
  b: string;
  c: string;
  d: string;
  correct: string;
  explanation: string;
  topic: string;
  year: string;
  ref_id: string;
  source: string;
  kind: string;
  miller: string;
  chapter: string;
  media_type: string;
  media_link: string;
  manually_edited: boolean;
};

/**
 * Normalize a raw CSV row into a question record, resolving header aliases and
 * lowercasing/trimming keys. Returns null when the question text is missing.
 * The id falls back to hashId(question) when no id/serial column is present.
 * Extracted verbatim from ImportQuestionsTab so the ingestion contract is testable.
 */
export function mapImportRow(row: Record<string, string>): MappedQuestion | null {
  const lowerRow: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) lowerRow[k.trim().toLowerCase()] = (v || "").trim();

  const q = lowerRow["question"] || lowerRow["questiontext"] || "";
  if (!q) return null;

  const id = lowerRow["id"] || lowerRow["serial_question_number#"] || lowerRow["serial"] || hashId(q);
  const correct = (lowerRow["correct"] || lowerRow["correctanswer"] || "").toUpperCase();

  return {
    id: String(id).trim(),
    question: q,
    a: lowerRow["a"] || lowerRow["optiona"] || "",
    b: lowerRow["b"] || lowerRow["optionb"] || "",
    c: lowerRow["c"] || lowerRow["optionc"] || "",
    d: lowerRow["d"] || lowerRow["optiond"] || "",
    correct: correct || "A",
    explanation: lowerRow["explanation"] || lowerRow["explanation_correct"] || "",
    topic: lowerRow["topic"] || lowerRow["topic_main"] || "",
    year: lowerRow["year"] || "",
    ref_id: lowerRow["ref_id"] || lowerRow["questionid"] || lowerRow["question_id"] || "",
    source: lowerRow["source"] || lowerRow["institution"] || "",
    kind: lowerRow["kind"] || lowerRow["type"] || "",
    miller: lowerRow["miller"] || lowerRow["miller_page"] || "",
    chapter: lowerRow["chapter"] || lowerRow["topic_num"] || "",
    media_type: lowerRow["media_type"] || lowerRow["mediakind"] || "",
    media_link: lowerRow["media_link"] || lowerRow["medialink"] || "",
    manually_edited: true,
  };
}

/** Keep only the first occurrence of each id (stable de-duplication). */
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
