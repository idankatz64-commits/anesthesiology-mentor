import type { Question } from '@/lib/types';
import { KEYS } from '@/lib/types';

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function pickQuestionsForRoom(
  data: Question[],
  topics: Set<string>,
  count: number,
  randomMix: boolean,
): string[] {
  let pool = data;

  if (!topics.has('all') && topics.size > 0) {
    pool = pool.filter(q => topics.has(q[KEYS.TOPIC]));
  }

  if (randomMix) {
    pool = [...pool].sort(() => Math.random() - 0.5);
  }

  return pool.slice(0, count).map(q => q[KEYS.ID]);
}
