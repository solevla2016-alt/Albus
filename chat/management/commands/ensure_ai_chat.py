"""Управляющая команда: гарантирует direct-чат с AI-ассистентом у каждого пользователя.

Создаёт (при необходимости) учётную запись AI-ассистента и единую direct-комнату
с ним, добавляя в неё всех пользователей, чтобы чат был заранее
в списке «Сообщения» у каждого.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from chat.models import ChatRoom

User = get_user_model()


class Command(BaseCommand):
    help = "Гарантирует наличие direct-чата с AI-ассистентом у каждого пользователя"

    def handle(self, *args: object, **options: object) -> None:
        ai_username = settings.AI_ASSISTANT_USERNAME
        ai_user, _ = User.objects.get_or_create(
            username=ai_username,
            defaults={
                "email": "ai@albus.local",
                "status": "AI",
            },
        )

        room, room_created = ChatRoom.objects.get_or_create(
            name=ai_username,
            defaults={
                "room_type": ChatRoom.RoomType.DIRECT,
                "owner": ai_user,
                "is_private": True,
            },
        )

        ids = User.objects.exclude(id=ai_user.id).values_list("id", flat=True)
        existing = set(room.members.filter(id__in=ids).values_list("id", flat=True))
        new_ids = [uid for uid in ids if uid not in existing]
        if new_ids:
            room.members.add(*new_ids)

        room.members.add(ai_user)

        self.stdout.write(
            self.style.SUCCESS(
                f"AI чат обеспечен: room={room.id} (created={room_created}), "
                f"добавлено пользователей={len(new_ids)}, всего членов={room.members.count()}"
            )
        )
