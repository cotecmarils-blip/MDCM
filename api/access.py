"""Control de acceso por proyecto y rol."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

from .models import (
    Alternativa,
    Atributo,
    Capacidad,
    Caracteristica,
    CaracteristicaPlantilla,
    Dimension,
    Documento,
    DocumentoCriterio,
    DpCriterio,
    Escenario,
    GrupoAfinidad,
    Mision,
    MopCriterio,
    NodoArbol,
    OfertanteAlternativa,
    Omoe,
    Proyecto,
    ProyectoNivelArbol,
    ProyectoMembership,
    Requisito,
    Subatributo,
    VopResultado,
    ValorEvaluacion,
)

User = get_user_model()

ACCESS_CODE_EXPIRED = 'access_expired'
ACCESS_CODE_DISABLED = 'access_disabled'
ACCESS_CODE_NO_ACCESS = 'no_access'
ACCESS_CODE_ACCOUNT_DISABLED = 'account_disabled'

LOGIN_ACCESS_MESSAGES = {
    ACCESS_CODE_ACCOUNT_DISABLED: (
        'Su cuenta está deshabilitada. '
        'Comuníquese con el administrador del sistema.'
    ),
    ACCESS_CODE_EXPIRED: (
        'Su tiempo de acceso al software ha terminado. '
        'Para solicitar acceso nuevamente, comuníquese con el gerente del proyecto.'
    ),
    ACCESS_CODE_DISABLED: (
        'Su acceso al software está deshabilitado. '
        'Para solicitar acceso nuevamente, comuníquese con el gerente del proyecto.'
    ),
    ACCESS_CODE_NO_ACCESS: (
        'No tiene acceso al software. '
        'Para solicitar acceso, comuníquese con el gerente del proyecto.'
    ),
}

PROYECTO_ACCESS_MESSAGES = {
    ACCESS_CODE_EXPIRED: (
        'Su tiempo de acceso a este proyecto ha terminado. '
        'Solicite renovación al gerente del proyecto.'
    ),
    ACCESS_CODE_DISABLED: (
        'Su acceso a este proyecto está deshabilitado. '
        'Solicite acceso al gerente del proyecto.'
    ),
    ACCESS_CODE_NO_ACCESS: (
        'No tiene acceso a este proyecto. '
        'Solicite acceso al gerente del proyecto.'
    ),
}


def valid_membership_q(prefix=''):
    """Filtro Q para membresías con acceso vigente (activo y no vencido)."""
    field = f'{prefix}activo' if prefix else 'activo'
    hasta = f'{prefix}fecha_acceso_hasta' if prefix else 'fecha_acceso_hasta'
    now = timezone.now()
    return Q(**{field: True}) & (
        Q(**{f'{hasta}__isnull': True}) | Q(**{f'{hasta}__gte': now})
    )


def is_membership_access_valid(membership) -> bool:
    if membership is None or not membership.activo:
        return False
    if membership.fecha_acceso_hasta is None:
        return True
    return membership.fecha_acceso_hasta >= timezone.now()


def membership_access_status(membership):
    """Estado de acceso de una membresía: vigente | vencido | deshabilitado."""
    if membership is None:
        return 'sin_membresia'
    if not membership.activo:
        return 'deshabilitado'
    if membership.fecha_acceso_hasta and membership.fecha_acceso_hasta < timezone.now():
        return 'vencido'
    return 'vigente'


def membership_access_code(membership):
    status = membership_access_status(membership)
    if status == 'vencido':
        return ACCESS_CODE_EXPIRED
    if status == 'deshabilitado':
        return ACCESS_CODE_DISABLED
    return ACCESS_CODE_NO_ACCESS


def check_user_login_access(user):
    """Verifica si el usuario puede iniciar sesión (solo bloqueo a nivel de cuenta)."""
    if not user.is_authenticated:
        return False, ACCESS_CODE_NO_ACCESS
    if not user.is_active:
        return False, ACCESS_CODE_ACCOUNT_DISABLED
    return True, None


def can_manage_users_globally(user) -> bool:
    """Admin global o gerente con al menos un proyecto activo."""
    if not user.is_authenticated:
        return False
    if is_global_admin(user):
        return True
    return ProyectoMembership.objects.filter(
        usuario=user,
        rol=ProyectoMembership.ROL_JEFE,
    ).filter(valid_membership_q()).exists()


def manageable_proyecto_ids(user):
    if not user.is_authenticated:
        return set()
    if is_global_admin(user):
        return set(Proyecto.objects.values_list('id', flat=True))
    return set(
        ProyectoMembership.objects.filter(
            usuario=user,
            rol=ProyectoMembership.ROL_JEFE,
        )
        .filter(valid_membership_q())
        .values_list('proyecto_id', flat=True)
    )


def compute_fecha_acceso_hasta(dias=0, horas=0, minutos=0, *, dias_acceso=None):
    """Calcula vencimiento de acceso desde ahora."""
    if dias_acceso is not None:
        dias = dias_acceso
    delta = timedelta(
        days=int(dias or 0),
        hours=int(horas or 0),
        minutes=int(minutos or 0),
    )
    if delta.total_seconds() <= 0:
        return None
    return timezone.now() + delta

READ_ONLY_ROLES = {ProyectoMembership.ROL_AUDITOR}
# Gerente (jefe): gestión completa del proyecto, incluidas alternativas.
GERENTE_ROLES = {ProyectoMembership.ROL_JEFE}
# Ingeniero (analista): un solo proyecto; crea alternativas y el resto; no crea proyectos.
INGENIERO_ROLES = {ProyectoMembership.ROL_ANALISTA}
WRITE_ROLES = GERENTE_ROLES | INGENIERO_ROLES
CRITERIO_WRITE_ROLES = WRITE_ROLES | {ProyectoMembership.ROL_EVALUADOR}
REQUISITO_WRITE_ROLES = WRITE_ROLES | {ProyectoMembership.ROL_OFERTANTE}
VOP_WRITE_ROLES = WRITE_ROLES | {ProyectoMembership.ROL_OFERTANTE}


def can_create_proyecto(user) -> bool:
    """Super Admin y Gerente pueden crear proyectos; Ingeniero no.

    El cargo «Gerente» (membresía con rol jefe vigente) habilita la creación
    aunque el usuario además sea Ingeniero/Analista en otro proyecto. Un usuario
    que solo es Ingeniero (sin ningún cargo Gerente) no puede crear proyectos.
    """
    if not user.is_authenticated:
        return False
    if is_global_admin(user):
        return True
    return ProyectoMembership.objects.filter(
        usuario=user,
        rol=ProyectoMembership.ROL_JEFE,
    ).filter(valid_membership_q()).exists()


def can_create_alternativa(user, proyecto_id: int) -> bool:
    if is_global_admin(user):
        return True
    membership = get_membership(user, proyecto_id)
    if membership is None or _is_read_only_member(membership):
        return False
    return membership.rol in WRITE_ROLES


def can_create_resource(user, obj, resource_kind: str = 'generic') -> bool:
    proyecto_id = resolve_proyecto_id(obj)
    if proyecto_id is None:
        return is_global_admin(user)
    if not can_read_proyecto(user, proyecto_id):
        return False
    if is_global_admin(user):
        return True

    membership = get_membership(user, proyecto_id)
    if membership is None or _is_read_only_member(membership):
        return False

    rol = membership.rol

    if resource_kind == 'proyecto':
        return can_create_proyecto(user)

    if resource_kind == 'alternativa':
        return can_create_alternativa(user, proyecto_id)

    if resource_kind == 'requisito':
        return rol in REQUISITO_WRITE_ROLES

    if resource_kind in {'capacidad', 'caracteristica', 'documento'}:
        return rol in WRITE_ROLES

    if resource_kind == 'vop':
        return rol in WRITE_ROLES

    if resource_kind in {
        'omoe', 'mision', 'grupo', 'mop', 'dp', 'nodo_arbol',
        'criterio_doc', 'dimension', 'atributo', 'subatributo',
    }:
        if rol in WRITE_ROLES:
            return True
        if rol == ProyectoMembership.ROL_EVALUADOR:
            return True
        return False

    if resource_kind in {'requisito', 'escenario'}:
        return rol in WRITE_ROLES

    return rol in WRITE_ROLES


def is_global_admin(user):
    return user.is_authenticated and (user.is_superuser or user.is_staff)


def get_membership(user, proyecto_id):
    if not user.is_authenticated or not proyecto_id:
        return None
    if is_global_admin(user):
        return None
    return (
        ProyectoMembership.objects.filter(
            usuario=user,
            proyecto_id=proyecto_id,
        )
        .filter(valid_membership_q())
        .select_related('proyecto')
        .first()
    )


def user_proyecto_ids(user):
    if not user.is_authenticated:
        return set()
    if is_global_admin(user):
        return set(Proyecto.objects.values_list('id', flat=True))
    return set(
        ProyectoMembership.objects.filter(
            usuario=user,
        )
        .filter(valid_membership_q())
        .values_list('proyecto_id', flat=True)
    )


def user_alternativa_ids(user, proyecto_id=None):
    if not user.is_authenticated:
        return set()
    if is_global_admin(user):
        qs = Alternativa.objects.all()
        if proyecto_id:
            qs = qs.filter(proyecto_id=proyecto_id)
        return set(qs.values_list('id', flat=True))

    memberships = ProyectoMembership.objects.filter(
        usuario=user,
        rol=ProyectoMembership.ROL_OFERTANTE,
    ).filter(valid_membership_q())
    if proyecto_id:
        memberships = memberships.filter(proyecto_id=proyecto_id)

    return set(
        OfertanteAlternativa.objects.filter(
            membership__in=memberships,
        ).values_list('alternativa_id', flat=True)
    )


def user_mision_ids(user, proyecto_id=None):
    if not user.is_authenticated:
        return set()
    if is_global_admin(user):
        qs = Mision.objects.all()
        if proyecto_id:
            qs = qs.filter(omoe__proyecto_id=proyecto_id)
        return set(qs.values_list('id', flat=True))

    memberships = ProyectoMembership.objects.filter(
        usuario=user,
        rol=ProyectoMembership.ROL_EVALUADOR,
    ).filter(valid_membership_q())
    if proyecto_id:
        memberships = memberships.filter(proyecto_id=proyecto_id)

    from .models import EvaluadorMision

    return set(
        EvaluadorMision.objects.filter(membership__in=memberships).values_list(
            'mision_id', flat=True
        )
    )


def _proyecto_id_from_omoe_id(omoe_id):
    if not omoe_id:
        return None
    return Omoe.objects.filter(pk=omoe_id).values_list('proyecto_id', flat=True).first()


def _proyecto_id_from_mision_id(mision_id):
    if not mision_id:
        return None
    return Mision.objects.filter(pk=mision_id).values_list(
        'omoe__proyecto_id', flat=True
    ).first()


def _proyecto_id_from_grupo_id(grupo_id):
    if not grupo_id:
        return None
    row = (
        GrupoAfinidad.objects.filter(pk=grupo_id)
        .values_list('omoe_id', 'mision_id')
        .first()
    )
    if not row:
        return None
    omoe_id, mision_id = row
    if omoe_id:
        return _proyecto_id_from_omoe_id(omoe_id)
    return _proyecto_id_from_mision_id(mision_id)


def _proyecto_id_from_mop_id(mop_id):
    if not mop_id:
        return None
    grupo_id = (
        MopCriterio.objects.filter(pk=mop_id)
        .values_list('grupo_afinidad_id', flat=True)
        .first()
    )
    return _proyecto_id_from_grupo_id(grupo_id)


def _proyecto_id_from_dp_id(dp_id):
    if not dp_id:
        return None
    mop_id = (
        DpCriterio.objects.filter(pk=dp_id).values_list('mop_id', flat=True).first()
    )
    return _proyecto_id_from_mop_id(mop_id)


def _proyecto_id_from_nodo_id(nodo_id):
    if not nodo_id:
        return None
    return (
        NodoArbol.objects.filter(pk=nodo_id)
        .values_list('omoe__proyecto_id', flat=True)
        .first()
    )


def resolve_create_stub(model, data):
    """Referencia mínima al padre al crear, para evaluar permisos."""
    parent_id = data.get('parent_id')
    proyecto_id = data.get('proyecto') or data.get('proyecto_id')

    if model is Proyecto:
        return Proyecto(id=int(proyecto_id)) if proyecto_id else None

    if model is Omoe:
        return Proyecto(id=int(proyecto_id)) if proyecto_id else None

    if model is Escenario:
        if data.get('omoe'):
            return Omoe(id=int(data['omoe']))
        return Proyecto(id=int(proyecto_id)) if proyecto_id else None

    if model is Dimension:
        return Proyecto(id=int(proyecto_id)) if proyecto_id else None

    if model is Mision:
        omoe_ref = data.get('omoe') or parent_id
        return Omoe(id=int(omoe_ref)) if omoe_ref else None

    if model is GrupoAfinidad:
        if data.get('omoe'):
            return Omoe(id=int(data['omoe']))
        if data.get('mision'):
            return Mision(id=int(data['mision']))
        if parent_id:
            pid = int(parent_id)
            if Omoe.objects.filter(pk=pid).exists():
                return Omoe(id=pid)
            if Mision.objects.filter(pk=pid).exists():
                return Mision(id=pid)
            return GrupoAfinidad(id=pid)
        if data.get('grupo_afinidad'):
            return GrupoAfinidad(id=int(data['grupo_afinidad']))
        return None

    if model is MopCriterio:
        grupo_ref = data.get('grupo_afinidad') or parent_id
        return GrupoAfinidad(id=int(grupo_ref)) if grupo_ref else None

    if model is DpCriterio:
        mop_ref = data.get('mop') or parent_id
        return MopCriterio(id=int(mop_ref)) if mop_ref else None

    if model is NodoArbol:
        if data.get('parent'):
            return NodoArbol(id=int(data['parent']))
        if parent_id:
            pid = int(parent_id)
            if NodoArbol.objects.filter(pk=pid).exists():
                return NodoArbol(id=pid)
            if Omoe.objects.filter(pk=pid).exists():
                return Omoe(id=pid)
        if data.get('omoe'):
            return Omoe(id=int(data['omoe']))
        return None

    if model is VopResultado:
        if data.get('alternativa'):
            return Alternativa(id=int(data['alternativa']))
        if data.get('dp'):
            return DpCriterio(id=int(data['dp']))
        return None

    if model is ValorEvaluacion:
        if data.get('alternativa'):
            return Alternativa(id=int(data['alternativa']))
        return None

    if model is Atributo:
        dim_ref = data.get('dimension') or parent_id
        return Dimension(id=int(dim_ref)) if dim_ref else None

    if model is Subatributo:
        attr_ref = data.get('atributo') or parent_id
        return Atributo(id=int(attr_ref)) if attr_ref else None

    if model is DocumentoCriterio:
        if data.get('dimension'):
            return Dimension(id=int(data['dimension']))
        if data.get('atributo'):
            return Atributo(id=int(data['atributo']))
        if data.get('subatributo'):
            return Subatributo(id=int(data['subatributo']))
        return None

    if data.get('alternativa'):
        return Alternativa(id=int(data['alternativa']))
    if data.get('escenario'):
        return Escenario(id=int(data['escenario']))
    if proyecto_id:
        return Proyecto(id=int(proyecto_id))
    return None


def resolve_proyecto_id(obj):
    if obj is None:
        return None
    if isinstance(obj, Proyecto):
        return obj.id
    if isinstance(obj, Alternativa):
        if getattr(obj, 'proyecto_id', None):
            return obj.proyecto_id
        alt_id = getattr(obj, 'id', None)
        if alt_id:
            return (
                Alternativa.objects.filter(pk=alt_id)
                .values_list('proyecto_id', flat=True)
                .first()
            )
        return None
    if isinstance(obj, Omoe):
        if getattr(obj, 'proyecto_id', None):
            return obj.proyecto_id
        return _proyecto_id_from_omoe_id(getattr(obj, 'id', None))
    if isinstance(obj, Mision):
        if getattr(obj, 'omoe_id', None):
            return _proyecto_id_from_omoe_id(obj.omoe_id)
        return _proyecto_id_from_mision_id(getattr(obj, 'id', None))
    if isinstance(obj, GrupoAfinidad):
        if getattr(obj, 'omoe_id', None):
            return _proyecto_id_from_omoe_id(obj.omoe_id)
        if getattr(obj, 'mision_id', None):
            return _proyecto_id_from_mision_id(obj.mision_id)
        return _proyecto_id_from_grupo_id(getattr(obj, 'id', None))
    if isinstance(obj, MopCriterio):
        if getattr(obj, 'grupo_afinidad_id', None):
            return _proyecto_id_from_grupo_id(obj.grupo_afinidad_id)
        return _proyecto_id_from_mop_id(getattr(obj, 'id', None))
    if isinstance(obj, DpCriterio):
        if getattr(obj, 'mop_id', None):
            return _proyecto_id_from_mop_id(obj.mop_id)
        return _proyecto_id_from_dp_id(getattr(obj, 'id', None))
    if isinstance(obj, NodoArbol):
        if getattr(obj, 'omoe_id', None):
            return _proyecto_id_from_omoe_id(obj.omoe_id)
        return _proyecto_id_from_nodo_id(getattr(obj, 'id', None))
    if isinstance(obj, ProyectoNivelArbol):
        return obj.proyecto_id
    if hasattr(obj, 'proyecto_id') and obj.proyecto_id:
        return obj.proyecto_id
    if hasattr(obj, 'proyecto') and getattr(obj.proyecto, 'id', None):
        return obj.proyecto.id
    if hasattr(obj, 'alternativa_id') and obj.alternativa_id:
        return Alternativa.objects.filter(pk=obj.alternativa_id).values_list(
            'proyecto_id', flat=True
        ).first()
    if hasattr(obj, 'alternativa') and getattr(obj.alternativa, 'proyecto_id', None):
        return obj.alternativa.proyecto_id
    if hasattr(obj, 'mision_id') and obj.mision_id:
        return (
            Mision.objects.filter(pk=obj.mision_id)
            .values_list('omoe__proyecto_id', flat=True)
            .first()
        )
    if hasattr(obj, 'mision') and getattr(obj.mision, 'omoe_id', None):
        return (
            Omoe.objects.filter(pk=obj.mision.omoe_id)
            .values_list('proyecto_id', flat=True)
            .first()
        )
    if hasattr(obj, 'grupo_afinidad_id') and obj.grupo_afinidad_id:
        return _proyecto_id_from_grupo_id(obj.grupo_afinidad_id)
    if hasattr(obj, 'grupo_afinidad'):
        ga = obj.grupo_afinidad
        if ga:
            if getattr(ga, 'omoe_id', None):
                return _proyecto_id_from_omoe_id(ga.omoe_id)
            if getattr(ga, 'mision_id', None):
                return _proyecto_id_from_mision_id(ga.mision_id)
    if hasattr(obj, 'mop_id') and obj.mop_id:
        return _proyecto_id_from_mop_id(obj.mop_id)
    if hasattr(obj, 'mop'):
        mop = obj.mop
        if mop and mop.grupo_afinidad_id:
            return _proyecto_id_from_grupo_id(mop.grupo_afinidad_id)
    if hasattr(obj, 'dp_id') and obj.dp_id:
        return _proyecto_id_from_dp_id(obj.dp_id)
    if hasattr(obj, 'dp'):
        dp = obj.dp
        if dp and dp.mop_id:
            return _proyecto_id_from_mop_id(dp.mop_id)
    if hasattr(obj, 'omoe_id') and obj.omoe_id:
        return _proyecto_id_from_omoe_id(obj.omoe_id)
    if hasattr(obj, 'omoe') and getattr(obj.omoe, 'proyecto_id', None):
        return obj.omoe.proyecto_id
    if hasattr(obj, 'dimension_id') and obj.dimension_id:
        return Dimension.objects.filter(pk=obj.dimension_id).values_list(
            'proyecto_id', flat=True
        ).first()
    if hasattr(obj, 'dimension') and getattr(obj.dimension, 'proyecto_id', None):
        return obj.dimension.proyecto_id
    if hasattr(obj, 'atributo_id') and obj.atributo_id:
        return (
            Atributo.objects.filter(pk=obj.atributo_id)
            .values_list('dimension__proyecto_id', flat=True)
            .first()
        )
    if hasattr(obj, 'atributo') and getattr(obj.atributo, 'dimension_id', None):
        return (
            Dimension.objects.filter(pk=obj.atributo.dimension_id)
            .values_list('proyecto_id', flat=True)
            .first()
        )
    if hasattr(obj, 'subatributo_id') and obj.subatributo_id:
        return (
            Subatributo.objects.filter(pk=obj.subatributo_id)
            .values_list('atributo__dimension__proyecto_id', flat=True)
            .first()
        )
    if hasattr(obj, 'subatributo'):
        sub = obj.subatributo
        if sub and sub.atributo_id:
            return (
                Atributo.objects.filter(pk=sub.atributo_id)
                .values_list('dimension__proyecto_id', flat=True)
                .first()
            )
    if hasattr(obj, 'escenario_id') and obj.escenario_id:
        return Escenario.objects.filter(pk=obj.escenario_id).values_list(
            'proyecto_id', flat=True
        ).first()
    if hasattr(obj, 'escenario') and getattr(obj.escenario, 'proyecto_id', None):
        return obj.escenario.proyecto_id
    return None


def resolve_mision_id(obj):
    if obj is None:
        return None
    if isinstance(obj, Mision):
        return obj.id
    if hasattr(obj, 'mision_id') and obj.mision_id:
        return obj.mision_id
    if hasattr(obj, 'mision') and getattr(obj.mision, 'id', None):
        return obj.mision.id
    if hasattr(obj, 'grupo_afinidad_id') and obj.grupo_afinidad_id:
        return (
            GrupoAfinidad.objects.filter(pk=obj.grupo_afinidad_id)
            .values_list('mision_id', flat=True)
            .first()
        )
    if hasattr(obj, 'grupo_afinidad'):
        ga = obj.grupo_afinidad
        if ga:
            return ga.mision_id
    if hasattr(obj, 'mop_id') and obj.mop_id:
        return (
            MopCriterio.objects.filter(pk=obj.mop_id)
            .values_list('grupo_afinidad__mision_id', flat=True)
            .first()
        )
    if hasattr(obj, 'mop'):
        mop = obj.mop
        if mop and mop.grupo_afinidad_id:
            return (
                GrupoAfinidad.objects.filter(pk=mop.grupo_afinidad_id)
                .values_list('mision_id', flat=True)
                .first()
            )
    if hasattr(obj, 'dp_id') and obj.dp_id:
        return (
            DpCriterio.objects.filter(pk=obj.dp_id)
            .values_list('mop__grupo_afinidad__mision_id', flat=True)
            .first()
        )
    if hasattr(obj, 'dp'):
        dp = obj.dp
        if dp and dp.mop_id:
            return (
                MopCriterio.objects.filter(pk=dp.mop_id)
                .values_list('grupo_afinidad__mision_id', flat=True)
                .first()
            )
    return None


def can_read_proyecto(user, proyecto_id):
    if is_global_admin(user):
        return True
    return proyecto_id in user_proyecto_ids(user)


def can_manage_members(user, proyecto_id):
    if is_global_admin(user):
        return True
    membership = get_membership(user, proyecto_id)
    return membership is not None and membership.rol == ProyectoMembership.ROL_JEFE


def _is_read_only_member(membership):
    return membership is not None and membership.rol in READ_ONLY_ROLES


def can_read_resource(user, obj, resource_kind='generic'):
    proyecto_id = resolve_proyecto_id(obj)
    if proyecto_id is None:
        return is_global_admin(user)
    if not can_read_proyecto(user, proyecto_id):
        return False
    if is_global_admin(user):
        return True

    membership = get_membership(user, proyecto_id)
    if membership is None:
        return False
    if membership.rol == ProyectoMembership.ROL_OFERTANTE:
        if resource_kind in {'requisito', 'proyecto'}:
            return True
        return False
    return True


def can_write_resource(user, obj, resource_kind='generic'):
    proyecto_id = resolve_proyecto_id(obj)
    if proyecto_id is None:
        return is_global_admin(user)
    if not can_read_proyecto(user, proyecto_id):
        return False
    if is_global_admin(user):
        return True

    membership = get_membership(user, proyecto_id)
    if membership is None or _is_read_only_member(membership):
        return False

    rol = membership.rol

    if resource_kind == 'proyecto':
        return rol in WRITE_ROLES

    if resource_kind == 'requisito':
        return rol in REQUISITO_WRITE_ROLES

    if resource_kind == 'escenario':
        return rol in WRITE_ROLES

    if resource_kind in {'alternativa', 'capacidad', 'caracteristica', 'documento'}:
        if rol in WRITE_ROLES:
            return True
        return False

    if resource_kind == 'vop':
        return rol in WRITE_ROLES

    if resource_kind in {
        'omoe', 'mision', 'grupo', 'mop', 'dp', 'nodo_arbol',
        'criterio_doc', 'dimension', 'atributo', 'subatributo',
    }:
        if rol in WRITE_ROLES:
            return True
        if rol == ProyectoMembership.ROL_EVALUADOR:
            mision_id = resolve_mision_id(obj)
            if mision_id is None and resource_kind == 'omoe':
                return False
            return mision_id in user_mision_ids(user, proyecto_id)
        return False

    return rol in WRITE_ROLES


def can_delete_proyecto(user, proyecto):
    if is_global_admin(user):
        return True
    membership = get_membership(user, proyecto.id)
    return membership is not None and membership.rol == ProyectoMembership.ROL_JEFE


def filter_queryset_by_access(user, queryset, proyecto_field='proyecto_id'):
    if is_global_admin(user):
        return queryset
    proyecto_ids = user_proyecto_ids(user)
    if not proyecto_ids:
        return queryset.none()
    return queryset.filter(**{f'{proyecto_field}__in': proyecto_ids})


def filter_alternativas_by_access(user, queryset, proyecto_id=None):
    if is_global_admin(user):
        return queryset
    proyecto_ids = user_proyecto_ids(user)
    if proyecto_id:
        if proyecto_id not in proyecto_ids:
            return queryset.none()
        membership = get_membership(user, proyecto_id)
        if membership and membership.rol == ProyectoMembership.ROL_OFERTANTE:
            return queryset.none()
        return queryset.filter(proyecto_id=proyecto_id)
    return queryset.filter(proyecto_id__in=proyecto_ids)


RESOURCE_KIND_MAP = {
    Proyecto: 'proyecto',
    Requisito: 'requisito',
    Alternativa: 'alternativa',
    Capacidad: 'capacidad',
    Caracteristica: 'caracteristica',
    CaracteristicaPlantilla: 'caracteristica',
    Documento: 'documento',
    Dimension: 'dimension',
    Atributo: 'atributo',
    Subatributo: 'subatributo',
    DocumentoCriterio: 'criterio_doc',
    Escenario: 'escenario',
    Omoe: 'omoe',
    Mision: 'mision',
    GrupoAfinidad: 'grupo',
    MopCriterio: 'mop',
    DpCriterio: 'dp',
    NodoArbol: 'nodo_arbol',
    ProyectoNivelArbol: 'proyecto',
    VopResultado: 'vop',
    ValorEvaluacion: 'vop',
}


def resource_kind_for_model(model):
    return RESOURCE_KIND_MAP.get(model, 'generic')
