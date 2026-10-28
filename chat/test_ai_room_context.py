
import pytest
from asgiref.sync import sync_to_async


@pytest.mark.django_db(transaction=True)
class TestAiRoomContext:
    """Контекст ассистента ограничен комнатой, в которой задан вопрос."""

    async def _ask(self, room, asker, prompt, monkeypatch):
        from channels.testing import WebsocketCommunicator

        from conftest import ws_application

        seen = []

        async def _fake(prompt, history):
            seen.append(list(history))
            return "ok"

        monkeypatch.setattr("chat.consumers.get_ai_answer", _fake)
        communicator = WebsocketCommunicator(ws_application(), f"/ws/chat/{room.name}/")
        communicator.scope["user"] = asker
        communicator.scope["headers"] = [
            (b"host", b"testserver"),
            (b"origin", b"https://testserver"),
        ]
        connected, _ = await communicator.connect()
        assert connected
        await communicator.send_json_to({"action": "ai_request", "prompt": prompt})
        for _ in range(30):
            frame = await communicator.receive_json_from(timeout=5)
            if frame.get("type") == "message" and frame.get("is_ai"):
                break
        await communicator.disconnect()
        return seen

    async def test_personal_rooms_do_not_share_history(
        self, owner, stranger, settings, monkeypatch
    ):
        """Вопросы другого пользователя не попадают в контекст личного чата."""
        from django.contrib.auth import get_user_model

        from chat.models import ChatRoom, Message
        from chat.serializers import direct_room_name

        user_model = get_user_model()
        ai = await sync_to_async(user_model.objects.create_user)(
            username=settings.AI_ASSISTANT_USERNAME, password="x"
        )
        owner_room = await sync_to_async(ChatRoom.objects.create)(
            name=direct_room_name(owner.id, ai.id),
            owner=owner,
            room_type="direct",
            is_private=True,
        )
        stranger_room = await sync_to_async(ChatRoom.objects.create)(
            name=direct_room_name(stranger.id, ai.id),
            owner=stranger,
            room_type="direct",
            is_private=True,
        )
        await sync_to_async(owner_room.members.add)(owner, ai)
        await sync_to_async(stranger_room.members.add)(stranger, ai)
        await sync_to_async(Message.objects.create)(
            room=owner_room, user=owner, text="мой вопрос"
        )
        await sync_to_async(Message.objects.create)(
            room=stranger_room, user=stranger, text="секретный вопрос постороннего"
        )

        seen = await self._ask(owner_room, owner, "вопрос", monkeypatch)
        texts = [m["text"] for m in seen[0]]
        assert "мой вопрос" in texts
        assert "секретный вопрос постороннего" not in texts

    async def test_team_room_keeps_shared_context(
        self, owner, stranger, group_room, monkeypatch
    ):
        """В общей комнате чужие сообщения — осмысленный контекст, их оставляем."""
        from chat.models import Message

        await sync_to_async(Message.objects.create)(
            room=group_room, user=stranger, text="коллега спросил"
        )
        seen = await self._ask(group_room, owner, "вопрос", monkeypatch)
        texts = [m["text"] for m in seen[0]]
        assert "коллега спросил" in texts
