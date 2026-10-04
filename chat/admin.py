from django.contrib import admin

from .models import ChatRoom, Message


@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "owner", "is_private", "created_at")
    list_filter = ("is_private", "created_at")
    search_fields = ("name", "owner__username")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "room", "text", "is_edited", "created_at")
    list_filter = ("room", "created_at", "is_edited")
    search_fields = ("text", "user__username")
