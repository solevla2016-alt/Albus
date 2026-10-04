import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0013_normalize_direct_room_names"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="forwarded_from",
            field=models.ForeignKey(
                blank=True,
                help_text="Оригинал, если сообщение переслано",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="forwards",
                to="chat.message",
            ),
        ),
    ]
