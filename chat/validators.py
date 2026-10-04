import json

MAX_MESSAGE_LENGTH = 8000
MAX_EMOJI_LENGTH = 16
MAX_ATTACHMENT_NAME_LENGTH = 255
MAX_ATTACHMENT_URL_LENGTH = 100
MAX_ATTACHMENT_TYPE_LENGTH = 10
MAX_DURATION = 2**31 - 1


def coerce_id(value: object) -> int | None:
    """Приводит значение из JSON к int или None.

    Django сам бросил бы ValueError на ``id__lte="abc"``, и это исключение
    закрывало бы WebSocket соединение целиком.
    """
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.lstrip("-").isdigit():
        return int(value)
    return None


def coerce_text(value: object, limit: int) -> str | None:
    """Обрезает строку до limit символов, отбрасывая не-строки."""
    if not isinstance(value, str):
        return None
    return value[:limit]


def coerce_duration(value: object) -> int | None:
    """Приводит duration к неотрицательному int в пределах PositiveIntegerField."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, str) and value.isdigit():
        value = int(value)
    if not isinstance(value, int) or value < 0:
        return None
    return min(value, MAX_DURATION)


def validate_message(text_data: str) -> tuple[str | None, str | None]:
    try:
        data = json.loads(text_data)
    except json.JSONDecodeError:
        return None, "Некорректный JSON"

    if not isinstance(data, dict):
        return None, "Сообщение должно быть JSON-объектом"

    message = data.get("message")
    if not isinstance(message, str):
        return None, "Поле message должно быть строкой"

    message = message.strip()
    if not message:
        return None, "Сообщение не может быть пустым"

    if len(message) > MAX_MESSAGE_LENGTH:
        return None, (
            f"Сообщение не может быть длиннее {MAX_MESSAGE_LENGTH} символов "
            f"(сейчас {len(message)})"
        )

    return message, None
