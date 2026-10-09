from django.urls import path

from .consumers import ChatConsumer

websocket_urlpatterns = [
    # По id: устойчив к переименованию комнаты и не путает одинаковые названия.
    path("ws/chat/id/<int:room_id>/", ChatConsumer.as_asgi()),
    # По имени оставлен для совместимости со старыми клиентами.
    path("ws/chat/<str:room_name>/", ChatConsumer.as_asgi()),
]
