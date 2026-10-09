import asyncio
import json
import logging
import os
import sys
import time
from collections import defaultdict
from typing import Any

import redis.asyncio as aioredis
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.contrib.auth import get_user_model

from .ai_service import build_history, get_ai_answer
from .models import ChatRoom, Message, Reaction, ReadStatus
from .permissions import can_access_room, can_delete_message, is_banned
from .serializers import _username_of
from .validators import (
    MAX_ATTACHMENT_NAME_LENGTH,
    MAX_ATTACHMENT_TYPE_LENGTH,
    MAX_ATTACHMENT_URL_LENGTH,
    MAX_EMOJI_LENGTH,
    MAX_MESSAGE_LENGTH,
    coerce_duration,
    coerce_id,
    coerce_text,
    validate_message,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class _AiRoomQueue:
    """Serialises AI answers per room.

    Every question used to spawn its own task, so several questions sent
    in a row produced parallel calls and the answers arrived as one batch.
    The lock keeps them strictly in order, one reply at a time.
    """

    def __init__(self) -> None:
        self.lock = asyncio.Lock()
        self.pending = 0


_AI_QUEUES: dict[str, _AiRoomQueue] = {}


def _get_ai_queue(room_name: str) -> _AiRoomQueue:
    queue = _AI_QUEUES.get(room_name)
    if queue is None:
        queue = _AiRoomQueue()
        _AI_QUEUES[room_name] = queue
    return queue


class ChatConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer для чата Albus."""

    redis_pool: aioredis.Redis | None = None

    _ERR_SOURCE = "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0441\u044b\u043b\u043a\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e"
    _ERR_FROM_DIRECT = (
        "\u0418\u0437 \u043b\u0438\u0447\u043d\u043e\u0433\u043e \u0447\u0430\u0442\u0430 "
        "\u043f\u0435\u0440\u0435\u0441\u044b\u043b\u043a\u0430 \u043d\u0435\u0432\u043e\u0437\u043c\u043e\u0436\u043d\u0430"
    )
    _ERR_NO_TARGET = "\u041a\u043e\u043c\u043d\u0430\u0442\u0430 \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0441\u044b\u043b\u043a\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430"
    _ERR_TO_DIRECT = (
        "\u041f\u0435\u0440\u0435\u0441\u044b\u043b\u043a\u0430 \u0432 \u043b\u0438\u0447\u043d\u044b\u0439 "
        "\u0447\u0430\u0442 \u043d\u0435\u0432\u043e\u0437\u043c\u043e\u0436\u043d\u0430"
    )
    _ERR_NO_ACCESS = "\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0430 \u043a \u043a\u043e\u043c\u043d\u0430\u0442\u0435 \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0441\u044b\u043b\u043a\u0438"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._ai_tasks: set[asyncio.Task] = set()

    @classmethod
    async def _get_redis(cls) -> aioredis.Redis:
        if cls.redis_pool is None:
            cls.redis_pool = aioredis.from_url(
                f"redis://{os.getenv('REDIS_HOST', '127.0.0.1')}:{os.getenv('REDIS_PORT', '6379')}",
                decode_responses=True,
            )
        return cls.redis_pool

    @property
    def presence_key(self) -> str:
        return f"presence:chat_{self.room.id}"

    @property
    def user_key(self) -> str:
        return f"presence:user_{self.scope['user'].id}"

    @property
    def screen_key(self) -> str:
        return f"screen:chat_{self.room.id}"

    def _origin_allowed(self) -> bool:
        """Reject cross-site WebSocket handshakes.

        Session cookies use SameSite=None so the handshake can carry them,
        which means the browser will also attach them to a WebSocket opened
        by a third-party page. The Origin header is the only remaining
        defence against cross-site WebSocket hijacking.
        """
        origin = None
        for name, value in self.scope.get("headers", []) or []:
            if name.lower() == b"origin":
                origin = value
                break
        if not origin:
            # non-browser clients (tests, CLI) do not send Origin
            return bool(getattr(settings, "DEBUG", False))
        allowed = {o.strip().rstrip("/") for o in settings.CORS_ALLOWED_ORIGINS}
        allowed |= {h.strip() for h in settings.ALLOWED_HOSTS if h.strip()}
        origin_value = origin.decode() if isinstance(origin, bytes) else str(origin)
        normalized = origin_value.strip().rstrip("/")
        if normalized in allowed:
            return True
        # also accept hosts listed without the scheme
        bare = origin_value.split("://", 1)[-1].split("/", 1)[0]
        return bare in allowed

    async def connect(self) -> None:
        if not self._origin_allowed():
            print("[WS] close: origin not allowed", flush=True)
            await self.close()
            return

        user = self.scope["user"]
        if user.is_anonymous:
            print("[WS] close: anonymous", flush=True)
            await self.close()
            return

        room_kwargs = self.scope["url_route"]["kwargs"]
        self.room_name: str = room_kwargs.get("room_name", "")
        room_id = room_kwargs.get("room_id")
        if room_id is not None:
            self.room = await self._get_room_by_id(int(room_id))
        else:
            self.room = await self._get_room(self.room_name)
        if self.room is not None:
            # the id route knows the name only after the lookup
            self.room_name = self.room.name

        if self.room is None:
            print(f"[WS] close: room not found: {self.room_name!r}", flush=True)
            await self.close()
            return

        if not await self._has_access(user):
            print(f"[WS] close: access denied: {user.username} room={self.room.name!r}", flush=True)
            await self.close()
            return

        print(f"[WS] open: {user.username} room={self.room.name!r}", flush=True)

        self.room_group_name = f"chat_{self.room.id}"
        self.user_group_name = f"user_{user.id}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.accept()

        redis = await self._get_redis()
        await redis.sadd(self.presence_key, self.channel_name)
        await redis.sadd(self.user_key, self.channel_name)
        await redis.setex(f"presence:chan:{self.channel_name}", 300, user.username)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "user_status",
                "action": "join",
                "username": user.username,
                "channel_name": self.channel_name,
            },
        )

        await self._broadcast_online_users()
        await self._send_history()

        self._presence_task = asyncio.create_task(self._presence_heartbeat())

    async def _presence_heartbeat(self) -> None:
        """Продлевает TTL presence-ключа, пока соединение живо.

        Без него пользователь, который 5 минут ничего не отправляет (не пишет,
        не печатает), выпадает из списка «в сети», хотя веб-сокет открыт.
        Попутно раз в 10 минут чистит presence:user_* от каналов умерших
        соединений (такие сеты не имеют TTL и иначе копились бы вечно).
        """
        try:
            while True:
                await asyncio.sleep(60)
                redis = await self._get_redis()
                await redis.expire(f"presence:chan:{self.channel_name}", 300)
                await self._prune_stale_user_sets(redis)
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa: S110 — фоновая задача; сбой не должен ронять соединение
            pass

    async def _prune_stale_user_sets(self, redis: aioredis.Redis) -> None:
        """Удаляет из presence:user_* каналы, чей presence:chan:* уже истёк.

        Канал «жив», пока существует ключ presence:chan:{channel} (его продлевает
        сердцебиение). Сет presence:user_* сам по себе TTL не имеет, поэтому без
        этой чистки он копил бы каналы умерших/некорректно закрытых соединений.
        Свип идёт под Redis-локом: раз в 10 минут его выполняет ровно одно соединение.
        """
        acquired = await redis.set("presence:prune:lock", "1", nx=True, ex=600)
        if not acquired:
            return
        async for key in redis.scan_iter(match="presence:user_*"):
            channels = await redis.smembers(key)
            if not channels:
                continue
            dead = [
                channel for channel in channels
                if not await redis.exists(f"presence:chan:{channel}")
            ]
            if dead:
                await redis.srem(key, *dead)

    async def disconnect(self, close_code: int) -> None:
        task = getattr(self, "_presence_task", None)
        if task is not None:
            task.cancel()

        if not hasattr(self, "room_group_name"):
            return

        user = self.scope["user"]
        if not user.is_anonymous:
            redis = await self._get_redis()
            await redis.srem(self.presence_key, self.channel_name)
            await redis.srem(self.user_key, self.channel_name)
            await redis.delete(f"presence:chan:{self.channel_name}")

            still_online = await redis.scard(self.user_key)

            if still_online == 0:
                await self._mark_offline(user.id)
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "user_status",
                        "action": "leave",
                        "username": user.username,
                        "channel_name": self.channel_name,
                    },
                )

            await self._broadcast_online_users()

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        user_group = getattr(self, "user_group_name", None)
        if user_group:
            await self.channel_layer.group_discard(user_group, self.channel_name)

        redis = await self._get_redis()
        if await redis.get(self.screen_key) == self.channel_name:
            await redis.delete(self.screen_key)
            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "screen_stop"},
            )

        await self._cleanup_call_on_disconnect(user)

    async def receive(self, text_data: str | None = None, bytes_data: bytes | None = None) -> None:
        if text_data is None:
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self._send_error("Некорректный JSON")
            return

        # ``data.get`` below assumed a mapping, so a bare ``123`` or ``[1,2]``
        # raised AttributeError and tore the socket down.
        if not isinstance(data, dict):
            await self._send_error("Ожидался JSON-объект")
            return

        action = data.get("action", "message")

        # Rate limit so one connection cannot flood a room.
        now = time.monotonic()
        window = 10.0
        budget = getattr(settings, "WS_MESSAGE_BURST", 25)
        self._rate_window_start = getattr(self, "_rate_window_start", now)
        self._rate_count = getattr(self, "_rate_count", 0) + 1
        if now - self._rate_window_start > window:
            self._rate_window_start = now
            self._rate_count = 1
        if self._rate_count > budget:
            await self._send_error("Слишком много запросов, подождите пару секунд")
            return

        # Membership and bans were only ever checked in connect(), so a user
        # banned or removed from a private room afterwards kept an open socket
        # that still received every broadcast. Re-checked on a short interval
        # rather than per frame, to keep the query cost off the hot path.
        if now - getattr(self, "_access_checked_at", 0.0) > 5.0:
            user = self.scope["user"]
            if await self._is_banned_user(user):
                await self._send_error("Вы забанены в этой комнате")
                await self.close()
                return
            if not await self._has_access(user):
                await self._send_error("Нет доступа к комнате")
                await self.close()
                return
            self._access_checked_at = now

        redis = await self._get_redis()
        await redis.expire(f"presence:chan:{self.channel_name}", 300)

        if action == "message":
            await self._handle_message(data)
        elif action == "typing":
            await self._handle_typing(data)
        elif action == "edit":
            await self._handle_edit(data)
        elif action == "delete":
            await self._handle_delete_message(data)
        elif action == "read":
            await self._handle_read(data)
        elif action == "reaction":
            await self._handle_reaction(data)
        elif action == "ai_request":
            await self._handle_ai_request(data)
        elif action == "pin":
            await self._handle_pin(data)
        elif action == "forward":
            await self._handle_forward(data)
        elif action == "screen_share_start":
            await self._handle_screen_share_start()
        elif action == "screen_share_stop":
            await self._handle_screen_share_stop()
        elif action in ("webrtc_offer", "webrtc_answer", "webrtc_candidate"):
            await self._handle_signal(data, action)
        elif action in ("call_start", "call_accept", "call_reject", "call_cancel", "call_hangup"):
            await self._handle_call(data, action)

    async def _handle_message(self, data: dict[str, Any]) -> None:
        message_text, error = validate_message(json.dumps(data))
        if error:
            has_attachment = data.get("attachment_type", "none") != "none"
            if has_attachment:
                message_text = data.get("attachment_name", "") or ""
            else:
                await self._send_error(error)
                return

        user = self.scope["user"]
        reply_to_id = coerce_id(data.get("reply_to_id"))

        if await self._is_banned_user(user):
            await self._send_error("Вы забанены в этой комнате")
            return

        if not await self._can_dm(user, self.room):
            return

        if reply_to_id:
            reply_valid = await self._validate_reply(reply_to_id)
            if not reply_valid:
                await self._send_error("Сообщение для ответа не найдено")
                return

        # These values went straight into the model, where an oversized name or a
        # non-numeric duration raised DataError/ValueError and dropped the socket.
        attachment_type = (
            coerce_text(data.get("attachment_type", "none"), MAX_ATTACHMENT_TYPE_LENGTH)
            or "none"
        )
        attachment_url = coerce_text(data.get("attachment_url"), MAX_ATTACHMENT_URL_LENGTH)
        attachment_name = (
            coerce_text(data.get("attachment_name"), MAX_ATTACHMENT_NAME_LENGTH) or ""
        )
        duration = coerce_duration(data.get("duration"))

        message = await self._create_message(
            user_id=user.id,
            room_id=self.room.id,
            text=message_text,
            reply_to_id=reply_to_id,
            attachment_type=attachment_type,
            attachment_url=attachment_url,
            attachment_name=attachment_name,
            duration=duration,
        )

        reply_data = None
        if message.reply_to:
            reply_data = await self._serialize_message(message.reply_to)

        avatar_url = user.avatar.url if user.avatar else None

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "id": message.id,
                "username": user.username,
                "avatar": avatar_url,
                "message": message.text,
                "created_at": message.created_at.isoformat(),
                "is_edited": False,
                "reply_to": reply_data,
                "sender_channel": self.channel_name,
                "attachment_type": message.attachment_type,
                "attachment_url": message.attachment_url.url if message.attachment_url else None,
                "attachment_name": message.attachment_name,
                "duration": message.duration,
                "transcription": message.transcription,
            },
        )

        await self._notify_room_update(message)

        if (
            message.attachment_type == "none"
            and self.room.room_type == "direct"
            and user.username != settings.AI_ASSISTANT_USERNAME
            and message_text
            and await self._room_has_ai()
        ):
            ai_task = asyncio.create_task(self._enqueue_ai_reply(message_text))
            self._ai_tasks.add(ai_task)
            ai_task.add_done_callback(self._ai_tasks.discard)

    async def _handle_typing(self, data: dict[str, Any]) -> None:
        user = self.scope["user"]
        is_typing = data.get("is_typing", False)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "typing_indicator",
                "username": user.username,
                "is_typing": is_typing,
                "channel_name": self.channel_name,
            },
        )

    async def _handle_edit(self, data: dict[str, Any]) -> None:
        message_id = coerce_id(data.get("message_id"))
        raw_text = data.get("text")
        new_text = raw_text.strip() if isinstance(raw_text, str) else ""

        if not message_id or not new_text:
            await self._send_error("message_id и text обязательны")
            return
        # MAX_MESSAGE_LENGTH used to be enforced on create only, so an edit was a
        # way to write an unbounded body into the room.
        if len(new_text) > MAX_MESSAGE_LENGTH:
            await self._send_error(f"Сообщение длиннее {MAX_MESSAGE_LENGTH} символов")
            return

        user = self.scope["user"]
        success = await self._edit_message(message_id, user.id, new_text)

        if not success:
            await self._send_error("Не удалось отредактировать сообщение")
            return

        message = await self._get_message_by_id(message_id)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "message_edited",
                "id": message.id,
                "message": message.text,
                "updated_at": message.updated_at.isoformat(),
            },
        )

    async def _handle_read(self, data: dict[str, Any]) -> None:
        user = self.scope["user"]
        last_id = coerce_id(data.get("last_message_id"))
        await self._mark_read(user.id, last_id)

    async def _handle_reaction(self, data: dict[str, Any]) -> None:
        message_id = coerce_id(data.get("message_id"))
        raw_emoji = data.get("emoji")
        emoji = raw_emoji.strip() if isinstance(raw_emoji, str) else ""

        if not message_id or not emoji:
            await self._send_error("message_id и emoji обязательны")
            return
        # Reaction.emoji is a CharField(max_length=16); a longer value used to
        # raise DataError and close the socket.
        if len(emoji) > MAX_EMOJI_LENGTH:
            await self._send_error("Слишком длинный эмодзи")
            return

        user = self.scope["user"]
        toggled = await self._toggle_reaction(message_id, user.id, emoji)

        if toggled is None:
            await self._send_error("Сообщение не найдено")
            return

        message = await self._get_message_by_id(message_id)
        if message is None:
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "message_reaction",
                "id": message.id,
                "reactions": await self._get_reactions(message_id),
            },
        )

    async def _handle_ai_request(self, data: dict[str, Any]) -> None:
        prompt = (data.get("prompt") or "").strip()
        if not prompt:
            await self._send_error("Напишите вопрос после /ai")
            return

        # The prompt and this room's recent messages are forwarded to GigaChat,
        # which is disclosed in section 6 of the privacy policy.
        if await self._is_banned_user(self.scope["user"]):
            await self._send_error("Вы забанены в этой комнате")
            return

        await self._enqueue_ai_reply(prompt)

    async def _enqueue_ai_reply(self, prompt: str) -> None:
        """Answer questions one at a time, in the order they arrived."""
        queue = _get_ai_queue(self.room.name)
        queue.pending += 1
        if queue.pending == 1:
            await self._send_ai_typing(True)
        try:
            async with queue.lock:
                await self._generate_ai_reply(prompt)
        except Exception:
            logger.exception("AI reply failed for room %s", self.room.name)
        finally:
            queue.pending -= 1
            if queue.pending == 0:
                await self._send_ai_typing(False)

    async def _send_ai_typing(self, is_typing: bool) -> None:
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "ai_typing", "is_typing": is_typing},
        )

    async def _generate_ai_reply(self, prompt: str) -> None:
        history = await self._get_recent_messages(self.room.id, settings.AI_CONTEXT_MESSAGES)
        history = build_history(history)
        answer = await get_ai_answer(prompt, history)

        if not answer:
            return

        ai_user = await self._get_ai_user()
        message = await self._create_message(
            user_id=ai_user.id,
            room_id=self.room.id,
            text=answer,
        )

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "ai_response",
                "id": message.id,
                "username": ai_user.username,
                "avatar": ai_user.avatar.url if ai_user.avatar else None,
                "message": message.text,
                "created_at": message.created_at.isoformat(),
                "is_edited": False,
                "reply_to": None,
                "sender_channel": self.channel_name,
                "attachment_type": "none",
                "attachment_url": None,
                "attachment_name": "",
                "duration": None,
                "is_ai": True,
            },
        )

    async def _handle_forward(self, data: dict[str, Any]) -> None:
        """Copy a message into another room, keeping the original author."""
        user = self.scope["user"]
        message_id = data.get("message_id")
        target_name = data.get("room") or data.get("to_room")

        if not message_id or not isinstance(message_id, int):
            await self._send_error("\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0441\u044b\u043b\u043a\u0438")
            return
        if not target_name or not isinstance(target_name, str):
            await self._send_error("\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430 \u043a\u043e\u043c\u043d\u0430\u0442\u0430 \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0441\u044b\u043b\u043a\u0438")
            return
        if target_name == self.room.name:
            await self._send_error("\u041d\u0435\u043b\u044c\u0437\u044f \u043f\u0435\u0440\u0435\u0441\u043b\u0430\u0442\u044c \u0432 \u0442\u0443 \u0436\u0435 \u043a\u043e\u043c\u043d\u0430\u0442\u0443")
            return

        result = await self._forward_message(
            user_id=user.id,
            message_id=message_id,
            target_name=target_name,
        )
        if result.get("error"):
            await self._send_error(result["error"])
            return

        payload = result["payload"]
        target_group = result["group"]
        await self.channel_layer.group_send(
            target_group,
            {"type": "chat_message", "sender_channel": self.channel_name, **payload},
        )

    @database_sync_to_async
    def _forward_message(
        self,
        user_id: int,
        message_id: int,
        target_name: str,
    ) -> dict:
        """Validate and create the forwarded copy. Returns payload or error."""
        source_room = ChatRoom.objects.get(id=self.room.id)
        try:
            original = (
                Message.objects.select_related("user", "room")
                .filter(id=message_id, room_id=source_room.id)
                .first()
            )
        except Message.DoesNotExist:
            original = None
        if original is None:
            return {"error": self._ERR_SOURCE}

        # РџРµСЂРµСЃС‹Р»РєР° РёР· Р»РёС‡РЅРѕРіРѕ С‡Р°С‚Р° Р·Р°РїСЂРµС‰РµРЅР°: Р»РёС‡РЅР°СЏ РїРµСЂРµРїРёСЃРєР° РЅРµ РґРѕР»Р¶РЅР°
        # СѓС‚РµРєР°С‚СЊ РІ РґСЂСѓРіРёРµ РєРѕРјРЅР°С‚С‹.
        if original.room.room_type == ChatRoom.RoomType.DIRECT:
            return {"error": self._ERR_FROM_DIRECT}

        target = ChatRoom.objects.filter(name=target_name).first()
        if target is None:
            return {"error": self._ERR_NO_TARGET}
        if target.room_type == ChatRoom.RoomType.DIRECT:
            return {"error": self._ERR_TO_DIRECT}
        if not (
            target.members.filter(id=user_id).exists()
            or target.owner_id == user_id
        ):
            return {"error": self._ERR_NO_ACCESS}

        copy = Message.objects.create(
            user_id=user_id,
            room_id=target.id,
            text=original.text,
            attachment_type=original.attachment_type,
            attachment_url=original.attachment_url.name if original.attachment_url else None,
            attachment_name=original.attachment_name,
            duration=original.duration,
            forwarded_from=original,
        )
        copy = (
            Message.objects.select_related("user", "forwarded_from", "forwarded_from__user")
            .get(id=copy.id)
        )
        return {
            "payload": self._serialize_message_sync(copy),
            "group": f"chat_{target.id}",
        }

    async def _handle_pin(self, data: dict[str, Any]) -> None:
        message_id = coerce_id(data.get("message_id"))
        if not message_id:
            await self._send_error("message_id обязателен")
            return

        user = self.scope["user"]
        pinned = await self._toggle_pin(message_id, user.id)
        if pinned is None:
            await self._send_error("Сообщение не найдено")
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "message_pinned",
                "id": message_id,
                "pinned": pinned,
                "pinned_by": user.username,
            },
        )

    async def _handle_delete_message(self, data: dict[str, Any]) -> None:
        message_id = coerce_id(data.get("message_id"))
        if not message_id:
            await self._send_error("message_id обязателен")
            return

        deleted = await self._delete_message(message_id)
        if deleted is None:
            await self._send_error("Сообщение не найдено")
            return
        if deleted is False:
            await self._send_error("Недостаточно прав")
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "message_deleted",
                "id": message_id,
            },
        )

    # --- Group message handlers ---

    async def chat_message(self, event: dict[str, Any]) -> None:
        reply_to = event.get("reply_to")
        await self.send(text_data=json.dumps({
            "type": "message",
            "id": event["id"],
            "username": event["username"],
            "avatar": event.get("avatar"),
            "message": event["message"],
            "created_at": event["created_at"],
            "is_edited": event.get("is_edited", False),
            "reply_to": reply_to,
            "forwarded_from": event.get("forwarded_from"),
            "is_own": event.get("sender_channel") == self.channel_name,
            "attachment_type": event.get("attachment_type", "none"),
            "attachment_url": event.get("attachment_url"),
            "attachment_name": event.get("attachment_name", ""),
            "duration": event.get("duration"),
            "transcription": event.get("transcription", ""),
        }))

    async def typing_indicator(self, event: dict[str, Any]) -> None:
        if event.get("channel_name") == self.channel_name:
            return
        await self.send(text_data=json.dumps({
            "type": "typing",
            "username": event["username"],
            "is_typing": event["is_typing"],
        }))

    async def user_status(self, event: dict[str, Any]) -> None:
        if event.get("channel_name") == self.channel_name:
            return
        await self.send(text_data=json.dumps({
            "type": "user_status",
            "action": event["action"],
            "username": event["username"],
        }))

    async def room_added(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({
            "type": "room_added",
            "room_id": event.get("room_id"),
            "room_name": event.get("room_name"),
            "room_type": event.get("room_type"),
            "server_id": event.get("server_id"),
            "server_name": event.get("server_name"),
        }))

    async def room_update(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({
            "type": "room_update",
            "room_id": event.get("room_id"),
            "last_message": event.get("last_message"),
            "unread_count": event.get("unread_count"),
        }))

    async def online_users(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({
            "type": "online_users",
            "users": event["users"],
        }))

    async def message_edited(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({
            "type": "message_edited",
            "id": event["id"],
            "message": event["message"],
            "updated_at": event["updated_at"],
        }))

    async def message_reaction(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({
            "type": "reaction",
            "id": event["id"],
            "reactions": event["reactions"],
        }))

    async def ai_typing(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({
            "type": "ai_typing",
            "is_typing": event.get("is_typing", False),
        }))

    async def ai_response(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({
            "type": "message",
            "id": event["id"],
            "username": event["username"],
            "avatar": event.get("avatar"),
            "message": event["message"],
            "created_at": event["created_at"],
            "is_edited": event.get("is_edited", False),
            "reply_to": event.get("reply_to"),
            "is_own": event.get("sender_channel") == self.channel_name,
            "is_ai": True,
            "attachment_type": event.get("attachment_type", "none"),
            "attachment_url": event.get("attachment_url"),
            "attachment_name": event.get("attachment_name", ""),
            "duration": event.get("duration"),
            "transcription": event.get("transcription", ""),
        }))

    async def message_pinned(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({
            "type": "pinned",
            "id": event["id"],
            "pinned": event["pinned"],
            "pinned_by": event.get("pinned_by"),
        }))

    async def message_deleted(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({
            "type": "message_deleted",
            "id": event["id"],
        }))

    # --- Screen share / WebRTC signaling ---

    async def _handle_screen_share_start(self) -> None:
        print(f"[SS] START by {self.scope['user'].username} room={self.room.id} chan={self.channel_name}", flush=True)
        redis = await self._get_redis()
        await redis.set(self.screen_key, self.channel_name)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "screen_start",
                "broadcaster": self.scope["user"].username,
                "from_channel": self.channel_name,
            },
        )

    async def _handle_screen_share_stop(self) -> None:
        redis = await self._get_redis()
        await redis.delete(self.screen_key)
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "screen_stop"},
        )

    async def _handle_signal(self, data: dict[str, Any], signal_type: str) -> None:
        target = (data.get("target") or "").strip()
        print(f"[SS] signal {signal_type} from={self.scope['user'].username} to={target!r}", flush=True)
        if not target:
            await self._send_error("Укажите получателя сигнала (target)")
            return

        target_id = await self._get_user_id(target)
        if target_id is None:
            await self._send_error("Получатель не найден")
            return

        channels = await self._live_user_channels(target_id)

        call_id = data.get("call_id")
        if call_id and len(channels) > 1:
            redis = await self._get_redis()
            caller_chan = await redis.get(f"call:cc:{call_id}")
            raw = await redis.get(f"call:meta:{call_id}")
            try:
                meta = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                meta = None
            sender = self.scope["user"].username
            if meta and meta.get("caller") == sender and meta.get("callee_channel"):
                channels = [meta["callee_channel"]]
            elif caller_chan:
                channels = [caller_chan]

        payload = {
            "type": "signal",
            "signal_type": signal_type,
            "from": self.scope["user"].username,
            "sdp": data.get("sdp"),
            "candidate": data.get("candidate"),
            "call_id": call_id,
        }
        for channel in channels:
            await self.channel_layer.send(channel, {"type": "signal_relay", "payload": payload})

    @database_sync_to_async
    def _get_user_id(self, username: str) -> int | None:
        user = User.objects.filter(username=username).only("id").first()
        return user.id if user else None

    async def screen_start(self, event: dict[str, Any]) -> None:
        print(f"[SS] screen_start -> {self.scope['user'].username} from={event['broadcaster']} chan={self.channel_name} sendchan={event.get('from_channel')}", flush=True)
        if event.get("from_channel") == self.channel_name:
            return
        await self.send(text_data=json.dumps({
            "type": "screen_start",
            "broadcaster": event["broadcaster"],
        }))

    async def screen_stop(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps({"type": "screen_stop"}))

    async def signal_relay(self, event: dict[str, Any]) -> None:
        payload = event["payload"]
        print(f"[SS] relay {payload.get('signal_type')} -> {self.scope['user'].username} from={payload.get('from')} sdp={'yes' if payload.get('sdp') else 'no'} cand={'yes' if payload.get('candidate') else 'no'}", flush=True)
        await self.send(text_data=json.dumps(payload))

    async def call_relay(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps(event["payload"]))

    async def _handle_call(self, data: dict[str, Any], call_action: str) -> None:
        import sys
        print(f"[DBG_HANDLE_CALL] {call_action} target={data.get('target')} call_id={data.get('call_id')}", file=sys.stderr, flush=True)
        """Рассчитывает состояние звонка в Redis и релеит call-события цели.

        Ключи:
          call:act:{room_id}   — SET имён участников активного звонка в комнате;
          call:meta:{call_id}  тАФ JSON {room_id, caller/callee, caller_id/callee_id};
          call:user:{user_id}  — SET call_id активных звонков пользователя.
        """
        target = (data.get("target") or "").strip()
        call_id = (data.get("call_id") or "").strip()
        if not target or not call_id:
            await self._send_error("Укажите получателя и call_id")
            return

        target_id = await self._get_user_id(target)
        if target_id is None:
            await self._send_error("Получатель не найден")
            return

        redis = await self._get_redis()
        caller = self.scope["user"].username
        caller_id = self.scope["user"].id
        room_id = self.room.id

        if call_action == "call_start":
            await redis.set(f"call:cc:{call_id}", self.channel_name, ex=600)
            if await redis.sismember(f"call:act:{room_id}", target):
                await self._send_call_busy(caller, call_id, target)
                return
            await self._call_relay_to(target_id, {
                "type": "call_incoming",
                "call_id": call_id,
                "from": caller,
                "mode": data.get("mode") or "audio",
            })
            return

        if call_action == "call_accept":
            accepted = await redis.set(f"call:accepted:{call_id}", "1", nx=True, ex=600)
            if not accepted:
                return
            await redis.sadd(f"call:act:{room_id}", caller, target)
            await redis.expire(f"call:act:{room_id}", 300)
            # `self` is the callee here: it is the one who accepted, while
            # `target` is the original caller. Recording them the other way
            # round made the signalling route the caller's own SDP back to
            # itself as soon as the callee had more than one open channel.
            caller_chan = await redis.get(f"call:cc:{call_id}")
            meta = json.dumps({
                "room_id": room_id,
                "caller": target, "callee": caller,
                "caller_id": target_id, "callee_id": caller_id,
                "caller_channel": caller_chan,
                "callee_channel": self.channel_name,
            })
            await redis.set(f"call:meta:{call_id}", meta, ex=600)
            await redis.sadd(f"call:user:{caller_id}", call_id)
            await redis.sadd(f"call:user:{target_id}", call_id)
            await redis.expire(f"call:user:{caller_id}", 600)
            await redis.expire(f"call:user:{target_id}", 600)
            event_type = "call_accept"
        elif call_action == "call_reject":
            event_type = "call_reject"
        elif call_action == "call_cancel":
            event_type = "call_cancel"
        elif call_action == "call_hangup":
            await self._end_call(redis, call_id)
            event_type = "call_hangup"
        else:
            return

        relay_channel = None
        if call_action in ("call_accept", "call_reject"):
            caller_chan = await redis.get(f"call:cc:{call_id}")
            if caller_chan:
                relay_channel = caller_chan

        await self._call_relay_to(target_id, {
            "type": event_type,
            "call_id": call_id,
            "from": caller,
        }, relay_channel)

    async def _call_relay_to(self, target_id: int, payload: dict[str, Any], channel: str | None = None) -> None:
        if channel:
            try:
                await self.channel_layer.send(channel, {"type": "call_relay", "payload": payload})
                return
            except Exception as exc:
                print(f"[CALL_RELAY] failed to deliver to channel {channel}: {exc}", file=sys.stderr, flush=True)
        channels = await self._live_user_channels(target_id)
        for channel in channels:
            await self.channel_layer.send(channel, {"type": "call_relay", "payload": payload})

    async def _live_user_channels(self, user_id: int) -> list[str]:
        """Живые каналы пользователя; каналы умерших соединений удаляет из сета.

        Канал считается живым, пока существует ключ presence:chan:{channel}
        (его продлевает сердцебиение каждые 60 секунд). Мёртвые каналы убиваем
        сразу, чтобы релей не слал в них и чтобы presence:user_* не раздувался.
        """
        redis = await self._get_redis()
        key = f"presence:user_{user_id}"
        channels = await redis.smembers(key)
        if not channels:
            return []
        live: list[str] = []
        dead: list[str] = []
        for channel in channels:
            if await redis.exists(f"presence:chan:{channel}"):
                live.append(channel)
            else:
                dead.append(channel)
        if dead:
            await redis.srem(key, *dead)
        return live

    async def _send_call_busy(self, caller: str, call_id: str, busy_username: str) -> None:
        """Отвечает вызывающему, что цель занята (без релея самой цели)."""
        caller_id = await self._get_user_id(caller)
        if caller_id is None:
            return
        channels = await self._live_user_channels(caller_id)
        for channel in channels:
            await self.channel_layer.send(channel, {
                "type": "call_relay",
                "payload": {"type": "call_busy", "call_id": call_id, "from": busy_username},
            })

    async def _end_call(self, redis: aioredis.Redis, call_id: str) -> None:
        """Приводит Redis-состояние звонка в порядок после окончания."""
        raw = await redis.get(f"call:meta:{call_id}")
        try:
            meta = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            meta = None
        if not meta:
            return
        room_id = meta.get("room_id")
        if room_id is not None:
            await redis.srem(f"call:act:{room_id}", meta.get("caller"), meta.get("callee"))
        if meta.get("caller_id") is not None:
            await redis.srem(f"call:user:{meta['caller_id']}", call_id)
        if meta.get("callee_id") is not None:
            await redis.srem(f"call:user:{meta['callee_id']}", call_id)
        await redis.delete(f"call:meta:{call_id}")

    async def _cleanup_call_on_disconnect(self, user) -> None:
        """Если пользователь ушёл из комнаты во время звонка — уведомить собеседника."""
        redis = await self._get_redis()
        call_ids = await redis.smembers(f"call:user:{user.id}")
        if not call_ids:
            return
        for call_id in call_ids:
            raw = await redis.get(f"call:meta:{call_id}")
            try:
                meta = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                meta = None
            if not meta:
                continue
            # `call:user:*` is keyed by user, not by connection, so without this
            # check closing one socket (switching rooms, closing a second tab)
            # tore down a call that was still live on another connection.
            owners = {meta.get("caller_channel"), meta.get("callee_channel")}
            owners.discard(None)
            if owners and self.channel_name not in owners:
                continue
            other = meta.get("callee") if meta.get("caller") == user.username else meta.get("caller")
            await self._end_call(redis, call_id)
            if other:
                other_id = await self._get_user_id(other)
                if other_id is not None:
                    await self._call_relay_to(other_id, {
                        "type": "call_hangup",
                        "call_id": call_id,
                        "from": user.username,
                    })

    # --- Helpers ---

    async def _notify_room_update(self, message: Message) -> None:
        """Шлёт обновление last_message/unread_count остальным участникам комнаты.

        Участник, который не находится сейчас в этой комнате, не подключён к её
        группе chat_{id}, поэтому не получает событие `message`. Здесь же событие
        приходит в его персональную группу user_{id} — фронт обновляет список
        комнат (last_message и счётчик непрочитанных) без перезагрузки.
        """
        member_ids = await self._room_member_ids()
        member_ids.discard(self.scope["user"].id)
        if not member_ids:
            return

        last_message = await self._room_last_message_payload()
        unread_map = await self._room_unread_map(member_ids)

        for uid in member_ids:
            await self.channel_layer.group_send(
                f"user_{uid}",
                {
                    "type": "room_update",
                    "room_id": self.room.id,
                    "last_message": last_message,
                    "unread_count": unread_map.get(uid, 0),
                },
            )

    @database_sync_to_async
    def _room_member_ids(self) -> set[int]:
        ids = set(self.room.members.values_list("id", flat=True))
        if self.room.owner_id:
            ids.add(self.room.owner_id)
        return ids

    @database_sync_to_async
    def _room_last_message_payload(self) -> dict | None:
        last = Message.objects.filter(room_id=self.room.id).select_related("user").order_by("-created_at").first()
        if not last:
            return None
        return {
            "text": last.text[:100],
            "username": last.user.username,
            "created_at": last.created_at.isoformat(),
        }

    @database_sync_to_async
    def _room_unread_map(self, member_ids: set[int]) -> dict[int, int]:
        result: dict[int, int] = {}
        read_statuses: dict[int, set[int]] = defaultdict(set)
        for m_id, u_id in ReadStatus.objects.filter(
            message__room_id=self.room.id
        ).values_list("message_id", "user_id"):
            read_statuses[u_id].add(m_id)

        all_ids = list(
            Message.objects.filter(room_id=self.room.id).values_list("id", "user_id")
        )
        for uid in member_ids:
            read_ids = read_statuses.get(uid, set())
            if not read_ids:
                result[uid] = sum(1 for _, u_id in all_ids if u_id != uid)
                continue
            last_read = max(read_ids)
            result[uid] = sum(
                1 for m_id, u_id in all_ids if u_id != uid and m_id > last_read
            )
        return result

    async def _send_history(self) -> None:
        messages = await self._get_messages(self.room.id)
        await self.send(text_data=json.dumps({
            "type": "history",
            "messages": messages,
        }))

    async def _send_error(self, message: str) -> None:
        await self.send(text_data=json.dumps({
            "type": "error",
            "message": message,
        }))

    @database_sync_to_async
    def _get_room(self, room_name: str) -> ChatRoom | None:
        try:
            return ChatRoom.objects.get(name=room_name)
        except ChatRoom.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_room_by_id(self, room_id: int) -> ChatRoom | None:
        """Поиск по id: переименование комнаты не должно разрывать сокет."""
        try:
            return ChatRoom.objects.select_related("server", "owner").get(id=room_id)
        except ChatRoom.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_ai_user(self):
        username = settings.AI_ASSISTANT_USERNAME
        user, _ = User.objects.get_or_create(
            username=username,
            defaults={
                "email": "ai@albus.local",
                "status": "AI",
            },
        )
        return user

    @database_sync_to_async
    def _get_recent_messages(self, room_id: int, limit: int) -> list[dict[str, Any]]:
        messages = (
            Message.objects
            .filter(room_id=room_id)
            .select_related("user")
            .order_by("-created_at")[:limit]
        )
        messages = list(reversed(messages))
        return [
            {
                "message": m.text,
                "username": m.user.username,
                "is_ai": m.user.username == settings.AI_ASSISTANT_USERNAME,
            }
            for m in messages
        ]

    @database_sync_to_async
    def _has_access(self, user) -> bool:
        # Delegates to the same rule the REST endpoints use, so a room cannot be
        # reachable over the socket while hidden from the list.
        return can_access_room(self.room, user)

    @database_sync_to_async
    def _is_banned_user(self, user) -> bool:
        return is_banned(self.room, user)

    @database_sync_to_async
    def _delete_message(self, message_id: int) -> bool | None:
        message = Message.objects.filter(id=message_id, room_id=self.room.id).first()
        if message is None:
            return None
        if not can_delete_message(self.scope["user"], message):
            return False
        message.delete()
        return True

    @database_sync_to_async
    def _create_message(
        self,
        user_id: int,
        room_id: int,
        text: str,
        reply_to_id: int | None = None,
        attachment_type: str = "none",
        attachment_url: str | None = None,
        attachment_name: str = "",
        duration: int | None = None,
    ) -> Message:
        message = Message.objects.create(
            user_id=user_id,
            room_id=room_id,
            text=text,
            reply_to_id=reply_to_id,
            attachment_type=attachment_type,
            attachment_url=attachment_url,
            attachment_name=attachment_name,
            duration=duration,
        )
        # The caller serialises reply_to right after this returns, on the event
        # loop, so the related row must be fetched here instead of lazily.
        if message.reply_to_id is not None:
            message = Message.objects.select_related(
                "user", "reply_to", "reply_to__user"
            ).get(pk=message.pk)
        return message

    @database_sync_to_async
    def _get_messages(self, room_id: int) -> list[dict]:
        messages = (
            Message.objects
            .filter(room_id=room_id)
            .select_related(
                "user", "reply_to", "reply_to__user", "forwarded_from", "forwarded_from__user"
            )
            .order_by("-created_at")[:50]
        )
        messages = list(reversed(messages))
        return [self._serialize_message_sync(m) for m in messages]

    @database_sync_to_async
    def _serialize_message(self, message: Message) -> dict:
        return self._serialize_message_sync(message)

    def _serialize_message_sync(self, message: Message) -> dict:
        author = message.user
        reply_data = None
        if message.reply_to:
            reply_data = {
                "id": message.reply_to.id,
                "username": _username_of(message.reply_to.user),
                "text": message.reply_to.text[:100],
            }
        forwarded_data = None
        if message.forwarded_from:
            forwarded_data = {
                "id": message.forwarded_from.id,
                "username": _username_of(message.forwarded_from.user),
                "text": message.forwarded_from.text[:100],
            }
        return {
            "id": message.id,
            "username": _username_of(author),
            "avatar": author.avatar.url if author and author.avatar else None,
            "message": message.text,
            "created_at": message.created_at.isoformat(),
            "is_edited": message.is_edited,
            "reply_to": reply_data,
            "forwarded_from": forwarded_data,
            "reactions": self._get_reactions_sync(message.id),
            "attachment_type": message.attachment_type,
            "attachment_url": message.attachment_url.url if message.attachment_url else None,
            "attachment_name": message.attachment_name,
            "duration": message.duration,
            "is_ai": author is not None
            and author.username == settings.AI_ASSISTANT_USERNAME,
            "pinned": message.pinned,
            "transcription": message.transcription,
        }

    @staticmethod
    def _get_reactions_sync(message_id: int) -> list[dict]:
        return [
            {
                "emoji": r.emoji,
                "username": r.user.username,
            }
            for r in Reaction.objects.filter(message_id=message_id).select_related("user")
        ]

    @database_sync_to_async
    def _can_dm(self, user, room: ChatRoom) -> bool:
        if room.room_type != "direct":
            return True
        # ensure_ai_chat puts every user into one single shared "direct" room,
        # so its member list is not a DM peer list. Without this guard one user
        # setting "кто может писать: никто" silently muted the assistant for
        # everybody else too.
        if room.members.filter(username=settings.AI_ASSISTANT_USERNAME).exists():
            return True
        for other in room.members.exclude(id=user.pk):
            if other.message_privacy == User.MessagePrivacy.NOBODY:
                return False
        return True

    @database_sync_to_async
    def _room_has_ai(self) -> bool:
        return self.room.members.filter(username=settings.AI_ASSISTANT_USERNAME).exists()

    @database_sync_to_async
    def _validate_reply(self, reply_to_id: int) -> bool:
        return Message.objects.filter(id=reply_to_id, room_id=self.room.id).exists()

    @database_sync_to_async
    def _edit_message(self, message_id: int, user_id: int, new_text: str) -> bool:
        updated = (
            Message.objects
            .filter(id=message_id, user_id=user_id, room_id=self.room.id)
            .update(text=new_text, is_edited=True)
        )
        return updated > 0

    @database_sync_to_async
    def _get_message_by_id(self, message_id: int) -> Message | None:
        try:
            return Message.objects.get(id=message_id)
        except Message.DoesNotExist:
            return None

    @database_sync_to_async
    def _toggle_reaction(self, message_id: int, user_id: int, emoji: str) -> bool | None:
        message = Message.objects.filter(id=message_id, room_id=self.room.id).first()
        if message is None:
            return None

        reaction = Reaction.objects.filter(
            message_id=message_id,
            user_id=user_id,
            emoji=emoji,
        ).first()

        if reaction is not None:
            reaction.delete()
        else:
            Reaction.objects.get_or_create(
                message_id=message_id,
                user_id=user_id,
                emoji=emoji,
            )
        return True

    @database_sync_to_async
    def _toggle_pin(self, message_id: int, user_id: int) -> bool | None:
        message = Message.objects.filter(id=message_id, room_id=self.room.id).first()
        if message is None:
            return None
        if message.user_id != user_id:
            return None
        message.pinned = not message.pinned
        from django.utils import timezone
        message.pinned_at = timezone.now() if message.pinned else None
        message.save(update_fields=["pinned", "pinned_at"])
        return message.pinned

    @database_sync_to_async
    def _get_reactions(self, message_id: int) -> list[dict]:
        return [
            {
                "emoji": r.emoji,
                "username": r.user.username,
            }
            for r in Reaction.objects.filter(message_id=message_id).select_related("user")
        ]

    @database_sync_to_async
    def _mark_read(self, user_id: int, last_id: int | None) -> None:
        qs = Message.objects.filter(room_id=self.room.id).exclude(user_id=user_id)
        if last_id is not None:
            qs = qs.filter(id__lte=last_id)
        # Newest first. Unread is derived from max(read id) on both the socket
        # and the REST path, so marking the oldest slice (Message.Meta.ordering
        # is ascending) left the badge stuck at the old count until the user had
        # reconnected enough times to walk it forward.
        ids = list(qs.order_by("-id").values_list("id", flat=True)[:200])
        if not ids:
            return
        ReadStatus.objects.bulk_create(
            [ReadStatus(message_id=mid, user_id=user_id) for mid in ids],
            ignore_conflicts=True,
            batch_size=200,
        )

    async def _broadcast_online_users(self) -> None:
        redis = await self._get_redis()
        channel_names = await redis.smembers(self.presence_key)
        usernames: list[str] = []
        dead: list[str] = []
        for channel in channel_names:
            username = await redis.get(f"presence:chan:{channel}")
            if username:
                usernames.append(username)
            else:
                dead.append(channel)
        if dead:
            await redis.srem(self.presence_key, *dead)
        users = await self._online_users_with_avatar(usernames)
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "online_users", "users": users},
        )

    @database_sync_to_async
    def _online_users_with_avatar(self, usernames: list[str]) -> list[dict[str, object]]:
        if not usernames:
            return []
        from users.models import User

        qs = User.objects.filter(username__in=usernames).only("username", "avatar")
        avatar_map = {
            u.username: u.avatar.url if u.avatar else None
            for u in qs
        }
        return [
            {"username": u, "avatar": avatar_map.get(u)}
            for u in sorted(set(usernames))
            if u in avatar_map
        ]

    @database_sync_to_async
    def _mark_offline(self, user_id: int) -> None:
        from users.models import User

        User.objects.filter(id=user_id).update(status="")

