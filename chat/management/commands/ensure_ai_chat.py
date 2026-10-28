"""Управляющая команда: создаёт каждому пользователю отдельный чат с ассистентом.

Раньше все пользователи состояли в одной общей комнате: любой видел вопросы
и ответы остальных. Теперь у каждого свой direct-чат, доступный только ему и
боту. Старая общая комната сохраняется в базе, но людей из неё убираем.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from chat.models import ChatRoom
from chat.serializers import direct_room_name

User = get_user_model()


class Command(BaseCommand):
    help = "Создаёт персональный direct-чат с AI-ассистентом каждому пользователю"

    def handle(self, *args: object, **options: object) -> None:
        ai_username = settings.AI_ASSISTANT_USERNAME
        ai_user, _ = User.objects.get_or_create(
            username=ai_username,
            defaults={
                "email": "ai@albus.local",
                "status": "AI",
            },
        )

        legacy_rooms = ChatRoom.objects.filter(name=ai_username)
        for legacy in legacy_rooms:
            human_ids = list(
                legacy.members.exclude(id=ai_user.id).values_list("id", flat=True)
            )
            if human_ids:
                legacy.members.remove(*human_ids)
            if legacy.owner_id != ai_user.id:
                legacy.owner = ai_user
                legacy.save(update_fields=["owner"])

        created_count = 0
        for user in User.objects.exclude(id=ai_user.id).iterator():
            room, created = ChatRoom.objects.get_or_create(
                name=direct_room_name(user.id, ai_user.id),
                defaults={
                    "room_type": ChatRoom.RoomType.DIRECT,
                    "owner": user,
                    "is_private": True,
                },
            )
            if created:
                created_count += 1
            if room.owner_id != user.id:
                room.owner = user
                room.save(update_fields=["owner"])
            room.members.add(user, ai_user)

        self.stdout.write(
            self.style.SUCCESS(
                f"AI чаты обеспечены: создано={created_count}, "
                f"старых общих комнат обезличено={legacy_rooms.count()}"
            )
        )
