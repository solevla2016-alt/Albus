"""Отправка web-push уведомлений подпискам пользователя.

Отправка идёт в моменты, которые сервер знает сам: когда уходит письмо с
отчётом о проблеме или сигналом безопасности. Поэтому чтение почты не нужно.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Iterable
from typing import Any
from urllib.parse import urlparse

from django.conf import settings
from pywebpush import WebPushException, webpush

from .models import PushSubscription

logger = logging.getLogger(__name__)

# Через сколько секунд push-служба считает уведомление устаревшим.
DEFAULT_TTL = 300


def push_enabled() -> bool:
    return all(
        (
            settings.VAPID_PUBLIC_KEY,
            settings.VAPID_PRIVATE_KEY,
            settings.VAPID_SUBJECT,
        )
    )


def send_alert_push(title: str, body: str, url: str = "/chat") -> int:
    """Push владельцу о событии, которое он и так получает письмом.

    Письма уходят на ящик оператора, а push адресуется учётной записи в Albus:
    адреса не совпадают, поэтому получатель задаётся именем пользователя.
    """
    from django.contrib.auth import get_user_model

    username = settings.PUSH_NOTIFY_USERNAME
    if not username:
        logger.warning(
            "PUSH_NOTIFY_USERNAME не задан — push о сигнале пропущен, письмо ушло"
        )
        return 0

    user = get_user_model().objects.filter(username=username).first()
    if user is None:
        logger.warning("пользователь %s не найден — push пропущен", username)
        return 0

    # urgent: речь о безопасности, а не о новостях
    return send_push(user, title, body, url, urgent=True)


def send_push(
    user: Any,
    title: str,
    body: str,
    url: str = "/chat",
    ttl: int = DEFAULT_TTL,
    urgent: bool = False,
    tag: str | None = None,
) -> int:
    """Доставляет уведомление всем подпискам пользователя. Возвращает число доставок.

    Один пользователь может подписать и телефон, и компьютер. Отказ одной подписки
    не отменяет остальные: так уведомление всё равно доедет до другого устройства.
    """
    return _deliver(
        PushSubscription.objects.filter(user=user),
        title=title,
        body=body,
        url=url,
        ttl=ttl,
        urgent=urgent,
        tag=tag,
    )


def send_push_to_user_ids(
    user_ids: Iterable[int],
    title: str,
    body: str,
    url: str = "/chat",
    ttl: int = DEFAULT_TTL,
    urgent: bool = False,
    tag: str | None = None,
) -> int:
    """То же, что send_push, но адресаты уже известны по id.

    Нужно сокетам: у них под рукой есть участники комнаты, и загружать объекты
    пользователей только ради подписок незачем.
    """
    ids = [user_id for user_id in user_ids if user_id is not None]
    if not ids:
        return 0
    return _deliver(
        PushSubscription.objects.filter(user_id__in=ids),
        title=title,
        body=body,
        url=url,
        ttl=ttl,
        urgent=urgent,
        tag=tag,
    )


def _deliver(
    subscriptions: Iterable[PushSubscription],
    *,
    title: str,
    body: str,
    url: str,
    ttl: int,
    urgent: bool,
    tag: str | None,
) -> int:
    if not push_enabled():
        logger.warning("push не настроен: нет VAPID-ключей, уведомление пропущено")
        return 0

    subscriptions = list(subscriptions)
    if not subscriptions:
        return 0

    payload: dict[str, str] = {"title": title, "body": body, "url": url}
    if tag:
        payload["tag"] = tag
    data = json.dumps(payload)
    delivered = 0

    for subscription in subscriptions:
        info = {
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth,
            },
        }
        # aud — origin push-службы (https://fcm.googleapis.com), а не её схема:
        # pywebpush сверяет его с адресом подписки и отвергает подпись иначе.
        parsed = urlparse(subscription.endpoint)
        audience = f"{parsed.scheme}://{parsed.netloc}"
        try:
            webpush(
                subscription_info=info,
                data=data,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={
                    "sub": settings.VAPID_SUBJECT,
                    "aud": audience,
                    "exp": int(time.time()) + 12 * 60 * 60,
                },
                ttl=ttl,
                headers={"Urgency": "high" if urgent else "normal"},
            )
            delivered += 1
        except WebPushException as exc:
            # 404 и 410 означают, что подписка больше не существует: браузер
            # отписался, устройство сбросили. Хранить её дальше незачем.
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                subscription.delete()
            else:
                logger.warning("push не доставлен на %s: %s", subscription.endpoint, exc)
        except Exception:
            logger.exception("не удалось отправить push на %s", subscription.endpoint)

    return delivered
