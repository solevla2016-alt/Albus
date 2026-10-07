import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_asgi_app = get_asgi_application()

# Note: Daphne is not `runserver`, so Django serves no static files here, and
# WhiteNoise is no help because 6.x is WSGI only (no ASGI interface). The
# collectstatic output is bind mounted to the host and served by Caddy instead;
# see deploy/Caddyfile.albus and the backend volumes in docker-compose.vds.yml.
from chat.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        ),
    }
)
