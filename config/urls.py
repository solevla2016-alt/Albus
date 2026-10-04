import re

from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from config import settings

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("users.api_urls")),
    path("api/chat/", include("chat.api_urls")),
    path("api/", include("users.api_urls")),
]

# Раздача media в любом режиме: начиная с Django 5.2 конфигурация
# static() при DEBUG=False ничего не добавляет, поэтому монтируем
# напрямую через serve.
urlpatterns += [
    re_path(
        r"^{}(?P<path>.*)$".format(re.escape(settings.MEDIA_URL.lstrip("/"))),
        serve,
        {"document_root": settings.MEDIA_ROOT},
    )
]
