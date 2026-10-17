"""Очистка выдержек сигналов безопасности по сроку хранения.

    python manage.py purge_safety_alerts            # обнулить просроченные
    python manage.py purge_safety_alerts --dry-run   # только показать
    python manage.py purge_safety_alerts --days 7

Текст запроса попадал в письмо оператору, поэтому хранить его вечно не нужно:
через SAFETY_ALERT_EXCERPT_RETENTION_DAYS выдержка обнуляется, а факт
сработавшего сигнала остаётся. По сработавшему факту можно понять, что
правила работают, даже когда текст уже не нужен.
"""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from chat.models import ChildSafetyAlert


class Command(BaseCommand):
    help = "Обнуляет выдержки сигналов безопасности старше срока хранения"

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--days",
            type=int,
            default=None,
            help="Срок хранения в днях; по умолчанию из настроек",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Показать, что будет очищено, ничего не меняя",
        )

    def handle(self, *args: object, **options: object) -> None:
        days = options.get("days")
        if days is None:
            days = getattr(settings, "SAFETY_ALERT_EXCERPT_RETENTION_DAYS", 30)
        days = int(days)
        dry_run = bool(options.get("dry_run"))

        if days <= 0:
            self.stdout.write("Срок хранения не задан — очистка отключена.")
            return

        deadline = timezone.now() - timedelta(days=days)
        stale = ChildSafetyAlert.objects.filter(
            excerpt_cleared=False,
            created_at__lt=deadline,
        ).exclude(excerpt="")

        total = stale.count()
        if dry_run:
            self.stdout.write(f"К очистке: {total} записей старше {days} дн.")
            for alert in stale[:20]:
                self.stdout.write(
                    f"  #{alert.id} {alert.created_at:%Y-%m-%d} "
                    f"{alert.user.username} {alert.rule}"
                )
            if total > 20:
                self.stdout.write(f"  ... и ещё {total - 20}")
            return

        # Сначала помечаем, потом чистим текст: если что-то упадёт посередине,
        # запись не потеряет флаг и попадёт в следующий запуск. Идентификаторы
        # берём заранее: после update условие excerpt_cleared=False уже не
        # совпадёт и повторный запрос вернул бы пустоту.
        ids = list(stale.values_list("id", flat=True))
        marked = stale.update(excerpt_cleared=True)
        cleared = ChildSafetyAlert.objects.filter(id__in=ids).update(excerpt="")
        self.stdout.write(
            f"Очищено записей: {cleared} (помечено: {marked}), срок {days} дн."
        )
