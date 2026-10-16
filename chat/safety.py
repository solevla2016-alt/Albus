"""Сигналы безопасности ассистента: правила 14 и 15 промта.

Правило 14 запрещает развивать темы оружия, взрывчатки, наркотиков и
самоповреждения. Правило 15 требует направить ребёнка, которому плохо, к
взрослому. Здесь эти темы распознаются по тексту запроса, сигнал пишется в базу
и отправляется оператору письмом.

Почему не по ответу модели: модель недетерминирована, и разбирать её свободный
текст надёжнее, чем проверять текст запроса. Кроме того, сигнал должен
сохраниться даже тогда, когда модель недоступна и ответа не было вовсе.

Тема оценочная: сеть грубая и ошибается в обе стороны. Ложное срабатывание —
лишнее письмо оператору, поэтому в письме прямо сказано, что это автоматический
сигнал, а решение принимает человек. Ложное отсутствие срабатывания опаснее,
поэтому шаблоны заточены на Recall: лучше лишнее письмо, чем промолчание, когда
ребёнку плохо.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

RULE_14 = "rule_14"
RULE_15 = "rule_15"

_RULE_TITLES = {
    RULE_14: "Опасная тема (правило 14)",
    RULE_15: "Ребёнку плохо (правило 15)",
}

# Упоминание ребёнка: нужно, чтобы не срабатывать на взрослые разговоры.
_CHILD = re.compile(
    r"\b(?:реб[её]н[а-я]*|реб[её]нк|мальчик|девочк|ученик|школьник|учениц|"
    r"сын|дочк|доч[её]р|одноклассник|младш|пацан(?:ик)?|девочка)\b",
    re.IGNORECASE,
)

# Правило 14: оружие, взрывчатка, наркотики, самоповреждение.
_RULE_14_PATTERNS = (
    # взрывчатка и терроризм
    r"бомб\w*",
    r"взрывчат\w*",
    r"взрывн\w*\s+(?:устройств|деточк|бомб)",
    r"взорвать|подорвать",
    r"террорист\w*",
    # оружие
    r"оружи\w*",
    r"огнестрельн\w*",
    r"пистолет\w*",
    r"автомат\w*\s+калашников|калашников\w*",
    r"гранат\w*",
    # наркотики
    r"наркоман\w*|наркот\w*",
    r"кокаин\w*|героин\w*|мефедрон\w*|амфетамин\w*|марихуан\w*",
    r"закладк\w*",
    r"\bспайс(?:ы)?\b",
    # самоповреждение
    r"самоубий\w*|суицид\w*",
    r"покончить\s+с\s+собой",
    r"самоповрежд\w*",
    r"порезать\s+себя|резать\s+себя",
    r"причинить\s+себе\s+вред",
)

# Алкоголь и курение интересуют правило только вместе с ребёнком.
_RULE_14_ALCOHOL = re.compile(
    r"алкогол\w*|водк\w*|спиртн\w*|пиво\w*|сигарет\w*|курит\w*|вейп\w*",
    re.IGNORECASE,
)

# Правило 15: ребёнку плохо.
_RULE_15_PATTERNS = (
    r"бь[её]т\s+дома|меня\s+дома\s+бь[её]т",
    r"бь[её]т\s+меня|бьют\s+меня|избива\w*\s+меня",
    r"бьют|избива\w*",
    # Про «отец бьёт» нужно указание на пострадавшего: без него срабатывало бы
    # на «отец бьёт мяч за ворота».
    r"(?:отец|папа|мама|мать|родител\w*|муж)\w*\s+"
    r"(?:бь[её]т|бьют|избива\w*)\s+"
    r"(?:меня|маму|мать|её|нас|дочь|дочери|сына|сыну|жену|младш\w*|детей)",
    r"боюсь\s+(?:идти|возвращ\w*|домой|идти\s+домой|оста\w*)",
    r"мне\s+страшно|очень\s+страшно|жутко\s+страшно",
    r"угрожа\w*",
    r"оставили\s+(?:одного|одну|меня\s+одного)",
    r"никто\s+не\s+приходит\s+домой|ночу\w*\s+на\s+улице",
    r"не\s+хочу\s+жить|не\s+хочу\s+жить\s+дальше",
    r"прячусь|скрываюсь",
    r"пропал\s+домой|меня\s+не\s+ищут",
)

_COMPILED_14 = tuple(re.compile(p, re.IGNORECASE) for p in _RULE_14_PATTERNS)
_COMPILED_15 = tuple(re.compile(p, re.IGNORECASE) for p in _RULE_15_PATTERNS)


@dataclass(frozen=True)
class SafetySignal:
    """Что именно сработало."""

    rule: str
    matched: str
    excerpt: str


def _excerpt(text: str) -> str:
    limit = getattr(settings, "SAFETY_ALERT_EXCERPT_CHARS", 500)
    clean = " ".join((text or "").split())
    return clean[:limit]


def detect(text: str, *, child_mentioned: bool | None = None) -> SafetySignal | None:
    """Ищет признаки правил 14 и 15 в тексте. Возвращает первый сигнал.

    Правило 15 проверяется первым: если ребёнку плохо, это важнее темы про
    наркотики, и оператору нужно видеть именно это.
    """
    haystack = text or ""
    if not haystack.strip():
        return None

    if child_mentioned is None:
        child_mentioned = bool(_CHILD.search(haystack))

    for pattern in _COMPILED_15:
        match = pattern.search(haystack)
        if match:
            return SafetySignal(RULE_15, match.group(0), _excerpt(haystack))

    for pattern in _COMPILED_14:
        match = pattern.search(haystack)
        if match:
            return SafetySignal(RULE_14, match.group(0), _excerpt(haystack))

    # алкоголь и курение — только когда речь о ребёнке
    if child_mentioned:
        match = _RULE_14_ALCOHOL.search(haystack)
        if match:
            return SafetySignal(RULE_14, match.group(0), _excerpt(haystack))

    return None


def _recipient() -> str:
    return (
        getattr(settings, "SAFETY_ALERT_EMAIL", "")
        or getattr(settings, "BUG_REPORT_EMAIL", "")
        or getattr(settings, "YANDEX_MAIL_FROM", "")
    )


def _in_cooldown(user: Any, rule: str) -> bool:
    """Не спамить письмами по одному и тому же сигналу."""
    from .models import ChildSafetyAlert

    minutes = getattr(settings, "SAFETY_ALERT_COOLDOWN_MINUTES", 60)
    if minutes <= 0:
        return False
    since = timezone.now() - timedelta(minutes=minutes)
    return ChildSafetyAlert.objects.filter(
        user=user, rule=rule, created_at__gte=since
    ).exists()


def _build_body(alert: Any, matched: str) -> str:
    room = alert.room.name if alert.room_id and alert.room else "—"
    return (
        f"Сигнал безопасности: {_RULE_TITLES.get(alert.rule, alert.rule)}\n\n"
        f"Это автоматический сигнал по тексту запроса к ассистенту, а не "
        f"подтверждённый инцидент. Решение принимает человек.\n\n"
        f"Правило: {alert.rule} ({_RULE_TITLES.get(alert.rule, '')})\n"
        f"Совпало с: {matched!r}\n"
        f"Пользователь: {alert.user.username} (id {alert.user_id})\n"
        f"Комната: {room}\n"
        f"Время: {timezone.localtime(alert.created_at).isoformat()}\n\n"
        f"Текст запроса:\n{alert.excerpt}\n\n"
        f"Это запись #{alert.id}. Письмо пришло автоматически, отвечать не нужно."
    )


def record_signal(user: Any, room: Any, signal: SafetySignal) -> Any | None:
    """Сохраняет сигнал и, если можно, отправляет письмо оператору.

    Всегда возвращает созданную запись либо None, если сигналы отключены.
    Ошибка письма не поднимается наружу: она уже записана в notified=False.
    """
    if not getattr(settings, "SAFETY_ALERTS_ENABLED", True):
        return None

    from .models import ChildSafetyAlert

    # Кулдаун проверяется до создания записи: иначе свежая запись только что
    # добавленный сигнал гасит сам себя и письмо не уходит никогда.
    cooling_down = _in_cooldown(user, signal.rule)

    alert = ChildSafetyAlert.objects.create(
        user=user,
        room=room,
        rule=signal.rule,
        excerpt=signal.excerpt,
    )

    if cooling_down:
        logger.info(
            "safety alert %s для %s сохранён, письмо пропущено: кулдаун",
            alert.rule,
            user.username,
        )
        return alert

    recipient = _recipient()
    if not recipient:
        logger.warning(
            "safety alert %s для %s сохранён, но SAFETY_ALERT_EMAIL не задан",
            alert.rule,
            user.username,
        )
        return alert

    # импорт ленивый: сбой почты не должен стоить сохранённой записи
    from users.mail import send_email

    try:
        send_email(
            recipient,
            f"Albus: сигнал безопасности — {_RULE_TITLES.get(alert.rule, alert.rule)} "
            f"({alert.rule}) — {user.username}",
            _build_body(alert, signal.matched),
        )
    except RuntimeError:
        logger.exception(
            "не удалось отправить письмо о сигнале безопасности %s для %s",
            alert.rule,
            user.username,
        )
        return alert

    ChildSafetyAlert.objects.filter(id=alert.id).update(notified=True)
    alert.notified = True
    return alert
