
import pytest
from asgiref.sync import sync_to_async


@pytest.mark.django_db(transaction=True)
class TestSharedAiRoomContext:
    """Личная комната ассистента одна на всех: контекст не должен быть общим."""

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

    async def test_only_asker_messages_reach_the_model(
        self, owner, stranger, settings, monkeypatch
    ):
        """Чужой вопрос не должен уходить в GigaChat как контекст чужого."""
        from chat.models import ChatRoom, Message

        ai_name = settings.AI_ASSISTANT_USERNAME
        room = await ChatRoom.objects.acreate(
            name=ai_name, owner=owner, room_type="direct", is_private=True
        )
        await sync_to_async(room.members.add)(owner, stranger)
        await sync_to_async(Message.objects.create)(
            room=room, user=stranger, text="секретный вопрос постороннего"
        )
        await sync_to_async(Message.objects.create)(
            room=room, user=owner, text="мой вопрос"
        )

        seen = await self._ask(room, owner, "вопрос", monkeypatch)
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
