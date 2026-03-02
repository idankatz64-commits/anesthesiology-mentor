

# Plan: Standalone Anki Flashcard System

## Overview
Build a completely separate Anki-style flashcard system with custom user-created decks and cards, independent from the existing MCQ question bank. Includes two new database tables, navigation updates, and a full view with 3 tabs + study mode.

**User note applied**: MobileBottomNav will NOT be changed. Anki will be added to the Sidebar (desktop) and MobileHeader hamburger menu (mobile) only.

---

## 1. Database Migration

Create file: `supabase/migrations/20260302_create_anki_tables.sql`

### Table: `anki_decks`
- `id` uuid PK (default gen_random_uuid)
- `user_id` uuid NOT NULL
- `name` text NOT NULL
- `description` text nullable
- `created_at` timestamptz default now()

### Table: `anki_cards`
- `id` uuid PK (default gen_random_uuid)
- `deck_id` uuid NOT NULL references anki_decks(id) ON DELETE CASCADE
- `user_id` uuid NOT NULL
- `front` text NOT NULL
- `back` text NOT NULL
- `due_date` timestamptz default now()
- `interval_days` integer default 1
- `ease_factor` real default 2.5
- `repetitions` integer default 0
- `created_at` timestamptz default now()

### RLS (both tables)
All four policies (SELECT, INSERT, UPDATE, DELETE) scoped to `auth.uid() = user_id`.

### Indexes
- `idx_anki_cards_deck` on `deck_id`
- `idx_anki_cards_user_due` on `(user_id, due_date)`
- `idx_anki_decks_user` on `user_id`

---

## 2. Navigation Changes

### `src/lib/types.ts`
Add `'anki'` to the `ViewId` union type.

### `src/components/Sidebar.tsx`
Add nav item after study-room:
```text
{ id: 'anki', label: 'כרטיסיות Anki 🃏', icon: <Layers className="w-5 h-5" /> }
```
Import `Layers` from lucide-react.

### `src/components/MobileHeader.tsx`
Add to the `mobileNav` array:
```text
{ id: 'anki', label: 'כרטיסיות Anki', emoji: '🃏' }
```

### `src/components/MobileBottomNav.tsx`
**No changes** -- keep all 5 existing tabs intact.

### `src/pages/Index.tsx`
Add case to `renderView`:
```text
case 'anki': return <AnkiView />;
```
Import `AnkiView` from `@/components/views/AnkiView`.

---

## 3. New Component: `src/components/views/AnkiView.tsx`

Single file containing the full Anki experience.

### Internal state: `phase`
- `'decks'` -- Tab view (3 tabs)
- `'study'` -- Study mode for a selected deck

### Tab 1: "הכרטיסיות שלי"
- Fetch `anki_decks` for user
- For each deck, count total cards and cards due today (`due_date <= now()`)
- Display as a responsive grid of cards showing: name, total count, due count
- Click deck -> enter study mode
- Delete deck button with confirmation dialog

### Tab 2: "ייבוא"
- Textarea for pasting Front[TAB]Back lines
- File upload accepting .txt/.csv, parsed with `papaparse` (already installed)
- Preview first 5 cards in a mini table
- Text input for deck name (required)
- Save button: creates deck row, then batch inserts cards

### Tab 3: "צור כרטיסייה"
- Form with Front (textarea) and Back (textarea)
- Select existing deck or text input to create new deck
- Save button

### Study Mode
- Query `anki_cards` where `deck_id = selected` and `due_date <= now()`, ordered by `due_date asc`
- Show front of card with flip animation (similar to existing FlashcardView)
- "הצג תשובה" button to reveal back
- Three rating buttons after flip:
  - "קל" -> `interval_days = Math.ceil(interval_days * ease_factor)`, `ease_factor += 0.1`, `repetitions++`
  - "בינוני" -> `interval_days = Math.ceil(interval_days * 1.5)`, `repetitions++`
  - "קשה" -> `interval_days = 1`, `ease_factor = Math.max(1.3, ease_factor - 0.2)`, `repetitions = 0`
- Update card in DB: `due_date = now() + interval_days days`
- Progress bar: "X כרטיסיות נותרו להיום"
- Completion screen when no more due cards

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/20260302_create_anki_tables.sql` | New -- migration SQL |
| `src/lib/types.ts` | Add `'anki'` to ViewId |
| `src/components/Sidebar.tsx` | Add Anki nav item |
| `src/components/MobileHeader.tsx` | Add Anki to hamburger menu |
| `src/pages/Index.tsx` | Add AnkiView routing |
| `src/components/views/AnkiView.tsx` | New -- full Anki view |

No changes to MobileBottomNav, FlashcardView, or the MCQ system.

