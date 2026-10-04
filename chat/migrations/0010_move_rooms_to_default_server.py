"""Перенос существующих комнат в сервер Albus."""

from django.db import migrations


def move_rooms_to_default_server(apps, schema_editor):
    Server = apps.get_model("chat", "Server")
    ChatRoom = apps.get_model("chat", "ChatRoom")
    User = apps.get_model("users", "User")

    owner = (
        User.objects.filter(is_superuser=True).first()
        or User.objects.filter(is_staff=True).first()
        or User.objects.first()
    )
    if owner is None:
        return

    server, _ = Server.objects.get_or_create(
        name="Albus",
        defaults={
            "description": "Основной сервер команды",
            "owner": owner,
        },
    )
    server.members.add(*User.objects.all())

    ChatRoom.objects.filter(room_type__in=("group", "channel")).update(server=server)


def reverse(apps, schema_editor):
    Server = apps.get_model("chat", "Server")
    ChatRoom = apps.get_model("chat", "ChatRoom")
    ChatRoom.objects.update(server=None)
    Server.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0009_server_support"),
    ]

    operations = [
        migrations.RunPython(move_rooms_to_default_server, reverse),
    ]
