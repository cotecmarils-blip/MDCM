"""Utilidades de perfil de usuario."""

from .models import UserProfile


def get_or_create_user_profile(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def user_profile_payload(user, profile=None):
    if profile is None:
        profile = get_or_create_user_profile(user)
    foto = profile.foto.url if profile.foto else None
    return {
        'id': user.id,
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'email': user.email or '',
        'foto': foto,
    }
