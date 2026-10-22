"""Генерация VAPID-ключей для web-push.

    python manage.py vapid_keys          # показать существующие
    python manage.py vapid_keys --regenerate

Публичный ключ уходит в браузер, приватный остаётся на сервере и нужен для
подписи. Оба значения — в формате base64url без дополнения.
"""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _format_keys(public_point: bytes, private_raw: bytes) -> tuple[str, str]:
    return b64url(public_point), b64url(private_raw)


def generate() -> tuple[str, str]:
    """Пара ключей в том виде, которого ждут браузер и pywebpush.

    Публичный ключ — не DER, а несжатая точка SECP256R1 (65 байт, первый
    байт 0x04): именно её браузер принимает в applicationServerKey. Приватный
    — 32-байтное число, а не PEM: py_vapid читает его через from_raw.
    """
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_point = private_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    private_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
    return _format_keys(public_point, private_raw)


class Command(BaseCommand):
    help = "Показывает или генерирует VAPID-ключи для web-push"

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--regenerate",
            action="store_true",
            help="Сгенерировать новую пару (старая перестанет работать)",
        )

    def handle(self, *args: object, **options: object) -> None:
        import os

        from django.conf import settings

        if not options.get("regenerate"):
            self.stdout.write("VAPID_PUBLIC_KEY:")
            self.stdout.write(settings.VAPID_PUBLIC_KEY or "  (не задан)")
            self.stdout.write("VAPID_PRIVATE_KEY:")
            self.stdout.write(
                "  (задан)" if settings.VAPID_PRIVATE_KEY else "  (не задан)"
            )
            self.stdout.write("VAPID_SUBJECT:")
            self.stdout.write(settings.VAPID_SUBJECT or "  (не задан)")
            if settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY:
                self.stdout.write(self.style.SUCCESS("Ключи на месте."))
            else:
                self.stdout.write(
                    self.style.WARNING(
                        "Ключей нет. Задайте VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY "
                        "в .env на сервере."
                    )
                )
            return

        public_key, private_key = generate()
        self.stdout.write("VAPID_PUBLIC_KEY=" + public_key)
        self.stdout.write("VAPID_PRIVATE_KEY=" + private_key)
        self.stdout.write()
        self.stdout.write(
            self.style.WARNING(
                "Добавьте оба значения в .env на сервере и перезапустите "
                "backend: docker compose up -d backend"
            )
        )
        self.stdout.write(
            "Публичный ключ уходит в браузер, приватный — только на сервер."
        )
        # локальный .env, если он есть: не трогаем серверные секреты молча
        if os.path.exists(".env"):
            self.stdout.write(
                "Локальный .env найден, но я его не менял автоматически."
            )
