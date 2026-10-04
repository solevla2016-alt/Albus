from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    model = User
    list_display = ("id", "username", "email", "is_staff", "is_active", "date_joined")
    search_fields = ("username", "email")
    list_filter = ("is_staff", "is_active", "is_superuser")
    ordering = ("username",)
    fieldsets = (
        (None, {"fields": ("username", "email", "password")}),
        ("Profile", {"fields": ("avatar", "status")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
