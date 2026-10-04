import json

MAX_MESSAGE_LENGTH = 8000


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
