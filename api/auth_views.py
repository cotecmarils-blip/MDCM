from django.contrib.auth import authenticate, get_user_model
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .auth_serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    ProyectoMembershipSerializer,
    UserProfileUpdateSerializer,
    UserSerializer,
)
from .models import Proyecto, ProyectoMembership
from .access import (
    ACCESS_CODE_ACCOUNT_DISABLED,
    LOGIN_ACCESS_MESSAGES,
    PROYECTO_ACCESS_MESSAGES,
    can_create_proyecto,
    can_manage_members,
    can_manage_users_globally,
    check_user_login_access,
    is_global_admin,
    manageable_proyecto_ids,
    membership_access_code,
    valid_membership_q,
)
from .permissions import MembershipManagePermission, membership_payload
from .user_profile import get_or_create_user_profile, user_profile_payload

User = get_user_model()


def _tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = authenticate(
        request,
        username=serializer.validated_data['username'],
        password=serializer.validated_data['password'],
    )
    if user is None or not user.is_active:
        return Response(
            {'detail': 'Credenciales inválidas.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    allowed, access_code = check_user_login_access(user)
    if not allowed:
        return Response(
            {
                'detail': LOGIN_ACCESS_MESSAGES[access_code],
                'code': access_code,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    tokens = _tokens_for_user(user)
    get_or_create_user_profile(user)
    return Response({
        **tokens,
        'user': user_profile_payload(user),
        'es_admin_global': user.is_staff or user.is_superuser,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    refresh_token = request.data.get('refresh')
    if refresh_token:
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            pass
    return Response({'detail': 'Sesión cerrada.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    user = request.user
    if not user.is_active:
        return Response(
            {
                'detail': LOGIN_ACCESS_MESSAGES[ACCESS_CODE_ACCOUNT_DISABLED],
                'code': ACCESS_CODE_ACCOUNT_DISABLED,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    memberships = ProyectoMembership.objects.filter(
        usuario=user,
    ).filter(valid_membership_q()).select_related('proyecto')
    admin_ids = manageable_proyecto_ids(user)
    admin_proyectos = []
    if admin_ids:
        admin_proyectos = [
            {'proyecto_id': p.id, 'proyecto_nombre': p.nombre}
            for p in Proyecto.objects.filter(id__in=admin_ids).order_by('nombre')
        ]
    return Response({
        'user': user_profile_payload(user),
        'es_admin_global': user.is_staff or user.is_superuser,
        'puede_crear_proyecto': can_create_proyecto(user),
        'puede_gestionar_usuarios': can_manage_users_globally(user),
        'proyectos_administrables': admin_proyectos,
        'proyectos': [
            {
                'proyecto_id': m.proyecto_id,
                'proyecto_nombre': m.proyecto.nombre,
                'rol': m.rol,
            }
            for m in memberships
        ],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def proyecto_membership_view(request, proyecto_id):
    try:
        Proyecto.objects.get(pk=proyecto_id)
    except Proyecto.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    payload = membership_payload(request.user, proyecto_id)
    if payload is None:
        membership = ProyectoMembership.objects.filter(
            usuario=request.user,
            proyecto_id=proyecto_id,
        ).first()
        if membership and not is_global_admin(request.user):
            code = membership_access_code(membership)
            return Response(
                {
                    'detail': PROYECTO_ACCESS_MESSAGES[code],
                    'code': code,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            {'detail': 'No tienes acceso a este proyecto.', 'code': 'no_access'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return Response(payload)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    user = request.user
    profile = get_or_create_user_profile(user)
    if request.method == 'GET':
        return Response(user_profile_payload(user, profile))

    serializer = UserProfileUpdateSerializer(
        data=request.data,
        context={'user': user, 'request': request},
    )
    serializer.is_valid(raise_exception=True)
    serializer.update(user, serializer.validated_data)
    profile.refresh_from_db()
    user.refresh_from_db()
    return Response(user_profile_payload(user, profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    serializer = ChangePasswordSerializer(
        data=request.data, context={'request': request}
    )
    serializer.is_valid(raise_exception=True)
    user = request.user
    if not user.check_password(serializer.validated_data['current_password']):
        return Response(
            {'current_password': ['Contraseña actual incorrecta.']},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user.set_password(serializer.validated_data['new_password'])
    user.save()
    return Response({'detail': 'Contraseña actualizada.'})


class ProyectoMembershipViewSet(viewsets.ModelViewSet):
    serializer_class = ProyectoMembershipSerializer
    permission_classes = [IsAuthenticated, MembershipManagePermission]

    def get_queryset(self):
        qs = ProyectoMembership.objects.select_related('usuario', 'proyecto').prefetch_related(
            'misiones_asignadas__mision',
            'alternativas_asignadas__alternativa',
        )
        proyecto_id = self.request.query_params.get('proyecto')
        if proyecto_id:
            qs = qs.filter(proyecto_id=proyecto_id)
        elif not is_global_admin(self.request.user):
            qs = qs.filter(proyecto_id__in=manageable_proyecto_ids(self.request.user))
        return qs.order_by('usuario__username', 'proyecto__nombre')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_users_view(request):
    """Búsqueda de usuarios para asignar membresías (gerente global o de proyecto)."""
    if not can_manage_users_globally(request.user):
        proyecto_id = request.query_params.get('proyecto')
        if not proyecto_id or not can_manage_members(request.user, int(proyecto_id)):
            return Response(
                {'detail': 'No tienes permiso para listar usuarios.'},
                status=status.HTTP_403_FORBIDDEN,
            )

    q = (request.query_params.get('q') or '').strip()
    qs = User.objects.filter(is_active=True).order_by('username')
    if q:
        qs = qs.filter(Q(username__icontains=q) | Q(email__icontains=q))
    qs = qs[:30]
    return Response(UserSerializer(qs, many=True).data)


class SecureTokenRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]
