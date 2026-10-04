"""Отправка писем через SMTP Яндекса.

Общий помощник для транзакционных писем (отчёты об ошибках и т.п.).
Восстановление пароля использует собственный шаблон в ``users.api_views``.
"""

import logging
import smtplib
from email.message import EmailMessage

from django.conf import settings

logger = logging.getLogger(__name__)


def send_email(
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
) -> None:
    """Отправляет письмо на ``to``.

    Возвращает None при успехе и поднимает RuntimeError, если SMTP не настроен
    или отправка не удалась, чтобы вызывающий код мог сообщить о реальной ошибке,
    а не сделать вид, что всё прошло.
    """
    username_smtp = settings.YANDEX_MAIL_USERNAME
    password_smtp = settings.YANDEX_MAIL_PASSWORD
    sender = settings.YANDEX_MAIL_FROM or username_smtp

    if not (username_smtp and password_smtp):
        raise RuntimeError(
            "Не настроен SMTP Яндекса: задайте "
            "YANDEX_MAIL_USERNAME и YANDEX_MAIL_PASSWORD"
        )
    if not to:
        raise RuntimeError("Не указан получатель письма")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.YANDEX_MAIL_FROM_NAME} <{sender}>"
    message["To"] = to
    message.set_content(text or "")
    if html:
        message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP_SSL(
            settings.YANDEX_SMTP_HOST, settings.YANDEX_SMTP_PORT, timeout=20
        ) as server:
            server.login(username_smtp, password_smtp)
            server.send_message(message)
    except smtplib.SMTPException as exc:
        logger.exception("Не удалось отправить письмо на %s: %s", to, exc)
        raise RuntimeError(str(exc)) from exc
    except OSError as exc:
        logger.exception("Нет связи с SMTP Яндекса: %s", exc)
        raise RuntimeError(str(exc)) from exc
