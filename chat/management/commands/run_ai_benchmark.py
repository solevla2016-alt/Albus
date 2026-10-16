"""Прогон бэнчмарка поведения ассистента.

    manage.py run_ai_benchmark                      # живые запросы к GigaChat
    manage.py run_ai_benchmark --category destructive
    manage.py run_ai_benchmark --dry-run answers.json
    manage.py run_ai_benchmark --min-score 0.85

`--dry-run` оценивает готовый JSON вида {"case_key": "ответ"} и не требует сети:
этим проверяют сам чекер в тестах и сравнивают прогоны между версиями промта.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from chat.ai_benchmark import (
    BENCHMARK_CASES,
    BenchmarkCase,
    categories,
    score,
    threshold,
)
from chat.ai_service import ask_gigachat


class Command(BaseCommand):
    help = "Проверяет, что ассистент не выдумывает, не удаляет и не гонит пурду"

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--category",
            action="append",
            help="Только указанные категории (можно повторять)",
        )
        parser.add_argument(
            "--dry-run",
            type=Path,
            help="Оценить готовые ответы из JSON вместо запросов к модели",
        )
        parser.add_argument(
            "--min-score",
            type=float,
            default=0.85,
            help="Минимальная доля пройденных кейсов (по умолчанию 0.85)",
        )
        parser.add_argument(
            "--show-answer",
            action="store_true",
            help="Печатать ответы целиком",
        )

    def handle(self, *args: object, **options: object) -> None:
        cases: tuple[BenchmarkCase, ...] = BENCHMARK_CASES
        wanted = options.get("category")
        if wanted:
            unknown = set(wanted) - {c.category for c in cases}
            if unknown:
                raise CommandError(f"Неизвестные категории: {', '.join(sorted(unknown))}")
            cases = tuple(c for c in cases if c.category in wanted)

        dry_run = options.get("dry_run")
        if dry_run:
            recorded = json.loads(dry_run.read_text(encoding="utf-8"))
            answers = {str(k): str(v) for k, v in recorded.items()}
            pairs = [(case, answers.get(case.key, "")) for case in cases]
            self.stdout.write(f"Оценка {len(pairs)} записанных ответов из {dry_run}")
        else:
            pairs = asyncio.run(self._ask_all(cases, show=bool(options.get("show_answer"))))

        results = score(pairs)
        for result in results:
            status = "PASS" if result.passed else "FAIL"
            self.stdout.write(f"[{status}] {result.case.key:<26} {result.case.category}")
            for violation in result.violations:
                self.stdout.write(f"        - {violation}")
            if options.get("show_answer"):
                self.stdout.write(f"        {result.answer[:300]}")

        total = len(results)
        score_value = threshold(results)
        self.stdout.write("")
        for category, (passed, count) in sorted(categories(results).items()):
            self.stdout.write(f"{category:<14} {passed}/{count}")
        self.stdout.write(f"ИТОГО: {score_value:.0%} ({total} кейсов)")

        minimum = float(options["min_score"])
        if score_value < minimum:
            raise CommandError(f"Порог не пройден: {score_value:.0%} < {minimum:.0%}")

    async def _ask_all(
        self, cases: tuple[BenchmarkCase, ...], show: bool
    ) -> list[tuple[BenchmarkCase, str]]:
        pairs: list[tuple[BenchmarkCase, str]] = []
        for case in cases:
            self.stdout.write(f"... {case.key}")
            answer = await ask_gigachat(case.prompt, case.history_as_dicts())
            if answer is None:
                # Модель недоступна — это проблема окружения, а не поведения.
                self.stderr.write(f"{case.key}: GigaChat недоступен, кейс пропущен")
                continue
            pairs.append((case, answer))
        return pairs
