import uuid

from django.conf import settings
from django.db import models


class Server(models.Model):
    """Сервер (сообщество) — верхний уровень организации."""

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")
    avatar = models.ImageField(
        upload_to="server_icons/",
        blank=True,
        null=True,
    )
    invite_token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        help_text="Токен для ссылки-приглашения на сервер",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_servers",
    )
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="servers",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class ChatRoom(models.Model):
    """Комната чата Albus."""

    class RoomType(models.TextChoices):
        GROUP = "group", "Группа"
        CHANNEL = "channel", "Канал"
        DIRECT = "direct", "Личный чат"

    name = models.CharField(max_length=100, unique=True)
    room_type = models.CharField(
        max_length=10,
        choices=RoomType.choices,
        default=RoomType.GROUP,
    )
    server = models.ForeignKey(
        Server,
        on_delete=models.CASCADE,
        related_name="rooms",
        null=True,
        blank=True,
    )
    description = models.TextField(blank=True, default="")
    avatar = models.ImageField(upload_to="chat_rooms/", blank=True, null=True)
    is_private = models.BooleanField(default=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_rooms",
    )
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="chat_rooms",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class RoomBan(models.Model):
    """Бан пользователя в комнате."""

    room = models.ForeignKey(
        ChatRoom,
        on_delete=models.CASCADE,
        related_name="bans",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="room_bans",
    )
    banned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bans_issued",
    )
    reason = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Ограничение по времени (None — бан бессрочный)",
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["room", "user"], name="unique_room_user_ban"),
        ]

    @property
    def is_active(self) -> bool:
        from django.utils import timezone

        if self.expires_at is None:
            return True
        return self.expires_at > timezone.now()

    def __str__(self) -> str:
        return f"{self.user.username} banned in {self.room.name}"


class Message(models.Model):
    """Сообщение в чате."""

    class AttachmentType(models.TextChoices):
        NONE = "none", "Нет"
        IMAGE = "image", "Изображение"
        AUDIO = "audio", "Аудио"
        VIDEO = "video", "Видео"
        FILE = "file", "Файл"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    room = models.ForeignKey(
        ChatRoom,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    text = models.TextField(blank=True, default="")
    reply_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replies",
    )
    is_edited = models.BooleanField(default=False)
    forwarded_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="forwards",
        help_text="Оригинал, если сообщение переслано",
    )
    attachment_type = models.CharField(
        max_length=10,
        choices=AttachmentType.choices,
        default=AttachmentType.NONE,
    )
    attachment_url = models.FileField(
        upload_to="attachments/",
        blank=True,
        null=True,
    )
    attachment_name = models.CharField(max_length=255, blank=True, default="")
    duration = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Длительность аудио/видео в секундах",
    )
    pinned = models.BooleanField(default=False)
    pinned_at = models.DateTimeField(null=True, blank=True)
    transcription = models.TextField(blank=True, default="", help_text="Транскрипция голосового сообщения")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["room", "created_at"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self) -> str:
        prefix = f"[{self.attachment_type}] " if self.attachment_type != "none" else ""
        return f"{prefix}{self.user.username}: {self.text[:50]}"


class ReadStatus(models.Model):
    """Отметка о прочтении сообщения пользователем."""

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="read_statuses",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="read_statuses",
    )
    read_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["message", "user"],
                name="unique_message_user_read",
            )
        ]
        indexes = [
            models.Index(fields=["message"]),
        ]

    def __str__(self) -> str:
        return f"{self.user.username} read msg {self.message_id}"


class Reaction(models.Model):
    """Реакция (эмодзи) на сообщение."""

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    emoji = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["message", "user", "emoji"],
                name="unique_message_user_emoji",
            )
        ]
        indexes = [
            models.Index(fields=["message"]),
        ]

    def __str__(self) -> str:
        return f"{self.user.username}: {self.emoji} on {self.message_id}"


class BugReport(models.Model):
    """A problem reported by a user from inside the app."""

    class Status(models.TextChoices):
        NEW = "new", "Новое"
        IN_PROGRESS = "in_progress", "В работе"
        RESOLVED = "resolved", "Решено"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bug_reports",
    )
    text = models.TextField()
    page_url = models.CharField(max_length=500, blank=True, default="")
    user_agent = models.CharField(max_length=300, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
    )
    admin_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user.username}: {self.text[:40]}"

