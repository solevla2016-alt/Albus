"""Проверки конфигурации развёртывания.

Такая ошибка уже проходила: значение переменной в docker-compose.vds.yml было
съедено при редактировании, файл остался валидным YAML, CI ничего не заметил,
а на сервере безопасность молча уехала на другой адрес. Тест ловит именно
этот класс повреждений.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ROOT / "docker-compose.vds.yml"


def _compose_lines() -> list[tuple[int, str]]:
    return list(enumerate(COMPOSE.read_text(encoding="utf-8").splitlines(), 1))


def _is_entry(line: str) -> bool:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or stripped.startswith("-"):
        return False
    # Ключи верхнего уровня и секций заканчиваются двоеточием без значения.
    return ":" in stripped and not stripped.endswith(":")


class TestComposeIntegrity:
    def test_no_replacement_characters(self):
        text = COMPOSE.read_text(encoding="utf-8")
        assert "�" not in text

    @pytest.mark.parametrize(
        "key",
        [
            "BUG_REPORT_EMAIL",
            "SAFETY_ALERT_EMAIL",
            "SAFETY_ALERTS_ENABLED",
            "SAFETY_ALERT_COOLDOWN_MINUTES",
            "SAFETY_ALERT_EXCERPT_CHARS",
            "SAFETY_ALERT_EXCERPT_RETENTION_DAYS",
        ],
    )
    def test_alert_variables_have_values(self, key):
        """Пустое значение у переменной означает тихую потеру настройки."""
        entries = {
            line.partition(":")[0].strip(): line.partition(":")[2].strip()
            for _, line in _compose_lines()
            if _is_entry(line)
        }
        assert key in entries, f"{key} не передан в контейнер"
        assert entries[key], f"{key} передан без значения"

    def test_every_entry_has_a_value(self):
        empty = [
            f"L{i}: {line.strip()[:60]}"
            for i, line in _compose_lines()
            if _is_entry(line) and not line.partition(":")[2].strip()
        ]
        assert not empty, "записи без значения: " + "; ".join(empty)

    def test_defaults_match_the_settings_module(self):
        """Значения по умолчанию в compose и в settings не должны расходиться."""
        compose = COMPOSE.read_text(encoding="utf-8")
        settings = (ROOT / "config" / "settings.py").read_text(encoding="utf-8")
        pairs = [
            ("SAFETY_ALERT_EXCERPT_CHARS", "200"),
            ("SAFETY_ALERT_EXCERPT_RETENTION_DAYS", "30"),
            ("SAFETY_ALERT_COOLDOWN_MINUTES", "60"),
        ]
        for key, expected in pairs:
            assert f"${{{key}:-{expected}}}" in compose, f"{key} в compose"
            assert f'os.getenv("{key}", "{expected}")' in settings, f"{key} в settings"


@pytest.mark.skipif(
    shutil.which("docker") is None,
    reason="docker недоступен в этом окружении",
)
def test_compose_file_is_valid():
    """docker compose config падает на битых подстановках, в отличие от YAML."""
    docker = shutil.which("docker") or "docker"
    result = subprocess.run(  # noqa: S603
        [docker, "compose", "-f", str(COMPOSE), "config", "--quiet"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr[:500]
