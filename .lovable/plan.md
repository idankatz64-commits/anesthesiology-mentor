

## Stats Summary Widget — Corrected Plan

### New file: `src/components/stats/HomeStatsSummary.tsx`
- On mount, get authenticated user, then run 2 parallel queries:
  1. `supabase.from('user_answers').select('is_correct').eq('user_id', uid)` — count total rows and filter `is_correct === true` client-side
  2. `supabase.from('spaced_repetition').select('id', { count: 'exact', head: true }).eq('user_id', uid).lte('next_review_date', todayDateString)`
- Derive: `totalAnswered = rows.length`, `correctCount = rows.filter(r => r.is_correct).length`, `accuracy = total > 0 ? Math.round(correct/total*100) : 0`
- Render 3-column grid with `liquid-glass p-5 text-center` cards (matching existing DB Status section)
- Use `AnimatedNumber` for values, `Skeleton` while loading
- Icons: `CheckCircle` (total answered), `Target` (accuracy with color: green ≥70, yellow ≥50, red <50), `CalendarClock` (due for review)

### Edit: `src/components/views/HomeView.tsx`
- Import `HomeStatsSummary`
- Insert between mode cards `</motion.div>` and the DB Status section, with header "סיכום אישי"

