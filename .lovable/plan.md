

# Shared Study Room -- תרגול משותף (Corrected)

## Correction Applied
The `questions.id` column is of type **text**. Therefore `study_rooms.question_ids` will be `text[]` (not integer[] or uuid[]).

## Step 1: Database Migration

Create 3 new tables with RLS policies:

**`study_rooms`**
- `id` uuid PK default gen_random_uuid()
- `room_code` text UNIQUE NOT NULL (6-char uppercase alphanumeric)
- `created_by` uuid NOT NULL
- `status` text NOT NULL DEFAULT 'waiting' (waiting | active | finished)
- `question_ids` **text[]** NOT NULL (matches questions.id type)
- `current_question_index` integer NOT NULL DEFAULT 0
- `created_at` timestamptz DEFAULT now()
- `expires_at` timestamptz DEFAULT now() + interval '24 hours'

**`room_participants`**
- `id` uuid PK default gen_random_uuid()
- `room_id` uuid NOT NULL REFERENCES study_rooms ON DELETE CASCADE
- `user_id` uuid NOT NULL
- `display_name` text NOT NULL
- `joined_at` timestamptz DEFAULT now()
- `is_ready` boolean DEFAULT false
- `last_active_at` timestamptz DEFAULT now()
- UNIQUE (room_id, user_id)

**`room_answers`**
- `id` uuid PK default gen_random_uuid()
- `room_id` uuid NOT NULL REFERENCES study_rooms ON DELETE CASCADE
- `question_index` integer NOT NULL
- `user_id` uuid NOT NULL
- `selected_answer` text NOT NULL (A/B/C/D)
- `is_correct` boolean NOT NULL
- `answered_at` timestamptz DEFAULT now()
- UNIQUE (room_id, question_index, user_id)

**RLS Policies:**
- `study_rooms`: SELECT for participants (join to room_participants where user_id = auth.uid()), INSERT for authenticated, UPDATE for creator only
- `room_participants`: SELECT/INSERT/UPDATE/DELETE scoped to rooms user participates in
- `room_answers`: INSERT own answers, SELECT for rooms user participates in

Enable realtime on all 3 tables.

## Step 2: Types Update

In `src/lib/types.ts`:
- Add `'study-room'` to `ViewId` union
- Add types: `StudyRoom`, `RoomParticipant`, `RoomAnswer`

## Step 3: Navigation

- **Sidebar.tsx**: Add nav item with Users icon and label "תרגול משותף"
- **MobileBottomNav.tsx**: Add entry
- **Index.tsx**: Add `case 'study-room'` rendering `<StudyRoomView />`

## Step 4: Create StudyRoomView

File: `src/components/views/StudyRoomView.tsx`

Single component with 4 internal phases managed by local state:

### Phase 1 -- Lobby
- Section A (Create): Topic multi-select, question count (5/10/15/20), random mix checkbox, "צור חדר" button. On click: generate 6-char code, sample questions from `data`, insert study_rooms + room_participants rows.
- Section B (Join): Code input + "הצטרף" button. Validates room exists with status='waiting', inserts participant.

### Phase 2 -- Waiting Room
- Large room code with copy button + WhatsApp share link
- Participant list with ready indicators
- "!מוכן" toggle (sets is_ready)
- Poll every 3s for participant updates
- Creator sees "התחל מבחן" when all ready (sets status='active')

### Phase 3 -- Question Screen
- Top bar: counter, room code, participant dots
- Question + 4 answer buttons (matching existing SessionView style)
- On answer: lock choice, insert room_answers, also call updateHistory for personal stats
- Poll every 2s: check all answered current index
- When all answered: reveal correct/incorrect, show per-participant results, show explanation
- Creator gets "הבא" button; auto-advance after 10s
- Disconnect warning after 60s inactivity

### Phase 4 -- Results
- Side-by-side score comparison
- Per-question breakdown table
- "שחק שוב" and "חזור לדף הבית" buttons

## Step 5: Utility Functions

File: `src/lib/studyRoomUtils.ts`
- `generateRoomCode()`: random 6-char uppercase alphanumeric
- `pickQuestionsForRoom(data, topics, count, randomMix)`: filter and sample question IDs

## Step 6: Polling and Cleanup
- All setInterval calls in useEffect with cleanup on unmount
- Stop polling when room status = 'finished'

## Files to Create
1. Migration SQL file (3 tables + RLS + realtime)
2. `src/components/views/StudyRoomView.tsx`
3. `src/lib/studyRoomUtils.ts`

## Files to Modify
1. `src/lib/types.ts` -- add 'study-room' to ViewId
2. `src/components/Sidebar.tsx` -- add nav item
3. `src/components/MobileBottomNav.tsx` -- add nav item
4. `src/pages/Index.tsx` -- add case + import

