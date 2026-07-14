from rest_framework.permissions import BasePermission, SAFE_METHODS

from .access import (
    INGENIERO_ROLES,
    WRITE_ROLES,
    can_create_proyecto,
    can_create_resource,
    can_delete_proyecto,
    can_manage_members,
    can_manage_users_globally,
    can_read_resource,
    can_write_resource,
    get_membership,
    is_global_admin,
    manageable_proyecto_ids,
    resolve_create_stub,
    resource_kind_for_model,
    user_proyecto_ids,
)
from .models import Proyecto, ProyectoMembership


class IsAuthenticatedOrReadOnlyPublic(BasePermission):
    """Solo endpoints de autenticación usan AllowAny explícito."""

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated


class ProyectoAccessPermission(BasePermission):
    """Permisos por rol en el proyecto asociado al recurso."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_global_admin(request.user):
            return True

        if getattr(view, 'action', None) == 'create':
            return self._can_create(request, view)
        return True

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_global_admin(request.user):
            return True

        model = type(obj)
        kind = resource_kind_for_model(model)

        if request.method in SAFE_METHODS:
            return can_read_resource(request.user, obj, kind)

        if request.method == 'DELETE' and model is Proyecto:
            return can_delete_proyecto(request.user, obj)

        return can_write_resource(request.user, obj, kind)

    def _can_create(self, request, view):
        queryset = getattr(view, 'queryset', None)
        if queryset is None:
            return True
        model = queryset.model

        if model is Proyecto:
            return can_create_proyecto(request.user)

        data = request.data
        proyecto_id = data.get('proyecto') or data.get('proyecto_id')
        if proyecto_id and model not in {Proyecto}:
            # Creación con proyecto explícito (p. ej. alternativa, escenario).
            if int(proyecto_id) not in user_proyecto_ids(request.user):
                return False

        stub = resolve_create_stub(model, data)
        if stub is None:
            return is_global_admin(request.user)

        kind = resource_kind_for_model(model)
        return can_create_resource(request.user, stub, kind)


class MembershipManagePermission(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_global_admin(request.user):
            return True
        action = getattr(view, 'action', None)
        if action == 'list':
            return can_manage_users_globally(request.user)
        if action in {'retrieve', 'update', 'partial_update', 'destroy'}:
            return can_manage_users_globally(request.user)
        proyecto_id = request.query_params.get('proyecto') or request.data.get('proyecto')
        if not proyecto_id:
            return False
        return can_manage_members(request.user, int(proyecto_id))

    def has_object_permission(self, request, view, obj):
        if is_global_admin(request.user):
            return True
        return obj.proyecto_id in manageable_proyecto_ids(request.user)


def membership_payload(user, proyecto_id):
    if is_global_admin(user):
        return {
            'rol': 'admin',
            'es_admin_global': True,
            'puede_editar': True,
            'puede_crear_proyecto': True,
            'puede_crear_alternativa': True,
            'puede_gestionar_miembros': True,
            'puede_eliminar_proyecto': True,
            'solo_lectura': False,
            'solo_requisitos': False,
            'alternativas_asignadas': [],
            'misiones_asignadas': [],
        }
    membership = get_membership(user, proyecto_id)
    if membership is None:
        return None
    from .access import user_alternativa_ids, user_mision_ids
    from .models import ProyectoMembership as PM

    rol = membership.rol
    solo_lectura = rol == PM.ROL_AUDITOR
    solo_requisitos = rol == PM.ROL_OFERTANTE
    puede_crear_alternativa = rol in WRITE_ROLES if not solo_lectura else False
    puede_editar = not solo_lectura and (
        rol in WRITE_ROLES or rol == PM.ROL_OFERTANTE
    )
    return {
        'rol': rol,
        'es_admin_global': False,
        'puede_editar': puede_editar,
        'puede_crear_proyecto': can_create_proyecto(user),
        'puede_crear_alternativa': puede_crear_alternativa,
        'puede_gestionar_miembros': rol == PM.ROL_JEFE,
        'puede_eliminar_proyecto': can_delete_proyecto(user, Proyecto(id=proyecto_id)),
        'solo_lectura': solo_lectura,
        'solo_requisitos': solo_requisitos,
        'alternativas_asignadas': list(user_alternativa_ids(user, proyecto_id)),
        'misiones_asignadas': list(user_mision_ids(user, proyecto_id)),
    }
