"""
Tests for notebooklm_sync.py
Run: cd /Users/idankatz15/Desktop && pytest tests/test_notebooklm_sync.py -v
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from notebooklm_sync import build_prompt, run, NOTEBOOK_ID


class TestBuildPrompt:
    def test_includes_chapter_number(self):
        prompt = build_prompt("14", "some notes", [])
        assert "14" in prompt

    def test_includes_notes_content(self):
        prompt = build_prompt("14", "Zone 3 is centrilobular", [])
        assert "Zone 3 is centrilobular" in prompt

    def test_includes_questions_when_provided(self):
        questions = [{"question": "Which zone is most vulnerable to halothane?", "correct": "c", "a": "Zone 1", "b": "Zone 2", "c": "Zone 3", "d": "Zone 4", "explanation": "Zone 3 is perivenous"}]
        prompt = build_prompt("14", "notes", questions)
        assert "Which zone is most vulnerable" in prompt

    def test_no_questions_section_when_empty(self):
        prompt = build_prompt("14", "notes", [])
        assert "שאלות מבחן אמיתיות" not in prompt

    def test_limits_to_30_questions(self):
        questions = [{"question": f"Q{i}", "correct": "a", "a": "x", "b": "y", "c": "z", "d": "w", "explanation": ""} for i in range(50)]
        prompt = build_prompt("14", "notes", questions)
        # Count occurrences — should have at most 30
        import re
        found = re.findall(r'\d+\. Q\d+', prompt)
        assert len(found) <= 30

    def test_asks_for_visual_references_section(self):
        prompt = build_prompt("14", "notes", [])
        assert "הפניות ויזואליות" in prompt

    def test_asks_for_cheat_sheet_section(self):
        prompt = build_prompt("14", "notes", [])
        assert "Cheat Sheet" in prompt


@pytest.mark.asyncio
class TestRun:
    async def test_returns_notebooklm_answer(self):
        mock_answer = "## הפניות ויזואליות\n- Figure 14-1: Acinar zones\n\n## ⚡ Cheat Sheet\n⚡ Zone 3 most vulnerable"
        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=MagicMock(answer=mock_answer))
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        with patch("notebooklm_sync.NotebookLMClient") as mock_cls:
            mock_cls.from_storage = AsyncMock(return_value=mock_cm)
            result = await run("14", "Zone 3 notes", [])

        assert "הפניות ויזואליות" in result
        assert "Cheat Sheet" in result

    async def test_passes_correct_notebook_id(self):
        mock_client = AsyncMock()
        mock_client.chat.ask = AsyncMock(return_value=MagicMock(answer="ok"))
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cm.__aexit__ = AsyncMock(return_value=None)

        with patch("notebooklm_sync.NotebookLMClient") as mock_cls:
            mock_cls.from_storage = AsyncMock(return_value=mock_cm)
            await run("14", "notes", [])

        call_args = mock_client.chat.ask.call_args
        assert call_args[0][0] == NOTEBOOK_ID
