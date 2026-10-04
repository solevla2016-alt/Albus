from django.db import migrations

DIRECT = "direct"
AI_USERNAME = "AI Assistant"


def pair_name(member_ids):
    humans = sorted(member_ids)
    if len(humans) != 2:
        return None
    return f"dm-{humans[0]}-{humans[1]}"


def forwards(apps, schema_editor):
    ChatRoom = apps.get_model("chat", "ChatRoom")
    User = apps.get_model("users", "User")

    ai_ids = set(
        User.objects.filter(username=AI_USERNAME).values_list("id", flat=True)
    )

    by_pair = {}
    for room in ChatRoom.objects.filter(room_type=DIRECT).order_by("id"):
        if room.name == AI_USERNAME:
            continue
        member_ids = list(room.members.values_list("id", flat=True))
        if ai_ids & set(member_ids):
            continue
        name = pair_name(member_ids)
        if name is None:
            continue
        by_pair.setdefault(name, []).append(room)

    for name, rooms in by_pair.items():
        keeper = rooms[0]
        for extra in rooms[1:]:
            _merge_room(apps, extra, keeper)
            extra.delete()
        if keeper.name != name and not ChatRoom.objects.filter(name=name).exists():
            keeper.name = name
            keeper.save(update_fields=["name"])


def _merge_room(apps, source, target):
    """Переносит содержимое source в target.

    ReadStatus и Reaction ссылаются на Message, поэтому переезжают
    вместе с сообщениями автоматически.
    """
    for model_name in ("Message", "RoomBan"):
        model = apps.get_model("chat", model_name)
        model.objects.filter(room=source).update(room=target)


def backwards(apps, schema_editor):
    """Переименование восстановить нельзя: исходное имя не сохраняется."""


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0012_roomban"),
        ("users", "0004_passwordresettoken"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
