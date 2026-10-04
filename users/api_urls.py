from django.urls import path

from .api_views import (
    avatar_upload_view,
    consent_accept_view,
    consent_view,
    csrf_view,
    login_view,
    logout_view,
    me_view,
    password_reset_confirm_view,
    password_reset_request_view,
    profile_update_view,
    register_view,
    set_role_view,
    users_list_view,
)

urlpatterns = [
    path("csrf/", csrf_view, name="api_csrf"),
    path("consent/", consent_view, name="api_consent"),
    path("consent/accept/", consent_accept_view, name="api_consent_accept"),
    path("register/", register_view, name="api_register"),
    path("login/", login_view, name="api_login"),
    path("logout/", logout_view, name="api_logout"),
    path("me/", me_view, name="api_me"),
    path("users/", users_list_view, name="api_users"),
    path("profile/", profile_update_view, name="api_profile"),
    path("avatar/", avatar_upload_view, name="api_avatar"),
    path("set-role/", set_role_view, name="api_set_role"),
    path("password-reset/request/", password_reset_request_view, name="api_password_reset_request"),
    path("password-reset/confirm/", password_reset_confirm_view, name="api_password_reset_confirm"),
]
