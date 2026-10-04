import logging
import smtplib
from datetime import timedelta
from email.message import EmailMessage

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.exceptions import PermissionDenied
from django.middleware.csrf import CsrfViewMiddleware, get_token
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import permissions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_scope,
)
from rest_framework.request import Request
from rest_framework.response import Response

from .models import PasswordResetToken

User = get_user_model()
logger = logging.getLogger(__name__)


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Kept for backwards compatible imports only.

    Session authentication now enforces CSRF natively, so nothing should
    reference this class. It fails closed: it never returns a user.
    """

    def authenticate(self, request):
        return None


def _require_csrf(request) -> None:
    """Enforce CSRF on endpoints that have no session yet.

    DRF marks its views csrf_exempt and SessionAuthentication only checks the
    token once a session cookie exists, so login, registration and password
    reset would otherwise stay unprotected. This runs the standard middleware
    check by hand; the test client still skips it via its own flag.
    """
    check = CsrfViewMiddleware(lambda req: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason is not None:
        raise PermissionDenied(f"CSRF Failed: {reason}")


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def csrf_view(request: Request) -> Response:
    """Issue a CSRF token so the client can send it back in X-CSRFToken."""
    return Response({"csrf_token": get_token(request)})


@api_view(["POST"])
@authentication_classes([SessionAuthentication])
@throttle_scope("auth")
@permission_classes([permissions.AllowAny])
def register_view(request: Request) -> Response:
    _require_csrf(request)
    username = request.data.get("username", "").strip()
    email = request.data.get("email", "").strip()
    password = request.data.get("password", "")
    password2 = request.data.get("password2", "")
    birth_date = request.data.get("birth_date") or None
    terms_ok = bool(request.data.get("accept_terms"))
    privacy_ok = bool(request.data.get("accept_privacy"))

    if not terms_ok:
        return Response(
            {"error": "Примите правила использования"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not privacy_ok:
        return Response(
            {"error": "Дайте согласие на обработку персональных данных"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not username or not password:
        return Response({"error": "Username и пароль обязательны"}, status=status.HTTP_400_BAD_REQUEST)

    if password != password2:
        return Response({"error": "Пароли не совпадают"}, status=status.HTTP_400_BAD_REQUEST)

    if len(password) < 6:
        return Response({"error": "Пароль минимум 6 символов"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({"error": "Пользователь уже существует"}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    user = User.objects.create_user(username=username, email=email, password=password)
    user.terms_accepted_at = now
    user.terms_version = settings.TERMS_VERSION
    user.privacy_accepted_at = now
    user.privacy_version = settings.PRIVACY_VERSION
    user.save(
        update_fields=[
            "terms_accepted_at",
            "terms_version",
            "privacy_accepted_at",
            "privacy_version",
        ]
    )
    if birth_date:
        try:
            from datetime import date
            user.birth_date = date.fromisoformat(birth_date)
            user.save(update_fields=["birth_date"])
        except ValueError:
            return Response({"error": "Некорректная дата рождения"}, status=status.HTTP_400_BAD_REQUEST)
    login(request, user)
    return Response(_user_data(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@authentication_classes([SessionAuthentication])
@throttle_scope("auth")
@permission_classes([permissions.AllowAny])
def login_view(request: Request) -> Response:
    _require_csrf(request)
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")
    user = authenticate(request, username=username, password=password)
    if user is None:
        user = _authenticate_case_insensitive(request, username, password)
    if user is None and "@" in username:
        for email_user in User.objects.filter(email__iexact=username):
            user = authenticate(request, username=email_user.username, password=password)
            if user is not None:
                break
    if user is None:
        return Response({"error": "Неверный логин или пароль"}, status=status.HTTP_400_BAD_REQUEST)
    login(request, user)
    return Response(_user_data(user))


@api_view(["POST"])
@authentication_classes([SessionAuthentication])
def logout_view(request: Request) -> Response:
    logout(request)
    return Response({"success": True})


@api_view(["GET"])
def me_view(request: Request) -> Response:
    if request.user.is_anonymous:
        return Response({"authenticated": False}, status=status.HTTP_401_UNAUTHORIZED)
    return Response(_user_data(request.user))


@api_view(["GET"])
def users_list_view(request: Request) -> Response:
    ai_username = settings.AI_ASSISTANT_USERNAME
    ai_user, _ = User.objects.get_or_create(
        username=ai_username,
        defaults={"email": "ai@albus.local", "status": "AI"},
    )
    ai_data = {
        "id": ai_user.id,
        "username": ai_user.username,
        "avatar": ai_user.avatar.url if ai_user.avatar else None,
        "status": ai_user.status,
        "is_ai": True,
    }
    users = (
        User.objects
        .exclude(id__in=[request.user.id, ai_user.id])
        .only("id", "username", "avatar", "status")[:100]
    )
    result = [
        {
            "id": u.id,
            "username": u.username,
            "avatar": u.avatar.url if u.avatar else None,
            "status": u.status,
        }
        for u in users
    ]
    return Response([ai_data, *result])


@api_view(["POST"])
@authentication_classes([SessionAuthentication])
def profile_update_view(request: Request) -> Response:
    user = request.user
    data = request.data

    status_text = data.get("status")
    if status_text is not None:
        user.status = str(status_text)[:200]

    birth_date = data.get("birth_date")
    if birth_date:
        try:
            from datetime import date
            user.birth_date = date.fromisoformat(str(birth_date))
        except ValueError:
            return Response({"error": "Некорректная дата рождения"}, status=status.HTTP_400_BAD_REQUEST)
    elif birth_date == "":
        user.birth_date = None

    privacy = data.get("message_privacy")
    if privacy and privacy in dict(User.MessagePrivacy.choices):
        user.message_privacy = privacy

    user.save()
    return Response(_user_data(user))


@api_view(["POST"])
@authentication_classes([SessionAuthentication])
def avatar_upload_view(request: Request) -> Response:
    user = request.user
    avatar = request.FILES.get("avatar")
    if not avatar:
        return Response({"error": "Файл не передан"}, status=status.HTTP_400_BAD_REQUEST)

    ext = avatar.name.lower().rsplit(".", 1)[-1] if "." in avatar.name else ""
    allowed = {"jpg", "jpeg", "png", "gif", "webp"}
    if ext not in allowed:
        return Response({"error": "Формат файла не поддерживается"}, status=status.HTTP_400_BAD_REQUEST)

    user.avatar = avatar
    user.save()
    return Response(_user_data(user))


@api_view(["GET"])
@authentication_classes([SessionAuthentication])
def consent_view(request: Request) -> Response:
    """Report whether the signed in user accepted the current documents."""
    user = request.user
    terms_current = (
        user.terms_accepted_at is not None
        and user.terms_version == settings.TERMS_VERSION
    )
    privacy_current = (
        user.privacy_accepted_at is not None
        and user.privacy_version == settings.PRIVACY_VERSION
    )
    return Response(
        {
            "terms_accepted": terms_current,
            "privacy_accepted": privacy_current,
            "needs_consent": not (terms_current and privacy_current),
            "terms_version": settings.TERMS_VERSION,
            "privacy_version": settings.PRIVACY_VERSION,
        }
    )


@api_view(["POST"])
@authentication_classes([SessionAuthentication])
def consent_accept_view(request: Request) -> Response:
    """Store the acceptance with the document version and a timestamp."""
    _require_csrf(request)
    user = request.user

    if not request.data.get("accept_terms"):
        return Response(
            {"error": "Примите правила использования"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not request.data.get("accept_privacy"):
        return Response(
            {"error": "Дайте согласие на обработку персональных данных"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    user.terms_accepted_at = now
    user.terms_version = settings.TERMS_VERSION
    user.privacy_accepted_at = now
    user.privacy_version = settings.PRIVACY_VERSION
    user.save(
        update_fields=[
            "terms_accepted_at",
            "terms_version",
            "privacy_accepted_at",
            "privacy_version",
        ]
    )
    return Response({"ok": True, "terms_version": settings.TERMS_VERSION,
                    "privacy_version": settings.PRIVACY_VERSION})


def _authenticate_case_insensitive(request, login: str, password: str):
    from django.contrib.auth import authenticate

    user = None
    try:
        found = User.objects.get(username__iexact=login)
        user = authenticate(request, username=found.username, password=password)
    except (User.DoesNotExist, User.MultipleObjectsReturned):
        pass
    return user


def _user_data(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "avatar": user.avatar.url if user.avatar else None,
        "status": user.status,
        "birth_date": user.birth_date.isoformat() if user.birth_date else None,
        "message_privacy": user.message_privacy,
        "role": user.role,
        "is_staff": user.is_staff,
    }


def _can_manage_roles(user: User) -> bool:
    """Назначать роли может администратор: staff или пользователь с ролью «admin»."""
    return bool(user.is_staff or user.role == User.Role.ADMIN)


@api_view(["POST"])
@throttle_scope("auth")
@authentication_classes([SessionAuthentication])
def set_role_view(request: Request) -> Response:
    if not _can_manage_roles(request.user):
        return Response(
            {"error": "Недостаточно прав"},
            status=status.HTTP_403_FORBIDDEN,
        )

    username = request.data.get("username", "").strip()
    role = request.data.get("role", "").strip()

    if role not in dict(User.Role.choices):
        return Response({"error": "Некорректная роль"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(username__iexact=username)
    except User.DoesNotExist:
        return Response({"error": "Пользователь не найден"}, status=status.HTTP_404_NOT_FOUND)

    if user.role == role:
        return Response(_user_data(user))

    user.role = role
    user.save(update_fields=["role"])
    return Response(_user_data(user))


# ----------------------------------------------------------------------
# Восстановление пароля через Resend (п.3)
# ----------------------------------------------------------------------

def _send_reset_email(to_email: str, reset_url: str, username: str) -> None:
    """Trancyionnoe pismo so sbrosom parolya cherez SMTP Yandex.

    Returns None on success and raises RuntimeError when the message could
    not be sent, so the caller can report a real failure instead of
    pretending everything worked.
    """
    username_smtp = settings.YANDEX_MAIL_USERNAME
    password_smtp = settings.YANDEX_MAIL_PASSWORD
    sender = settings.YANDEX_MAIL_FROM or username_smtp

    if not (username_smtp and password_smtp):
        raise RuntimeError(
            "\u041d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d\u044b SMTP "
            "\u042f\u043d\u0434\u0435\u043a\u0441\u0430: \u0437\u0430\u0434\u0430\u0439\u0442\u0435 "
            "YANDEX_MAIL_USERNAME \u0438 YANDEX_MAIL_PASSWORD"
        )

    html = f"""<!doctype html>
<html lang="ru">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;padding:32px;">
        <tr><td style="font-size:13px;color:#6b7280;padding-bottom:4px;">Albus</td></tr>
        <tr><td style="padding-top:4px;padding-bottom:16px;font-size:22px;font-weight:700;color:#111827;">\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435 \u043f\u0430\u0440\u043e\u043b\u044f</td></tr>
        <tr><td style="font-size:14px;line-height:20px;color:#374151;padding-bottom:20px;">\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435, <b>{username}</b>! \u0414\u043b\u044f \u0441\u0431\u0440\u043e\u0441\u0430 \u043f\u0430\u0440\u043e\u043b\u044f \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 \u043d\u0438\u0436\u0435 (\u0441\u0441\u044b\u043b\u043a\u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 1 \u0447\u0430\u0441):</td></tr>
        <tr><td style="padding-bottom:24px;">
          <a href="{reset_url}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;">\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#9ca3af;">\u0415\u0441\u043b\u0438 \u0432\u044b \u043d\u0435 \u0437\u0430\u043f\u0440\u0430\u0448\u0438\u0432\u0430\u043b\u0438 \u0441\u0431\u0440\u043e\u0441 \u2014 \u043f\u0440\u043e\u0441\u0442\u043e \u043f\u0440\u043e\u0438\u0433\u043d\u043e\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u044d\u0442\u043e \u043f\u0438\u0441\u044c\u043c\u043e.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    message = EmailMessage()
    message["Subject"] = "Albus: восстановление пароля"
    message["From"] = f"{settings.YANDEX_MAIL_FROM_NAME} <{sender}>"
    message["To"] = to_email
    message.set_content(
        f"\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435, {username}!\n"
        f"\u0414\u043b\u044f \u0441\u0431\u0440\u043e\u0441\u0430 \u043f\u0430\u0440\u043e\u043b\u044f \u043e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0441\u0441\u044b\u043b\u043a\u0443:\n\n"
        f"{reset_url}\n\n"
        f"\u0421\u0441\u044b\u043b\u043a\u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 1 \u0447\u0430\u0441."
    )
    message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP_SSL(settings.YANDEX_SMTP_HOST, settings.YANDEX_SMTP_PORT, timeout=20) as server:
            server.login(username_smtp, password_smtp)
            server.send_message(message)
    except smtplib.SMTPException as exc:
        logger.exception("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043f\u0438\u0441\u044c\u043c\u043e \u043d\u0430 %s: %s", to_email, exc)
        raise RuntimeError(str(exc)) from exc
    except OSError as exc:
        logger.exception("\u041d\u0435\u0442 \u0441\u0432\u044f\u0437\u0438 \u0441 SMTP \u042f\u043d\u0434\u0435\u043a\u0441\u0430: %s", exc)
        raise RuntimeError(str(exc)) from exc


@api_view(["POST"])
@authentication_classes([SessionAuthentication])
@throttle_scope("auth")
@permission_classes([permissions.AllowAny])
def password_reset_request_view(request: Request) -> Response:
    _require_csrf(request)
    """Принимает email, создаёт одноразовый токен и шлёт письмо через Resend."""
    email = request.data.get("email", "").strip()
    if not email:
        return Response({"error": "Укажите email"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return Response({"error": "Пользователь с таким email не найден"}, status=status.HTTP_404_NOT_FOUND)

    PasswordResetToken.objects.filter(user=user, used=False).update(used=True)

    raw_token = get_random_string(48)
    token = PasswordResetToken.objects.create(
        user=user,
        token=raw_token,
        expires_at=timezone.now() + timedelta(hours=1),
    )

    reset_url = (
        f"{settings.FRONTEND_URL}/reset-password?uid={urlsafe_base64_encode(str(user.pk).encode())}"
        f"&token={raw_token}"
    )
    try:
        _send_reset_email(user.email, reset_url, user.username)
    except RuntimeError as exc:
        logger.error("Письмо восстановления не отправлено: %s", exc)
        return Response(
            {"error": "Не удалось отправить письмо. Попробуйте позже."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({"ok": True, "token_id": token.pk})


@api_view(["POST"])
@authentication_classes([SessionAuthentication])
@throttle_scope("auth")
@permission_classes([permissions.AllowAny])
def password_reset_confirm_view(request: Request) -> Response:
    _require_csrf(request)
    """Проверяет токен и устанавливает новый пароль."""
    uid = request.data.get("uid", "")
    token = request.data.get("token", "").strip()
    password = request.data.get("password", "")
    password2 = request.data.get("password2", "")

    if not password or password != password2:
        return Response({"error": "Пароли не совпадают"}, status=status.HTTP_400_BAD_REQUEST)
    if len(password) < 6:
        return Response({"error": "Пароль минимум 6 символов"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_pk = int(urlsafe_base64_decode(uid).decode())
    except Exception:
        return Response({"error": "Ссылка некорректна"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        reset_token = PasswordResetToken.objects.get(
            user_id=user_pk,
            token=token,
            used=False,
        )
    except PasswordResetToken.DoesNotExist:
        return Response({"error": "Ссылка недействительна"}, status=status.HTTP_400_BAD_REQUEST)

    if reset_token.expires_at < timezone.now():
        return Response({"error": "Ссылка истекла"}, status=status.HTTP_400_BAD_REQUEST)

    user = reset_token.user
    user.set_password(password)
    user.save(update_fields=["password"])
    reset_token.used = True
    reset_token.save(update_fields=["used"])

    return Response({"ok": True, "username": user.username})
