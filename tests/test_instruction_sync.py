"""Инструкция существует�� в двух местах: INSTRUCTION.md и страница /instruction.

Текст в приложении — это то, что читают сотрудники, а файл в репозитории нужен
для оффлайн-версии и для правок. Расхождение по цифрам опаснее, чем по
формулировкам: пользователь загрузит файл не по лимиту и решит, что это поломка.
Поэтому ключевые числа сверяются.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MARKDOWN = ROOT / "INSTRUCTION.md"
MODULE = ROOT / "frontend" / "src" / "lib" / "instruction.ts"


def _markdown() -> str:
    return MARKDOWN.read_text(encoding="utf-8")


def _module() -> str:
    return MODULE.read_text(encoding="utf-8")


class TestInstructionExists:
    def test_markdown_present(self):
        text = _markdown()
        assert len(text) > 3000, "инструкция выглядит пустой"

    def test_module_present(self):
        assert "INSTRUCTION_SECTIONS" in _module()

    def test_no_replacement_characters(self):
        assert "�" not in _markdown()
        assert "�" not in _module()


class TestLimitsMatch:
    """Пределы размера — самое частое место расхождения."""

    @pytest.mark.parametrize(
        ("label", "size"),
        [
            ("Фото и картинки", "10 МБ"),
            ("Аудио", "25 МБ"),
            ("Видео", "200 МБ"),
            ("Прочие файлы", "50 МБ"),
            ("Длина одного сообщения", "8000 символов"),
        ],
    )
    def test_limit_in_both(self, label, size):
        assert size in _markdown(), f"{label}: нет в INSTRUCTION.md"
        assert size in _module(), f"{label}: нет в instruction.ts"


class TestKeyStepsMatch:
    """Шаги, без которых сотрудник не справится."""

    @pytest.mark.parametrize(
        "step",
        [
            "/ai",  # команда ассистенту
            "Shift+Enter",  # перенос строки
            "Зарегистрироваться",
            "Восстановить пароль",
            "Начать разговор",
            "Создать канал",
            "Создать сервер",
            "Переименовать",
            "Транскрибировать",
            "Показать всех",
            "Заблокировать",
            "Назначить модератором",
            "Удалённый пользователь",
            "Понятно",
            "Текст удалён по сроку хранения",
        ],
    )
    def test_step_in_both(self, step):
        assert step in _markdown(), f"{step!r}: нет в INSTRUCTION.md"
        assert step in _module(), f"{step!r}: нет в instruction.ts"


class TestModuleStructure:
    def test_sections_are_numbered_without_gaps(self):
        source = _module()
        numbers = [int(n) for n in re.findall(r'title: "(\d+)\. ', source)]
        assert numbers == list(range(1, len(numbers) + 1))

    def test_no_stray_markup_in_paragraphs(self):
        """Незакрытый ** ломает разбор жирного: текст пропадёт вместе с ним.

        Считаем маркеры в области контента, а не по всему файлу: в самом
        splitBold разделитель тоже записан, а длинные абзацы собраны
        конкатенацией строк, поэтому пара ** может стоять на границе литералов.
        """
        source = _module()
        content = source.split("/** Разбирает")[0]
        # /** в шапке модуля содержит те же два символа, поэтому такие
        # последовательности не считаем маркерами жирного текста
        markers = re.findall(r"(?<!/)\*\*", content)
        assert len(markers) % 2 == 0, (
            "нечётное число маркеров ** в тексте инструкции"
        )
