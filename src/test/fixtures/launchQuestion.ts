import type { Question } from '@/lib/types';

/** Synthetic UI fixture; never imported into a question bank. */
export const launchQuestion = (id = 'demo-question'): Question => ({
  id, ref_id: id, question: 'שאלת הדגמה בלבד', A: 'אפשרות אלף', B: 'אפשרות בית', C: 'אפשרות גימל', D: 'אפשרות דלת',
  correct: 'A', explanation: 'זהו הסבר הדגמה בלבד', topic: 'Demo', year: '2026', source: '', miller: '', chapter: 0,
  media_type: '', media_link: '', kind: '',
});
