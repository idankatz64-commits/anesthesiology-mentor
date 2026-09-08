/** Preserve the section titles authored by the editor alongside their content. */
export function explanationSections(text: string): { title: string; content: string }[] {
  const match = text.match(/^META_TITLES:(.*)\n([\s\S]*)$/);
  if (!match) return [{ title: '', content: text }];
  try {
    const parsed: unknown = JSON.parse(match[1]);
    const titles = Array.isArray(parsed) ? parsed.map(String) : [];
    const parts = match[2].split(/(?:<hr\s*\/?>|\n---\n|\n---$|^---\n)/i).map(part => part.trim()).filter(Boolean);
    return parts.map((content, i) => ({ title: titles[i] ?? '', content }));
  } catch {
    return [{ title: '', content: text }];
  }
}
