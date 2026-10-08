"""Права доступа и модерация Albus."""

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import ChatRoom, Message, RoomBan

User = get_user_model()


def user_role(user: User) -> str:
    """Эффективная роль: staff/superuser всегда администратор."""
    if user.is_superuser or user.is_staff:
        return User.Role.ADMIN
    return user.role


def is_admin(user: User) -> bool:
    return user_role(user) == User.Role.ADMIN


def is_moderator(user: User) -> bool:
    return user_role(user) == User.Role.MODERATOR


def can_moderate(user: User, room: ChatRoom) -> bool:
    """Может ли пользователь модерировать комнату (бан, удаление чужих сообщений)."""
    if is_admin(user):
        return True
    if room.owner_id == user.id:
        return True
    if room.server_id and room.server.owner_id == user.id:
        return True
    if is_moderator(user) and room.members.filter(id=user.id).exists():
        return True
    return False


def can_delete_message(user: User, message: Message) -> bool:
    """Автор удаляет своё сообщение; модератор — чужое, но не владельца/админа."""
    if message.user_id == user.id:
        return True
    if is_admin(user):
        return True
    author = message.user
    room = message.room
    if author is None:
        # the account was deleted, so authorship is anonymised and there is
        # nobody left whose privileges could be abused
        return can_moderate(user, room)
    if is_admin(author) or room.owner_id == author.id:
        return False
    if room.server_id and room.server.owner_id == author.id:
        return False
    return can_moderate(user, room)


def can_ban(user: User, room: ChatRoom, target: User) -> bool:
    """Нельзя забанить себя, администратора и владельцев комнаты/сервера."""
    if user.id == target.id:
        return False
    if is_admin(target):
        return False
    if room.owner_id == target.id:
        return False
    if room.server_id and room.server.owner_id == target.id:
        return False
    return can_moderate(user, room)


def _ban_queryset(room: ChatRoom, target: User):
    return RoomBan.objects.filter(room=room, user=target)


def is_banned(room: ChatRoom, target: User) -> bool:
    """Есть ли активный (не истёкший) бан у пользователя в комнате."""
    now = timezone.now()
    return _ban_queryset(room, target).filter(
        expires_at__isnull=True,
    ).exists() or _ban_queryset(room, target).filter(
        expires_at__gt=now,
    ).exists()


def ban_user(room: ChatRoom, target: User, actor: User, reason: str = "", expires_at=None) -> RoomBan:
    """Создать/обновить бан и исключить пользователя из участников комнаты."""
    ban, _ = RoomBan.objects.update_or_create(
        room=room,
        user=target,
        defaults={
            "banned_by": actor,
            "reason": reason,
            "expires_at": expires_at,
        },
    )
    room.members.remove(target)
    return ban


def unban_user(room: ChatRoom, target: User) -> None:
    _ban_queryset(room, target).delete()
