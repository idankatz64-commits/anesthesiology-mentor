import { beforeEach, describe, expect, it, vi } from 'vitest';
import { curriculumErrorMessage, fetchCurriculumConfig, parseCurriculumImport, publishCurriculumVersion, sha256Hex } from '@/lib/curriculumRepository';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

const candidate = (n: number) => JSON.stringify({
  source_description: 'synthetic core candidate',
  chapters: Array.from({ length: n }, (_, i) => ({ chapter: i + 1, title: `פרק ${i + 1}` })),
});

describe('curriculum import parsing (draft only, never activation)', () => {
  it('copies every candidate chapter exactly, in order, with its description', () => {
    const parsed = parseCurriculumImport(candidate(42));
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.chapters).toHaveLength(42);
    expect(parsed.chapters[0]).toEqual({ id: 1, title: 'פרק 1' });
    expect(parsed.chapters[41]).toEqual({ id: 42, title: 'פרק 42' });
    expect(parsed.description).toBe('synthetic core candidate');
    expect(JSON.stringify(parsed)).not.toMatch(/priority|deadline|lock|dueDate/);
  });

  it('accepts the {id,title} shape and rejects invalid, empty, duplicate or malformed input', () => {
    expect(parseCurriculumImport('{"chapters":[{"id":3,"title":" נשימה "}]}')).toEqual({ chapters: [{ id: 3, title: 'נשימה' }] });
    expect(parseCurriculumImport('{')).toHaveProperty('error');
    expect(parseCurriculumImport('{"chapters":[]}')).toHaveProperty('error');
    expect(parseCurriculumImport('{"chapters":[{"chapter":1,"title":"a"},{"chapter":1,"title":"b"}]}')).toHaveProperty('error');
    expect(parseCurriculumImport('{"chapters":[{"chapter":0,"title":"a"}]}')).toHaveProperty('error');
    expect(parseCurriculumImport('{"chapters":[{"chapter":2,"title":""}]}')).toHaveProperty('error');
  });

  it('hashes the exact import text for provenance', async () => {
    const text = candidate(3);
    const a = await sha256Hex(text);
    const b = await sha256Hex(text);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(await sha256Hex(text + ' ')).not.toBe(a);
  });

  it('translates server codes and never shows a raw code for NOT_OWNER', () => {
    expect(curriculumErrorMessage(new Error('NOT_OWNER'))).toBe('פרסום גרסת ליבה שמור לבעלים העריכתי בלבד.');
    expect(curriculumErrorMessage(new Error('DUPLICATE_VERSION'))).toMatch(/כבר קיימת גרסה/);
    expect(curriculumErrorMessage(new Error('boom'))).toMatch(/לא הושלמה/);
  });
});

describe('curriculum publish — atomic compare-and-set from the client', () => {
  beforeEach(() => rpc.mockReset());

  it('sends the expected active version and the exact draft content hash the UI loaded', async () => {
    rpc.mockResolvedValue({ data: { version: 'v2', status: 'approved', chapters: [{ chapter: 1, title: 'a' }], content_hash: 'h2' }, error: null });
    const published = await publishCurriculumVersion('v2', 'v1', 'h2');
    expect(rpc).toHaveBeenCalledWith('curriculum_publish', { _version: 'v2', _expected_active: 'v1', _expected_hash: 'h2' });
    expect(published).toMatchObject({ version: 'v2', status: 'approved', contentHash: 'h2' });
  });

  it('never publishes without a content hash (stale or partial draft view) and surfaces STALE_CONFIG as a refresh request', async () => {
    await expect(publishCurriculumVersion('v2', 'v1', null)).rejects.toThrow('STALE_CONFIG');
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { message: 'STALE_CONFIG' } });
    await expect(publishCurriculumVersion('v2', 'v1', 'old-hash')).rejects.toThrow('STALE_CONFIG');
    expect(curriculumErrorMessage(new Error('STALE_CONFIG'))).toMatch(/רעננו/);
    expect(curriculumErrorMessage(new Error('NOT_CONFIGURED'))).toMatch(/אין עדיין/);
  });

  it('reads the content hash of the draft and every version so the publish guard has exact identities', async () => {
    rpc.mockResolvedValue({ data: {
      approved: { version: 'v1', status: 'approved', chapters: [{ chapter: 1, title: 'a' }], content_hash: 'h1' },
      draft: { version: 'v2', status: 'draft', chapters: [{ chapter: 1, title: 'b' }], content_hash: 'h2' },
      can_edit: false, can_publish: true,
      versions: [{ version: 'v2', status: 'draft', created_at: '2026-09-08', approved_at: null, chapter_count: 1, content_hash: 'h2' }],
    }, error: null });
    const state = await fetchCurriculumConfig();
    expect(state.approved?.contentHash).toBe('h1');
    expect(state.draft && 'contentHash' in state.draft ? state.draft.contentHash : null).toBe('h2');
    expect(state.versions[0].contentHash).toBe('h2');
  });
});
