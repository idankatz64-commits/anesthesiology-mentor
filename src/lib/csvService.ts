import Papa from 'papaparse';
import { SHEET_URL, KEYS, type Question } from './types';

function hashId(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(16).substring(0, 6).toUpperCase();
}

/** Normalize Hebrew answer letters to Latin A-D */
export function normalizeAnswer(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const map: Record<string, string> = {
    'א': 'A', 'ב': 'B', 'ג': 'C', 'ד': 'D',
    'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D',
    'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D',
    '1': 'A', '2': 'B', '3': 'C', '4': 'D',
  };
  return map[trimmed] || trimmed.toUpperCase();
}

export async function fetchQuestions(): Promise<Question[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(SHEET_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const questions = processRawData(res.data as Record<string, string>[]);
        resolve(questions);
      },
      error: (err) => {
        console.error('CSV fetch error:', err);
        reject(err);
      },
    });
  });
}

function processRawData(rows: Record<string, string>[]): Question[] {
  return rows
    .map((rawRow) => {
      const row: Record<string, string> = {};
      Object.keys(rawRow).forEach(key => {
        if (key) row[key.trim().toLowerCase()] = rawRow[key];
      });

      const qText = row['question'] || row['questiontext'] || row['q'];
      const correct = row['correct'] || row['correctanswer'] || row['ans'];
      if (!qText || !correct) return null;

      const normalizedCorrect = normalizeAnswer(correct);
      if (!normalizedCorrect || !['A', 'B', 'C', 'D'].includes(normalizedCorrect)) return null;

      let id = row['serial_question_number#'] || row['serial'] || row['id'];
      if (!id) id = hashId(qText);

      const refId = row['questionid'] || row['question_id'] || row['ref_id'] || 'N/A';
      const institution = row['institution'] || row['source'] || 'N/A';

      return {
        [KEYS.ID]: String(id).trim(),
        [KEYS.REF_ID]: String(refId).trim(),
        [KEYS.QUESTION]: qText,
        [KEYS.A]: row['optiona'] || row['a'] || row['option a'] || '',
        [KEYS.B]: row['optionb'] || row['b'] || row['option b'] || '',
        [KEYS.C]: row['optionc'] || row['c'] || row['option c'] || '',
        [KEYS.D]: row['optiond'] || row['d'] || row['option d'] || '',
        [KEYS.CORRECT]: normalizedCorrect,
        [KEYS.EXPLANATION]: row['explanation'] || row['explanation_correct'] || '',
        [KEYS.TOPIC]: row['topic_main'] || row['topic'] || row['main topic'] || '',
        [KEYS.YEAR]: row['year'] || '',
        [KEYS.SOURCE]: institution,
        [KEYS.MILLER]: row['miller'] || row['miller page'] || 'N/A',
        [KEYS.CHAPTER]: parseInt(row['chapter'] || row['topic num'] || '0') || 0,
        [KEYS.MEDIA_TYPE]: (row['mediakind'] || row['media type'] || '').toLowerCase(),
        [KEYS.MEDIA_LINK]: row['medialink'] || row['media link'] || '',
        [KEYS.KIND]: row['kind'] || row['type'] || '',
      } as Question;
    })
    .filter((x): x is Question => x !== null);
}
