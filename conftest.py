"""Общие фикстуры для тестов Albus."""

from typing import Any

import pytest
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.urls import path

from chat.consumers import ChatConsumer
from chat.models import ChatRoom, Message


@pytest.fixture(autouse=True)
def disable_throttling(request, monkeypatch):
    """Keep rate limits out of the way of unrelated tests.

    DRF captures THROTTLE_RATES on the class at import time, so tweaking the
    settings has no effect once the app is loaded. The limiter is therefore
    short-circuited here, and tests that assert on throttling opt out with
    @pytest.mark.no_throttle.
    """
    if request.node.get_closest_marker("no_throttle"):
        return None
    from rest_framework.throttling import SimpleRateThrottle

    monkeypatch.setattr(
        SimpleRateThrottle,
        "allow_request",
        lambda self, request, view=None: True,
    )
    return None


class FakeRedis:
    """Минимальный in-memory аналог того подмножества Redis, что использует консьюмер."""

    def __init__(self) -> None:
        self.store: dict[str, object] = {}

    async def sadd(self, key: str, *values: str) -> int:
        self.store.setdefault(key, set()).update(values)
        return 1

    async def srem(self, key: str, *values: str) -> int:
        bucket = self.store.setdefault(key, set())
        for value in values:
            bucket.discard(value)
        return 1

    async def scard(self, key: str) -> int:
        return len(self.store.get(key, set()))

    async def smembers(self, key: str) -> set[str]:
        return set(self.store.get(key, set()))

    async def sismember(self, key: str, value: str) -> int:
        return 1 if value in self.store.get(key, set()) else 0

    async def setex(self, key: str, _ttl: int, value: object) -> None:
        self.store[key] = value

    async def set(self, key: str, value: object, nx: bool = False, **_kwargs) -> bool:
        if nx and key in self.store:
            return False
        self.store[key] = value
        return True

    async def get(self, key: str) -> object | None:
        return self.store.get(key)

    async def exists(self, key: str) -> int:
        return 1 if key in self.store else 0

    async def delete(self, key: str) -> int:
        self.store.pop(key, None)
        return 1

    async def expire(self, key: str, _ttl: int) -> bool:
        return True

    async def scan_iter(self, match: str = "*") -> Any:
        prefix = match.rstrip("*")
        for key in list(self.store):
            if key.startswith(prefix):
                yield key

    def flush(self) -> None:
        self.store.clear()


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    redis = FakeRedis()
    monkeypatch.setattr(ChatConsumer, "redis_pool", redis)
    return redis


@pytest.fixture()
def user(db):
    return get_user_model().objects.create_user(username="user", password="Xk7pQm2vRt")


@pytest.fixture()
def owner(db):
    return get_user_model().objects.create_user(username="owner", password="Xk7pQm2vRt")


@pytest.fixture()
def moderator(db):
    return get_user_model().objects.create_user(username="moderator", password="Xk7pQm2vRt", role="moderator")


@pytest.fixture()
def admin(db):
    return get_user_model().objects.create_user(username="admin", password="Xk7pQm2vRt", role="admin")


@pytest.fixture()
def stranger(db):
    return get_user_model().objects.create_user(username="stranger", password="Xk7pQm2vRt")


@pytest.fixture()
def superuser(db):
    return get_user_model().objects.create_superuser(username="superuser", password="Xk7pQm2vRt")


def make_message(room: ChatRoom, author, text: str = "hello") -> Message:
    return Message.objects.create(room=room, user=author, text=text)


@pytest.fixture()
def group_room(owner, member, moderator):
    room = ChatRoom.objects.create(name="group-room", owner=owner, room_type="group")
    room.members.add(owner, member, moderator)
    return room


@pytest.fixture()
def other_room(owner, member):
    """A second group room that can receive forwarded messages."""
    room = ChatRoom.objects.create(name="other-room", owner=owner, room_type="group")
    room.members.add(owner, member)
    return room


@pytest.fixture()
def dm_room_factory(db):
    """Creates a direct room between two users, as the app would."""

    def _make(a, b):
        low, high = sorted((a.id, b.id))
        room = ChatRoom.objects.create(
            name=f"dm-{low}-{high}",
            owner=a,
            room_type="direct",
        )
        room.members.add(a, b)
        return room

    return _make


@pytest.fixture()
def member(db):
    return get_user_model().objects.create_user(username="member", password="Xk7pQm2vRt")


@pytest.fixture()
def owner_message(group_room, owner):
    return make_message(group_room, owner, "hello from owner")


@pytest.fixture()
def member_message(group_room, member):
    return make_message(group_room, member, "hello from member")


@pytest.fixture()
def api_client():
    from rest_framework.test import APIClient

    return APIClient()


def ws_application():
    return URLRouter(
        [
            path("ws/chat/<str:room_name>/", ChatConsumer.as_asgi()),
        ]
    )


async def connect_ws(user, room_name: str) -> tuple[WebsocketCommunicator, bool]:
    communicator = WebsocketCommunicator(ws_application(), f"/ws/chat/{room_name}/")
    communicator.scope["user"] = user
    # a real browser always sends Origin on the WebSocket handshake
    communicator.scope["headers"] = [
        (b"host", b"testserver"),
        (b"origin", b"https://testserver"),
    ]
    connected, _ = await communicator.connect()
    return communicator, connected


@pytest.fixture()
def ws_connect():
    async def _connect(user, room_name: str):
        return await connect_ws(user, room_name)

    return _connect
