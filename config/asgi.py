import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_asgi_app = get_asgi_application()

# Daphne is not `runserver`, so Django serves no static files here. Without this
# the Django admin renders unstyled and /static/* answers 404.
from whitenoise import WhiteNoiseMiddleware  # noqa: E402

django_asgi_app = WhiteNoiseMiddleware(django_asgi_app)

from chat.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        ),
    }
)
