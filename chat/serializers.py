from django.conf import settings
from rest_framework import serializers

from .models import ChatRoom, Message, ReadStatus, Server


def direct_room_name(user_a_id: int, user_b_id: int) -> str:
    low, high = sorted((user_a_id, user_b_id))
    return f"dm-{low}-{high}"


class ServerSerializer(serializers.ModelSerializer):
    owner = serializers.CharField(source="owner.username", read_only=True)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Server
        fields = ("id", "name", "description", "avatar", "owner", "member_count", "created_at")

    def get_member_count(self, obj: Server) -> int:
        return obj.members.count() + 1


class MessageSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    avatar = serializers.SerializerMethodField()
    reply_to = serializers.SerializerMethodField()
    forwarded_from = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ("id", "username", "avatar", "text", "reply_to", "forwarded_from", "is_edited", "created_at", "updated_at", "reactions", "attachment_type", "attachment_url", "attachment_name", "duration", "pinned", "transcription")

    def get_forwarded_from(self, obj: Message) -> dict | None:
        if not obj.forwarded_from:
            return None
        return {
            "id": obj.forwarded_from.id,
            "username": obj.forwarded_from.user.username,
            "text": obj.forwarded_from.text[:100],
        }

    def get_avatar(self, obj: Message) -> str | None:
        if obj.user.avatar:
            return obj.user.avatar.url
        return None

    def get_reply_to(self, obj: Message) -> dict | None:
        if not obj.reply_to:
            return None
        return {
            "id": obj.reply_to.id,
            "username": obj.reply_to.user.username,
            "text": obj.reply_to.text[:100],
        }

    def get_reactions(self, obj: Message) -> list[dict]:
        return [
            {
                "emoji": r.emoji,
                "username": r.user.username,
            }
            for r in obj.reactions.select_related("user")
        ]


class ChatRoomSerializer(serializers.ModelSerializer):
    owner = serializers.CharField(source="owner.username", read_only=True)
    member_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    is_ai = serializers.SerializerMethodField()
    peer_id = serializers.SerializerMethodField()
    peer_username = serializers.SerializerMethodField()
    server = serializers.PrimaryKeyRelatedField(read_only=True)
    server_name = serializers.CharField(source="server.name", read_only=True, default="")

    class Meta:
        model = ChatRoom
        fields = ("id", "name", "description", "avatar", "is_private", "room_type", "owner", "member_count", "members", "last_message", "unread_count", "server", "server_name", "is_ai", "peer_id", "peer_username", "created_at")

    def _resolve_peer(self, obj: ChatRoom):
        if obj.room_type != ChatRoom.RoomType.DIRECT:
            return None
        ai_username = settings.AI_ASSISTANT_USERNAME
        members = list(obj.members.all())
        if obj.name == ai_username:
            return next((m for m in members if m.username == ai_username), None)
        request = self.context.get("request")
        me = getattr(request, "user", None)
        if not me or me.is_anonymous:
            return None
        return next((m for m in members if m.id != me.id), None)

    def get_peer_id(self, obj: ChatRoom) -> int | None:
        peer = self._resolve_peer(obj)
        return peer.id if peer else None

    def get_peer_username(self, obj: ChatRoom) -> str | None:
        peer = self._resolve_peer(obj)
        return peer.username if peer else None

    def get_is_ai(self, obj: ChatRoom) -> bool:
        return (
            obj.room_type == ChatRoom.RoomType.DIRECT
            and obj.name == settings.AI_ASSISTANT_USERNAME
        )

    def get_members(self, obj: ChatRoom) -> list[dict]:
        ai_username = settings.AI_ASSISTANT_USERNAME
        users = obj.members.select_related().order_by("username")
        result = [
            {
                "id": u.id,
                "username": u.username,
                "avatar": u.avatar.url if u.avatar else None,
                "role": u.role,
                "is_ai": u.username == ai_username,
            }
            for u in users
        ]
        if obj.owner and not any(m["id"] == obj.owner.id for m in result):
            result.insert(0, {
                "id": obj.owner.id,
                "username": obj.owner.username,
                "avatar": obj.owner.avatar.url if obj.owner.avatar else None,
                "role": obj.owner.role,
                "is_ai": obj.owner.username == ai_username,
            })
        return result

    def get_member_count(self, obj: ChatRoom) -> int:
        return obj.members.count() + 1

    def get_unread_count(self, obj: ChatRoom) -> int:
        user = self.context.get("request").user
        if not user or user.is_anonymous:
            return 0
        read_ids = (
            ReadStatus.objects
            .filter(user=user, message__room=obj)
            .values_list("message_id", flat=True)
        )
        last_read = obj.messages.filter(id__in=read_ids).order_by("-id").values_list("id", flat=True).first()
        if not last_read:
            return obj.messages.exclude(user=user).count()
        return obj.messages.filter(id__gt=last_read).exclude(user=user).count()

    def get_last_message(self, obj: ChatRoom) -> dict | None:
        last = obj.messages.select_related("user").order_by("-created_at").first()
        if not last:
            return None
        return {
            "text": last.text[:100],
            "username": last.user.username,
            "created_at": last.created_at.isoformat(),
        }


class ChatRoomCreateSerializer(serializers.ModelSerializer):
    server = serializers.PrimaryKeyRelatedField(
        queryset=Server.objects.all(),
        required=False,
        allow_null=True,
    )
    name = serializers.CharField(max_length=100)

    class Meta:
        model = ChatRoom
        fields = ("name", "description", "is_private", "room_type", "server")

    def create(self, validated_data: dict) -> ChatRoom:
        from django.contrib.auth import get_user_model

        user_model = get_user_model()
        request = self.context["request"]
        server = validated_data.pop("server", None)
        description = validated_data.pop("description", "")
        is_private = validated_data.pop("is_private", False)

        room_type = validated_data.get("room_type")

        if room_type == ChatRoom.RoomType.DIRECT:
            other = user_model.objects.filter(
                username__iexact=validated_data.get("name", "")
            ).first()
            if other is None:
                raise serializers.ValidationError(
                    {"direct": "Пользователь с таким именем не найден"}
                )
            if other.id == request.user.id:
                raise serializers.ValidationError(
                    {"direct": "Нельзя создать личный чат с самим собой"}
                )

            ai_username = settings.AI_ASSISTANT_USERNAME
            if other.username != ai_username:
                privacy = other.message_privacy
                if privacy == user_model.MessagePrivacy.NOBODY:
                    raise serializers.ValidationError(
                        {"direct": f"{other.username} запретил(а) личные сообщения"}
                    )
                if privacy == user_model.MessagePrivacy.CONTACTS:
                    has_dm = ChatRoom.objects.filter(
                        room_type=ChatRoom.RoomType.DIRECT,
                        members=request.user,
                    ).filter(members=other).exists()
                    if not has_dm:
                        raise serializers.ValidationError(
                            {"direct": f"{other.username} принимает сообщения только от контактов"}
                        )

                target_name = direct_room_name(request.user.id, other.id)
            else:
                target_name = ai_username

            room, _created = ChatRoom.objects.get_or_create(
                name=target_name,
                defaults={
                    "owner": request.user,
                    "server": server,
                    "description": description,
                    "is_private": True,
                    "room_type": room_type,
                },
            )
            room.members.add(request.user, other)
            return room

        room = ChatRoom.objects.create(
            owner=request.user,
            server=server,
            description=description,
            is_private=is_private,
            **validated_data,
        )
        room.members.add(request.user)
        if server is not None:
            room.members.add(*server.members.all())
        return room


class ServerCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Server
        fields = ("name", "description")

    def create(self, validated_data: dict) -> Server:
        server = Server.objects.create(
            owner=self.context["request"].user,
            **validated_data,
        )
        server.members.add(self.context["request"].user)
        return server
