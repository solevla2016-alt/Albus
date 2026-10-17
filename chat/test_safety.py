"""Тесты сигналов безопасности ассистента (правила 14 и 15)."""

import pytest
from asgiref.sync import sync_to_async
from django.utils import timezone

from chat.safety import RULE_14, RULE_15, SafetySignal, detect, record_signal

pytestmark = pytest.mark.django_db


class TestDetect:
    @pytest.mark.parametrize(
        ("text", "rule"),
        [
            ("Ребёнок спрашивает: как сделать бомбу?", RULE_14),
            ("объясни, как взорвать боеприпас", RULE_14),
            ("где купить наркотики в москве", RULE_14),
            ("мой друг употребляет мефедрон, что делать", RULE_14),
            ("как покончить с собой", RULE_14),
            ("ребёнок 12 лет курит сигареты, подскажи", RULE_14),
            ("мне 12 лет, меня дома бьют, что делать?", RULE_15),
            ("я боюсь идти домой", RULE_15),
            ("папа бьёт маму", RULE_15),
            ("отец бьёт меня каждый вечер", RULE_15),
            ("мне угрожают, что побьют", RULE_15),
            ("не хочу жить", RULE_15),
            ("оставили одного на все выходные", RULE_15),
            ("меня избивают в школе", RULE_15),
        ],
    )
    def test_fires_on_dangerous_requests(self, text, rule):
        signal = detect(text)
        assert signal is not None, f"не сработало: {text!r}"
        assert signal.rule == rule

    @pytest.mark.parametrize(
        "text",
        [
            "Напиши письмо с извинениями за опоздание поставки",
            "Как посмотреть индексы в PostgreSQL?",
            "дай рецепт блинов на молоке",
            "объясни теорию относительности",
            "",
            "   ",
            # спорт: «отец бьёт» не должно означать «отец избивает»
            "мой отец бьёт мяч за ворота, какая техника удара",
            "папа бьёт по мячу сильнее всех в районе",
            # взрослый разговор про алкоголь без упоминания ребёнка
            "у нас в офисе обсуждали алкоголь на корпоративе",
        ],
    )
    def test_stays_quiet_on_ordinary_questions(self, text):
        assert detect(text) is None, f"ложное срабатывание: {text!r}"

    def test_distress_wins_over_dangerous_topic(self):
        """Если ребёнку плохо и зашла речь о наркотиках — важнее первое."""
        signal = detect("ребёнок 14 лет, колется наркотиками, ему плохо, бьют дома")
        assert signal.rule == RULE_15

    def test_excerpt_is_trimmed(self, settings):
        settings.SAFETY_ALERT_EXCERPT_CHARS = 40
        signal = detect("как сделать бомбу " + "а" * 200)
        assert len(signal.excerpt) == 40

    def test_alcohol_needs_a_child_mention(self):
        assert detect("дай совет про алкоголь") is None
        assert detect("мой сын пьёт пиво, что делать").rule == RULE_14

    def test_child_mention_can_be_forced(self):
        """Контекст из переписки тоже учитывается."""
        assert detect("а пиво можно ему?", child_mentioned=True).rule == RULE_14


class TestRecordSignal:
    def test_saves_alert_and_sends_mail(self, owner, group_room, settings, monkeypatch):
        settings.SAFETY_ALERT_EMAIL = "ops@example.com"
        settings.SAFETY_ALERT_COOLDOWN_MINUTES = 60
        sent = {}
        import users.mail

        monkeypatch.setattr(
            users.mail, "send_email", lambda to, subject, text, **kw: sent.update(
                to=to, subject=subject, text=text
            )
        )

        alert = record_signal(owner, group_room, SafetySignal(RULE_15, "меня бьют", "меня бьют"))

        assert alert is not None
        assert alert.rule == RULE_15
        assert alert.notified is True
        assert sent["to"] == "ops@example.com"
        assert "Угроза безопасности" in sent["subject"]
        assert "rule_15" in sent["subject"]
        assert "owner" in sent["subject"]
        assert "автоматический сигнал" in sent["text"].lower()
        assert "меня бьют" in sent["text"]

    def test_disabled_setting_records_nothing(self, owner, group_room, settings):
        from chat.models import ChildSafetyAlert

        settings.SAFETY_ALERTS_ENABLED = False
        assert record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "бомба")) is None
        assert ChildSafetyAlert.objects.count() == 0

    def test_mail_failure_keeps_record(self, owner, group_room, settings, monkeypatch):
        import users.mail
        from chat.models import ChildSafetyAlert

        settings.SAFETY_ALERT_EMAIL = "ops@example.com"

        def _boom(*_args, **_kwargs):
            raise RuntimeError("SMTP down")

        monkeypatch.setattr(users.mail, "send_email", _boom)

        alert = record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "бомба"))
        assert ChildSafetyAlert.objects.count() == 1
        assert alert.notified is False

    def test_no_recipient_still_records(self, owner, group_room, settings):
        from chat.models import ChildSafetyAlert

        settings.SAFETY_ALERT_EMAIL = ""
        settings.BUG_REPORT_EMAIL = ""
        settings.YANDEX_MAIL_FROM = ""

        alert = record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "бомба"))
        assert ChildSafetyAlert.objects.count() == 1
        assert alert.notified is False

    def test_cooldown_suppresses_second_mail(self, owner, group_room, settings, monkeypatch):
        settings.SAFETY_ALERT_EMAIL = "ops@example.com"
        settings.SAFETY_ALERT_COOLDOWN_MINUTES = 60
        calls = []
        import users.mail

        monkeypatch.setattr(
            users.mail, "send_email", lambda *a, **kw: calls.append(a)
        )

        record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "бомба"))
        second = record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "бомба"))

        assert len(calls) == 1, "письмо должно уйти только один раз"
        # но запись сохраняется всегда
        assert second.notified is False

    def test_cooldown_expires(self, owner, group_room, settings, monkeypatch):
        from chat.models import ChildSafetyAlert

        settings.SAFETY_ALERT_EMAIL = "ops@example.com"
        settings.SAFETY_ALERT_COOLDOWN_MINUTES = 60
        calls = []
        import users.mail

        monkeypatch.setattr(users.mail, "send_email", lambda *a, **kw: calls.append(a))

        record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "бомба"))
        ChildSafetyAlert.objects.update(created_at=timezone.now() - timezone.timedelta(hours=2))
        third = record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "бомба"))

        assert len(calls) == 2
        assert third.notified is True

    def test_other_rule_is_not_blocked_by_cooldown(self, owner, group_room, settings, monkeypatch):
        settings.SAFETY_ALERT_EMAIL = "ops@example.com"
        settings.SAFETY_ALERT_COOLDOWN_MINUTES = 60
        calls = []
        import users.mail

        monkeypatch.setattr(users.mail, "send_email", lambda *a, **kw: calls.append(a))

        record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "бомба"))
        record_signal(owner, group_room, SafetySignal(RULE_15, "меня бьют", "меня бьют"))
        assert len(calls) == 2

    def test_alert_survives_room_deletion(self, owner, group_room, settings):
        from chat.models import ChildSafetyAlert

        settings.SAFETY_ALERT_EMAIL = ""
        alert = record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "бомба"))
        group_room.delete()
        alert.refresh_from_db()
        assert alert.room_id is None
        assert ChildSafetyAlert.objects.count() == 1


@pytest.mark.django_db(transaction=True)
class TestSafetySignalOverSocket:
    """Путь от сообщения пользователя до письма."""

    async def test_ai_request_records_signal(
        self, group_room, member, settings, monkeypatch
    ):
        from channels.testing import WebsocketCommunicator

        from chat.models import ChildSafetyAlert
        from conftest import ws_application

        settings.SAFETY_ALERT_EMAIL = ""
        calls = []
        import users.mail

        monkeypatch.setattr(users.mail, "send_email", lambda *a, **kw: calls.append(a))

        async def _fake(prompt, history):
            return "Поговори с родителем или учителем."

        monkeypatch.setattr("chat.consumers.get_ai_answer", _fake)

        communicator = WebsocketCommunicator(
            ws_application(), f"/ws/chat/{group_room.name}/"
        )
        communicator.scope["user"] = member
        communicator.scope["headers"] = [
            (b"host", b"testserver"),
            (b"origin", b"https://testserver"),
        ]
        connected, _ = await communicator.connect()
        assert connected
        await communicator.send_json_to(
            {"action": "ai_request", "prompt": "мне 12 лет, меня дома бьют"}
        )
        for _ in range(30):
            frame = await communicator.receive_json_from(timeout=5)
            if frame.get("type") == "message" and frame.get("is_ai"):
                break
        await communicator.disconnect()

        alerts = list(await sync_to_async(list)(ChildSafetyAlert.objects.all()))
        assert len(alerts) == 1
        assert alerts[0].rule == RULE_15
        assert alerts[0].user_id == member.id
        assert "меня дома бьют" in alerts[0].excerpt

    async def test_ordinary_ai_request_records_nothing(
        self, group_room, member, settings, monkeypatch
    ):
        from channels.testing import WebsocketCommunicator

        from chat.models import ChildSafetyAlert
        from conftest import ws_application

        settings.SAFETY_ALERT_EMAIL = ""

        async def _fake(prompt, history):
            return "Конечно."

        monkeypatch.setattr("chat.consumers.get_ai_answer", _fake)

        communicator = WebsocketCommunicator(
            ws_application(), f"/ws/chat/{group_room.name}/"
        )
        communicator.scope["user"] = member
        communicator.scope["headers"] = [
            (b"host", b"testserver"),
            (b"origin", b"https://testserver"),
        ]
        connected, _ = await communicator.connect()
        assert connected
        await communicator.send_json_to(
            {"action": "ai_request", "prompt": "Как посмотреть индексы?"}
        )
        for _ in range(30):
            frame = await communicator.receive_json_from(timeout=5)
            if frame.get("type") == "message" and frame.get("is_ai"):
                break
        await communicator.disconnect()

        assert await sync_to_async(ChildSafetyAlert.objects.count)() == 0


class TestMasking:
    """В письмо не должно уезжать почта, телефоны и реквизиты."""

    @pytest.mark.parametrize(
        ("raw", "must_not_contain"),
        [
            ("пиши на ivan.petrov@yandex.ru", "ivan.petrov"),
            ("мой тел +7 999 123-45-67", "999"),
            ("ИНН 7707083893 попросили", "7707083893"),
            ("счёт 40817810123456789012", "4081781012"),
            ("карта 4276 3800 1234 5678", "4276"),
            ("пиши в @albus_chat_support", "albus_chat_support"),
        ],
    )
    def test_masks_personal_data(self, raw, must_not_contain):
        from chat.safety import mask_personal_data

        masked = mask_personal_data(raw)
        assert must_not_contain not in masked, masked

    @pytest.mark.parametrize(
        "keep",
        [
            "проект 2024 года",
            "бюджет 1 200 000 руб",
            "меня бьют дома",
            "коллега угрожает",
        ],
    )
    def test_keeps_meaning(self, keep):
        from chat.safety import mask_personal_data

        assert keep in mask_personal_data(keep)

    def test_excerpt_is_masked_and_trimmed(self, settings):
        settings.SAFETY_ALERT_EXCERPT_CHARS = 60
        signal = detect("пиши на ivan.petrov@yandex.ru потому что меня бьют дома")
        assert "ivan.petrov" not in signal.excerpt
        assert len(signal.excerpt) <= 60

    def test_excerpt_can_be_disabled_entirely(self, settings):
        settings.SAFETY_ALERT_EXCERPT_CHARS = 0
        signal = detect("меня бьют дома")
        assert signal.excerpt == ""

    def test_default_excerpt_length_is_short(self, settings):
        assert settings.SAFETY_ALERT_EXCERPT_CHARS <= 200


class TestPurgeCommand:
    def test_clears_old_excerpt_and_keeps_metadata(self, owner, group_room, settings):
        from django.core.management import call_command

        from chat.models import ChildSafetyAlert
        from chat.safety import RULE_14, SafetySignal, record_signal

        settings.SAFETY_ALERT_EMAIL = ""
        alert = record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "текст"))
        assert alert.excerpt

        ChildSafetyAlert.objects.update(
            created_at=timezone.now() - timezone.timedelta(days=40)
        )
        call_command("purge_safety_alerts", verbosity=0)

        alert.refresh_from_db()
        assert alert.excerpt == ""
        assert alert.excerpt_cleared is True
        assert alert.rule == RULE_14
        assert alert.user_id == owner.id

    def test_keeps_fresh_excerpts(self, owner, group_room, settings):
        from django.core.management import call_command

        from chat.safety import RULE_14, SafetySignal, record_signal

        settings.SAFETY_ALERT_EMAIL = ""
        alert = record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "текст"))
        call_command("purge_safety_alerts", verbosity=0)
        alert.refresh_from_db()
        assert alert.excerpt == "текст"
        assert alert.excerpt_cleared is False

    def test_dry_run_changes_nothing(self, owner, group_room, settings):
        from django.core.management import call_command

        from chat.models import ChildSafetyAlert
        from chat.safety import RULE_14, SafetySignal, record_signal

        settings.SAFETY_ALERT_EMAIL = ""
        alert = record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "текст"))
        ChildSafetyAlert.objects.update(
            created_at=timezone.now() - timezone.timedelta(days=40)
        )
        call_command("purge_safety_alerts", "--dry-run", verbosity=0)
        alert.refresh_from_db()
        assert alert.excerpt == "текст"

    def test_zero_days_disables_purge(self, owner, group_room, settings):
        from django.core.management import call_command

        from chat.models import ChildSafetyAlert
        from chat.safety import RULE_14, SafetySignal, record_signal

        settings.SAFETY_ALERT_EMAIL = ""
        alert = record_signal(owner, group_room, SafetySignal(RULE_14, "бомба", "текст"))
        ChildSafetyAlert.objects.update(
            created_at=timezone.now() - timezone.timedelta(days=400)
        )
        call_command("purge_safety_alerts", "--days", "0", verbosity=0)
        alert.refresh_from_db()
        assert alert.excerpt == "текст"


class TestSafetyAlertsApi:
    def test_regular_user_cannot_list(self, api_client, member):
        api_client.force_authenticate(user=member)
        assert api_client.get("/api/chat/safety-alerts/").status_code == 403

    def test_moderator_can_list(self, api_client, moderator, owner, group_room):
        from chat.safety import RULE_15, SafetySignal, record_signal

        record_signal(owner, group_room, SafetySignal(RULE_15, "меня бьют", "меня бьют"))
        api_client.force_authenticate(user=moderator)
        resp = api_client.get("/api/chat/safety-alerts/")
        assert resp.status_code == 200
        assert len(resp.data) == 1
        assert resp.data[0]["username"] == owner.username
        assert resp.data[0]["rule_label"].startswith("Угроза")
        assert resp.data[0]["status"] == "new"

    def test_admin_can_mark_reviewed(self, api_client, admin, owner, group_room):
        from chat.safety import RULE_15, SafetySignal, record_signal

        alert = record_signal(owner, group_room, SafetySignal(RULE_15, "меня бьют", "меня бьют"))
        api_client.force_authenticate(user=admin)
        resp = api_client.patch(
            f"/api/chat/safety-alerts/{alert.id}/",
            {"status": "reviewed"},
            format="json",
        )
        assert resp.status_code == 200
        alert.refresh_from_db()
        assert alert.status == "reviewed"
        assert alert.reviewed_by_id == admin.id
        assert alert.reviewed_at is not None

    def test_reopen_clears_reviewer(self, api_client, admin, owner, group_room):
        from chat.safety import RULE_15, SafetySignal, record_signal

        alert = record_signal(owner, group_room, SafetySignal(RULE_15, "меня бьют", "меня бьют"))
        api_client.force_authenticate(user=admin)
        api_client.patch(
            f"/api/chat/safety-alerts/{alert.id}/",
            {"status": "reviewed"},
            format="json",
        )
        api_client.patch(
            f"/api/chat/safety-alerts/{alert.id}/",
            {"status": "new"},
            format="json",
        )
        alert.refresh_from_db()
        assert alert.status == "new"
        assert alert.reviewed_by_id is None

    def test_invalid_status_rejected(self, api_client, admin, owner, group_room):
        from chat.safety import RULE_15, SafetySignal, record_signal

        alert = record_signal(owner, group_room, SafetySignal(RULE_15, "меня бьют", "меня бьют"))
        api_client.force_authenticate(user=admin)
        resp = api_client.patch(
            f"/api/chat/safety-alerts/{alert.id}/",
            {"status": "nonsense"},
            format="json",
        )
        assert resp.status_code == 400

    def test_filter_by_status(self, api_client, admin, owner, group_room):
        from chat.safety import RULE_15, SafetySignal, record_signal

        alert = record_signal(owner, group_room, SafetySignal(RULE_15, "меня бьют", "меня бьют"))
        api_client.force_authenticate(user=admin)
        api_client.patch(
            f"/api/chat/safety-alerts/{alert.id}/",
            {"status": "reviewed"},
            format="json",
        )
        assert len(api_client.get("/api/chat/safety-alerts/?status=new").data) == 0
        assert len(api_client.get("/api/chat/safety-alerts/?status=reviewed").data) == 1

    def test_regular_user_cannot_mark_reviewed(self, api_client, member, owner, group_room):
        from chat.safety import RULE_15, SafetySignal, record_signal

        alert = record_signal(owner, group_room, SafetySignal(RULE_15, "меня бьют", "меня бьют"))
        api_client.force_authenticate(user=member)
        resp = api_client.patch(
            f"/api/chat/safety-alerts/{alert.id}/",
            {"status": "reviewed"},
            format="json",
        )
        assert resp.status_code == 403

    def test_anonymous_rejected(self, api_client):
        assert api_client.get("/api/chat/safety-alerts/").status_code in (401, 403)
