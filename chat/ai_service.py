"""AI-сервис: отправка запросов к GigaChat (Сбер)."""

import asyncio
import base64
import ssl
import sys
import time
import uuid
from typing import Any

import httpx
from django.conf import settings

AI_SYSTEM_PROMPT = (
    "Ты — ментор по языку Python в корпоративном чате 'Albus'.\n"
    "Твоя специализация — Python: синтаксис, идиомы, стандартная библиотека, "
    "асинхронность, ООП, тестирование, производительность. Ты учишь и объясняешь "
    "подходы как наставник, даёшь примеры кода и разбираешь ошибки.\n"
    "Отвечай на вопросы по веб-фреймворкам Python: Django, Django REST "
    "Framework, FastAPI, Flask, а также по SQLAlchemy, Pydantic, pytest и другим "
    "популярным библиотекам. Помогай и по смежным темам: базы данных, SQL, Git, "
    "Docker, алгоритмы, паттерны, архитектура.\n"
    "Если вопрос не про разработку — вежливо сообщи, что ты ментор по Python "
    "и веб-фреймворкам, и предложи переформулировать.\n"
    "Отвечай как наставник: кратко, по делу, с примерами кода. Используй markdown: "
    "код — в блоках ```, списки — с '-'. Пиши на языке вопроса."
)


# GigaChat access tokens live about 30 minutes. Fetching one per question cost a
# full OAuth round trip on every AI message and walked straight into the
# endpoint's rate limit, which then made the assistant answer "unavailable".
_TOKEN_TTL_SECONDS = 25 * 60
_token_cache: tuple[str, float] | None = None

_SYSTEM_CA_BUNDLE = "/etc/ssl/certs/ca-certificates.crt"


def _ssl_verify() -> ssl.SSLContext | bool:
    """Контекст TLS для GigaChat.

    httpx проверяет сертификаты по bundle certifi, где нет российского корневого
    CA Минцифры, которым выпущены эндпоинты Сбера: рукопожатие падало с
    ошибкой 19. Корень прописан в образ, поэтому системное хранилище подходит —
    но оно не содержит ничего из certifi, так что берём оба.
    """
    if not settings.GIGACHAT_VERIFY_SSL:
        return False

    context = ssl.create_default_context()
    try:
        import certifi

        context.load_verify_locations(cafile=certifi.where())
    except Exception as exc:  # pragma: no cover - certifi ships with httpx
        print(f"[AI] certifi bundle unavailable: {exc}", file=sys.stderr)

    try:
        context.load_verify_locations(cafile=_SYSTEM_CA_BUNDLE)
    except OSError as exc:  # pragma: no cover - non-Debian base image
        print(f"[AI] system CA bundle {exc}", file=sys.stderr)

    return context


async def _gigachat_token() -> str | None:
    """Получает OAuth-токен GigaChat. Поддерживает ключи client_id/client_secret
    и вход по логину/паролю Сбер ID."""
    global _token_cache

    if _token_cache is not None:
        cached, expires_at = _token_cache
        if expires_at > time.monotonic():
            return cached

    client_id = settings.GIGACHAT_CLIENT_ID
    client_secret = settings.GIGACHAT_CLIENT_SECRET
    username = settings.GIGACHAT_USERNAME
    password = settings.GIGACHAT_PASSWORD

    if client_id and client_secret:
        creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    elif username and password:
        creds = base64.b64encode(f"{username}:{password}".encode()).decode()
    else:
        return None

    headers = {
        "Authorization": f"Basic {creds}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "RqUID": str(uuid.uuid4()),
    }
    try:
        async with httpx.AsyncClient(
            timeout=settings.AI_TIMEOUT_SECONDS, verify=_ssl_verify()
        ) as client:
            resp = await client.post(
                settings.GIGACHAT_AUTH_URL,
                headers=headers,
                data={"scope": settings.GIGACHAT_SCOPE},
            )
        if resp.status_code != 200:
            print(f"[AI] GigaChat auth HTTP {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
            return None
        data = resp.json()
        token = data.get("access_token")
        if not token:
            return None
        _token_cache = (token, time.monotonic() + _TOKEN_TTL_SECONDS)
        return token
    except Exception as exc:
        print(f"[AI] GigaChat auth error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None


async def ask_gigachat(prompt: str, history: list[dict[str, Any]]) -> str | None:
    """Отправляет запрос в GigaChat. Возвращает ответ или None при ошибке."""
    token = await _gigachat_token()
    if not token:
        return None

    messages: list[dict[str, str]] = [{"role": "system", "content": AI_SYSTEM_PROMPT}]
    for msg in history:
        role = "assistant" if msg.get("is_ai") else "user"
        messages.append({"role": role, "content": msg.get("text", "")})
    messages.append({"role": "user", "content": prompt})

    url = f"{settings.GIGACHAT_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.GIGACHAT_MODEL,
        "messages": messages,
        "max_tokens": 800,
        "temperature": 0.7,
    }

    try:
        async with httpx.AsyncClient(
            timeout=settings.AI_TIMEOUT_SECONDS, verify=_ssl_verify()
        ) as client:
            for attempt in range(2):
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices") or []
                    if choices and choices[0].get("message", {}).get("content"):
                        return choices[0]["message"]["content"].strip()
                    print(f"[AI] GigaChat no content (attempt {attempt + 1}): {str(data)[:200]}", file=sys.stderr)
                else:
                    print(f"[AI] GigaChat HTTP {resp.status_code} (attempt {attempt + 1}): {resp.text[:200]}", file=sys.stderr)
                await asyncio.sleep(1.5)
        return None
    except Exception as exc:
        print(f"[AI] GigaChat error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None


def build_history(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Подготавливает контекст для модели из сырых сообщений."""
    return [
        {
            "text": m.get("message", m.get("text", "")),
            "username": m.get("username", ""),
            "is_ai": m.get("is_ai", False),
        }
        for m in messages
    ]


_AI_HELP_TEXT = "\n".join(
    [
        "Доступные команды:",
        "",
        "`/ai <вопрос>` — спросить меня как ментора по Python",
        "`/help` — этот список",
        "",
        "Моя специализация — Python (синтаксис, идиомы, асинхронность, ООП, "
        "тесты, оптимизация). Также разбираюсь в веб-фреймворках Django, DRF, "
        "FastAPI, Flask и в SQL, Git, Docker, алгоритмах и паттернах.",
        "",
        "Ваш вопрос и последние сообщения этого чата отправляются в GigaChat "
        "(ПАО «Сбербанк») для формирования ответа — это раскрыто в политике "
        "обработки персональных данных.",
    ]
)


async def get_ai_answer(prompt: str, history: list[dict[str, Any]]) -> str:
    """Возвращает ответ GigaChat."""
    normalized = prompt.strip().lower()
    if normalized.startswith("/help"):
        return _AI_HELP_TEXT

    online = await ask_gigachat(prompt, history)
    if online:
        return online

    return (
        "Я — твой ментор по Python, но внешний сервис ИИ сейчас недоступен.\n"
        "Попробуй ещё раз через минуту или напиши `/help` для списка команд."
    )
