

## Cleanup: Remove Study Rooms, Weekly Plan, and Matot Report

### Files to DELETE (4 files)
- `src/components/views/StudyRoomView.tsx`
- `src/components/views/WeeklyPlanView.tsx`
- `src/components/views/AICoachView.tsx`
- `src/lib/studyRoomUtils.ts`

### Files to EDIT (6 files)

**1. `src/lib/types.ts`** — Remove `'weekly-plan' | 'ai-coach' | 'study-room'` from `ViewId` type. Remove `WeeklyDay` type and `plan` from `UserProgress`.

**2. `src/pages/Index.tsx`** — Remove imports and `case` branches for `WeeklyPlanView`, `AICoachView`, `StudyRoomView`.

**3. `src/components/Sidebar.tsx`** — Remove nav items for `weekly-plan`, `ai-coach`, `study-room`. Remove unused icon imports (`CalendarDays`, `ClipboardCheck`, `Users`).

**4. `src/components/MobileHeader.tsx`** — Remove `weekly-plan` and `ai-coach` entries from `mobileNav`.

**5. `src/components/MobileBottomNav.tsx`** — Remove `study-room` entry and `Users` icon import.

**6. `src/contexts/AppContext.tsx`** — Remove `generateWeeklyPlan` function (~50 lines), its type declaration, and its inclusion in the context value. Remove `plan` from progress hydration/state if referenced. Keep all other state intact.

### Files to LEAVE (no DB drops)
- `supabase/functions/matot-report/index.ts` — edge function stays deployed but is unused (no frontend calls it). Can be deleted later if desired.
- All Supabase tables (`study_rooms`, `room_participants`, `room_answers`, `user_weekly_plans`) remain untouched per request.

### Execution order
1. Delete the 4 view/util files
2. Edit types, then context, then navigation components, then Index

