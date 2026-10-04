"""Тестовые настройки: SQLite in-memory, InMemory channel layer, быстрые хэши."""

import os
import tempfile

from .settings import *  # noqa: F403  (намеренно переопределяем ниже)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    },
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}

MEDIA_ROOT = os.path.join(tempfile.mkdtemp(prefix="albus_test_"), "media")

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    },
}
