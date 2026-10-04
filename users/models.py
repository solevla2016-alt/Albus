from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Модель пользователя Albus."""

    class Role(models.TextChoices):
        MEMBER = "member", "Пользователь"
        MODERATOR = "moderator", "Модератор"
        ADMIN = "admin", "Администратор"

    class MessagePrivacy(models.TextChoices):
        EVERYONE = "everyone", "Все"
        CONTACTS = "contacts", "Контакты"
        NOBODY = "nobody", "Никто"

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.MEMBER,
        help_text="Роль пользователя в сервисе",
    )

    avatar = models.ImageField(
        upload_to="avatars/%Y/%m",
        blank=True,
        null=True,
    )
    status = models.CharField(
        max_length=200,
        blank=True,
        default="",
    )
    birth_date = models.DateField(
        blank=True,
        null=True,
        help_text="Дата рождения",
    )
    message_privacy = models.CharField(
        max_length=20,
        choices=MessagePrivacy.choices,
        default=MessagePrivacy.EVERYONE,
        help_text="Кто может отправлять мне сообщения",
    )

    # --- consent to the terms of use and to personal data processing ---
    terms_accepted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="\u041a\u043e\u0433\u0434\u0430 \u043f\u0440\u0438\u043d\u044f\u0442\u044b \u043f\u0440\u0430\u0432\u0438\u043b\u0430 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435 \u0440\u0430\u0432\u0435\u043b",
    )
    terms_version = models.CharField(
        max_length=16,
        blank=True,
        default="",
        help_text="\u0412\u0435\u0440\u0441\u0438\u044f \u043f\u0440\u0430\u0432\u0438\u043b, \u043f\u0440\u0438\u043d\u044f\u0442\u044b\u0435 \u043f\u0440\u0438 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438",
    )
    privacy_accepted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="\u041a\u043e\u0433\u0434\u0430 \u0434\u0430\u043d\u043e \u0441\u043e\u0433\u043b\u0430\u0441\u0438\u0435 \u043d\u0430 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0443 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0445 \u0434\u0430\u043d\u043d\u044b\u0445",
    )
    privacy_version = models.CharField(
        max_length=16,
        blank=True,
        default="",
    )


    class Meta:
        ordering = ["-date_joined"]

    def __str__(self) -> str:
        return self.username


class PasswordResetToken(models.Model):
    """Одноразовый токен восстановления пароля (ссылка из письма Resend)."""

    user = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Reset token {self.user_id} ({self.token[:8]}…)"
