// Clinical-domain grouping of Miller 10e chapters for the academy weakness
// profile. 120 baseline questions cannot resolve 87 chapters, so aggregation
// happens at these 12 domains (design doc §4).
export interface AcademyDomain {
  id: string;
  label: string;
  chapters: number[];
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const ACADEMY_DOMAINS: AcademyDomain[] = [
  { id: "foundations", label: "יסודות המקצוע", chapters: [...range(1, 9), 26, 27, ...range(84, 87)] },
  { id: "physiology", label: "פיזיולוגיה", chapters: range(10, 15) },
  { id: "pharmacology", label: "פרמקולוגיה", chapters: range(16, 25) },
  { id: "preop", label: "הערכה טרום-ניתוחית ומחלות נלוות", chapters: [...range(28, 31), 61] },
  { id: "monitoring", label: "ניטור", chapters: [...range(32, 37), 39] },
  { id: "airway-regional", label: "נתיב אוויר והרדמה אזורית", chapters: range(40, 42) },
  { id: "fluids-blood", label: "נוזלים, דם וקרישה", chapters: [38, ...range(43, 46)] },
  { id: "pain", label: "כאב ופליאציה", chapters: [47, 48, 77] },
  { id: "subspecialty", label: "הרדמה תת-התמחותית", chapters: [...range(49, 57), 60, ...range(65, 69)] },
  { id: "obstetrics", label: "מיילדות", chapters: [58, 59] },
  { id: "pediatrics", label: "ילדים", chapters: range(72, 75) },
  {
    id: "icu-emergency",
    label: "טיפול נמרץ, החייאה וחירום",
    chapters: [...range(62, 64), 70, 71, 76, ...range(78, 83)],
  },
];

export const UNCLASSIFIED_DOMAIN = "לא מסווג";

const CHAPTER_TO_LABEL: Record<number, string> = {};
for (const d of ACADEMY_DOMAINS) {
  for (const ch of d.chapters) CHAPTER_TO_LABEL[ch] = d.label;
}

export function domainOfChapter(chapter: number | null | undefined): string {
  if (!chapter) return UNCLASSIFIED_DOMAIN;
  return CHAPTER_TO_LABEL[chapter] ?? UNCLASSIFIED_DOMAIN;
}
