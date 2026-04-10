#!/usr/bin/env python3
"""
notebooklm_sync.py — Phase B: NotebookLM visual references + exam cheat sheet

⚠️  READ-ONLY — does not write to Supabase, does not touch the app.
Usage:
    python3 notebooklm_sync.py 14 --notes /path/to/notes.md
    python3 notebooklm_sync.py 14 --notes /path/to/notes.md --questions '[{"question":...}]'
"""
import asyncio
import sys
import json
import argparse
from notebooklm import NotebookLMClient

NOTEBOOK_ID = "3350d7aa-be6a-4a59-ad73-efbf96da68da"


def build_prompt(chapter: str, processed_notes: str, questions: list[dict]) -> str:
    """Build the structured prompt for NotebookLM."""
    questions_section = ""
    if questions:
        lines = [f"\n\nשאלות מבחן אמיתיות על פרק {chapter} ({len(questions[:30])} שאלות):"]
        for i, q in enumerate(questions[:30], 1):
            lines.append(f"\n{i}. {q['question']}")
            if q.get("explanation"):
                lines.append(f"   הסבר: {q['explanation'][:150]}")
        questions_section = "\n".join(lines)

    return f"""בהתבסס על ספר מילר הרדמה מהדורה 10 ועל ההערות הבאות לפרק {chapter}:

{processed_notes}
{questions_section}

אנא ספק שני חלקים בלבד, בפורמט הבא:

## הפניות ויזואליות מהספר
רשום את כל הטבלאות, גרפים, תמונות, נוסחאות ו-Box-ים הרלוונטיים לפרק {chapter} בספר מילר.
פורמט לכל שורה: - Figure/Table/Box X-Y: תיאור קצר בעברית

## ⚡ Cheat Sheet למבחן
נקודות קריטיות בלבד — כל נקודה בשורה אחת, ⚡ בתחילתה.
{"מבוסס על ניתוח שאלות המבחן שסופקו." if questions else "מבוסס על ניתוח ספר מילר לפרק זה."}
"""


async def run(chapter: str, processed_notes: str, questions: list[dict]) -> str:
    """Send prompt to NotebookLM, return markdown response."""
    prompt = build_prompt(chapter, processed_notes, questions)
    async with await NotebookLMClient.from_storage() as client:
        result = await client.chat.ask(NOTEBOOK_ID, prompt)
        return result.answer


def main() -> None:
    parser = argparse.ArgumentParser(description="Send notes to NotebookLM, get visual refs + cheat sheet")
    parser.add_argument("chapter", help="Chapter number, e.g. 14")
    parser.add_argument("--notes", required=True, help="Path to processed notes .md file")
    parser.add_argument("--questions", default="[]", help="JSON array of question objects from Supabase")
    args = parser.parse_args()

    try:
        processed_notes = open(args.notes, encoding="utf-8").read()
    except FileNotFoundError:
        print(f"ERROR: notes file not found: {args.notes}", file=sys.stderr)
        sys.exit(1)

    try:
        questions = json.loads(args.questions)
    except json.JSONDecodeError:
        print("ERROR: --questions must be valid JSON array", file=sys.stderr)
        sys.exit(1)

    result = asyncio.run(run(args.chapter, processed_notes, questions))
    print(result)


if __name__ == "__main__":
    main()
