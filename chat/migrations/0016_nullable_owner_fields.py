"""Rewrites the account-deletion flow so it never orphans a row.

Deleting a user hits CASCADE on Message.user, RoomBan.banned_by and
ChatRoom.owner. The messages must survive, because deleting them would strip
the history from every other participant in the conversation. So the foreign
keys are made nullable first, and the view anonymises instead of cascading.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0015_bugreport"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="message",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="messages",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="roomban",
            name="banned_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="bans_issued",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="chatroom",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="owned_rooms",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
