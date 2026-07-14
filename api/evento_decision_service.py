"""Eventos de decisión y registro automático de auditoría."""

from __future__ import annotations

import json
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from .models import (
    EventoDecision,
    EventoDecisionNodo,
    EventoDecisionParticipante,
    EventoDecisionRegistro,
    NodoArbol,
    Omoe,
    Proyecto,
)

User = get_user_model()


def _json_safe(val: Any) -> Any:
    if val is None:
        return None
    try:
        json.dumps(val)
        return val
    except (TypeError, ValueError):
        return str(val)


def get_evento_activo(proyecto_id: int) -> EventoDecision | None:
    return (
        EventoDecision.objects.filter(
            proyecto_id=proyecto_id,
            estado=EventoDecision.ESTADO_ACTIVO,
        )
        .select_related('omoe', 'mediador_usuario', 'creado_por')
        .prefetch_related('participantes', 'nodos_auditoria__nodo__tipo_nivel')
        .first()
    )


def _expand_nodo_scope(nodo_ids: list[int]) -> set[int]:
    if not nodo_ids:
        return set()
    nodos = list(
        NodoArbol.objects.filter(id__in=nodo_ids).values_list('id', 'omoe_id')
    )
    if not nodos:
        return set()
    omoe_ids = {row[1] for row in nodos}
    by_parent: dict[int | None, list[int]] = {}
    for nid, pid in NodoArbol.objects.filter(omoe_id__in=omoe_ids).values_list('id', 'parent_id'):
        by_parent.setdefault(pid, []).append(nid)

    scoped = set(nodo_ids)
    stack = list(nodo_ids)
    while stack:
        current = stack.pop()
        for child_id in by_parent.get(current, []):
            if child_id not in scoped:
                scoped.add(child_id)
                stack.append(child_id)
    return scoped


def _scoped_nodo_ids_for_evento(evento: EventoDecision) -> set[int]:
    cache = getattr(evento, '_scoped_nodo_ids_cache', None)
    if cache is not None:
        return cache
    root_ids = list(
        evento.nodos_auditoria.values_list('nodo_id', flat=True)
    )
    cache = _expand_nodo_scope(root_ids)
    evento._scoped_nodo_ids_cache = cache
    return cache


def _parent_en_alcance(parent_id: int | None, scoped: set[int], omoe_id: int | None) -> bool:
    if parent_id is not None:
        return parent_id in scoped
    if not omoe_id:
        return False
    return NodoArbol.objects.filter(
        omoe_id=omoe_id, parent_id__isnull=True, id__in=scoped,
    ).exists()


def _cambio_en_alcance_evento(
    evento: EventoDecision,
    *,
    omoe_id: int | None,
    entidad_tipo: str,
    entidad_id: int | None,
    metadata: dict | None = None,
) -> bool:
    if evento.omoe_id and omoe_id and evento.omoe_id != omoe_id:
        return False

    if evento.alcance_modo != EventoDecision.ALCANCE_NODOS_SELECCIONADOS:
        return True

    scoped = _scoped_nodo_ids_for_evento(evento)
    if not scoped:
        return False

    meta = metadata or {}
    parent_id = meta.get('parent_id')

    if entidad_tipo in ('nodo_arbol', 'nodo_arbol_escenario') and entidad_id:
        if entidad_id in scoped:
            return True
        nodo_parent = NodoArbol.objects.filter(pk=entidad_id).values_list('parent_id', flat=True).first()
        if nodo_parent and nodo_parent in scoped:
            return True

    if entidad_tipo == 'peso_grupo_ahp':
        return _parent_en_alcance(parent_id, scoped, omoe_id or evento.omoe_id)

    if entidad_tipo in ('estructura', 'matriz') and parent_id is not None:
        return _parent_en_alcance(parent_id, scoped, omoe_id or evento.omoe_id)

    if parent_id is not None and _parent_en_alcance(parent_id, scoped, omoe_id or evento.omoe_id):
        return True

    return False


def registrar_cambio(
    proyecto_id: int,
    usuario: User | None,
    *,
    tipo_cambio: str,
    entidad_tipo: str,
    entidad_id: int | None = None,
    entidad_nombre: str = '',
    campo: str = '',
    valor_anterior=None,
    valor_nuevo=None,
    omoe_id: int | None = None,
    escenario_id: int | None = None,
    notas: str = '',
    metadata: dict | None = None,
) -> EventoDecisionRegistro | None:
    evento = get_evento_activo(proyecto_id)
    if not evento:
        return None
    if not _cambio_en_alcance_evento(
        evento,
        omoe_id=omoe_id,
        entidad_tipo=entidad_tipo,
        entidad_id=entidad_id,
        metadata=metadata,
    ):
        return None
    return EventoDecisionRegistro.objects.create(
        evento=evento,
        proyecto_id=proyecto_id,
        omoe_id=omoe_id,
        escenario_id=escenario_id,
        usuario=usuario,
        tipo_cambio=tipo_cambio,
        entidad_tipo=entidad_tipo,
        entidad_id=entidad_id,
        entidad_nombre=entidad_nombre or '',
        campo=campo or '',
        valor_anterior=_json_safe(valor_anterior),
        valor_nuevo=_json_safe(valor_nuevo),
        notas=notas or '',
        metadata=metadata or {},
    )


def nuevo_lote_auditoria() -> str:
    """UUID compartido por una acción de usuario y sus efectos derivados."""
    import uuid
    return str(uuid.uuid4())


def _meta_accion(lote_id: str, resumen: str, **extra) -> dict:
    meta = {'lote_id': lote_id, 'rol': 'accion', 'accion_resumen': resumen}
    meta.update(extra)
    return meta


def _meta_efecto(lote_id: str, **extra) -> dict:
    meta = {'lote_id': lote_id, 'rol': 'efecto'}
    meta.update(extra)
    return meta


def agrupar_items_auditoria(items: list[dict]) -> list[dict]:
    """
    Colapsa registros con el mismo lote_id: muestra la acción del usuario
    y anexa los efectos (pesos recalculados, CR, etc.) en ``efectos``.
    """
    from collections import defaultdict

    by_lote: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        lote = (item.get('metadata') or {}).get('lote_id')
        if lote:
            by_lote[lote].append(item)

    seen_lotes: set[str] = set()
    out: list[dict] = []
    for item in items:
        lote = (item.get('metadata') or {}).get('lote_id')
        if not lote:
            out.append({**item, 'efectos': [], 'n_efectos': 0})
            continue
        if lote in seen_lotes:
            continue
        seen_lotes.add(lote)
        members = by_lote[lote]
        accion = next(
            (m for m in members if (m.get('metadata') or {}).get('rol') == 'accion'),
            None,
        )
        if accion is None:
            for prefer in (
                'juicios', 'parametros_funcion', 'aplicar_pesos',
                'familia_funciones', 'peso',
            ):
                accion = next((m for m in members if m.get('campo') == prefer), None)
                if accion:
                    break
        if accion is None:
            accion = members[0]
        efectos = [m for m in members if m['id'] != accion['id']]
        # Orden estable: matriz/CR primero, luego pesos por nombre
        efectos.sort(
            key=lambda m: (
                0 if m.get('tipo_cambio') == 'matriz' else 1,
                m.get('entidad_nombre') or '',
                m.get('id') or 0,
            )
        )
        resumen = (accion.get('metadata') or {}).get('accion_resumen') or ''
        out.append({
            **accion,
            'accion_resumen': resumen,
            'efectos': efectos,
            'n_efectos': len(efectos),
        })
    return out


def auditar_campos_instancia(
    proyecto_id: int,
    usuario: User | None,
    *,
    instancia,
    validated_data: dict,
    tipo_entidad: str,
    entidad_nombre: str,
    omoe_id: int | None = None,
    escenario_id: int | None = None,
    valores_anteriores: dict | None = None,
    campos_peso: tuple = ('peso', 'justificacion_peso'),
    campos_utilidad: tuple = (
        'tipo_criterio', 'familia_funciones', 'parametros_funcion',
        'modo_evaluacion', 'valor_umbral', 'valor_meta',
    ),
) -> list[EventoDecisionRegistro]:
    """
    Registra cambios de peso/utilidad de un mismo guardado bajo un solo lote
    (acción + efectos), para no inundar el historial.
    """
    registros = []
    prev = valores_anteriores or {}
    pendientes: list[tuple[str, str, Any, Any]] = []

    def _anterior(campo):
        if campo in prev:
            return prev[campo]
        return getattr(instancia, campo, None)

    for campo in campos_peso:
        if campo not in validated_data:
            continue
        anterior = _anterior(campo)
        nuevo = validated_data[campo]
        if _json_safe(anterior) == _json_safe(nuevo):
            continue
        pendientes.append((EventoDecisionRegistro.TIPO_PESO, campo, anterior, nuevo))

    for campo in campos_utilidad:
        if campo not in validated_data:
            continue
        anterior = _anterior(campo)
        nuevo = validated_data[campo]
        if _json_safe(anterior) == _json_safe(nuevo):
            continue
        pendientes.append((EventoDecisionRegistro.TIPO_UTILIDAD, campo, anterior, nuevo))

    if not pendientes:
        return registros

    lote_id = nuevo_lote_auditoria()
    prefer_order = (
        'parametros_funcion',
        'familia_funciones',
        'tipo_criterio',
        'modo_evaluacion',
        'peso',
        'valor_meta',
        'valor_umbral',
        'justificacion_peso',
    )
    prefer_idx = {c: i for i, c in enumerate(prefer_order)}
    pendientes.sort(key=lambda row: prefer_idx.get(row[1], 99))

    resumen = f'Actualización de «{entidad_nombre}»'
    if any(c == 'parametros_funcion' for _, c, _, _ in pendientes):
        resumen = f'Constantes / función de utilidad · {entidad_nombre}'
    elif any(c == 'familia_funciones' for _, c, _, _ in pendientes):
        resumen = f'Familia de función · {entidad_nombre}'
    elif any(c == 'peso' for _, c, _, _ in pendientes) and len(pendientes) == 1:
        resumen = f'Peso · {entidad_nombre}'

    for i, (tipo, campo, anterior, nuevo) in enumerate(pendientes):
        meta = (
            _meta_accion(lote_id, resumen)
            if i == 0
            else _meta_efecto(lote_id)
        )
        reg = registrar_cambio(
            proyecto_id,
            usuario,
            tipo_cambio=tipo,
            entidad_tipo=tipo_entidad,
            entidad_id=getattr(instancia, 'pk', None),
            entidad_nombre=entidad_nombre,
            campo=campo,
            valor_anterior=anterior,
            valor_nuevo=nuevo,
            omoe_id=omoe_id,
            escenario_id=escenario_id,
            metadata=meta,
        )
        if reg:
            registros.append(reg)
    return registros


def _serialize_participante(p: EventoDecisionParticipante) -> dict:
    return {
        'id': p.id,
        'nombre': p.nombre,
        'cargo': p.cargo,
        'rol': p.rol,
        'dependencia': p.dependencia,
        'usuario_id': p.usuario_id,
        'usuario_username': p.usuario.username if p.usuario_id else None,
    }


def _serialize_nodo_auditoria(link: EventoDecisionNodo) -> dict:
    n = link.nodo
    return {
        'nodo_id': n.id,
        'nombre': n.nombre,
        'codigo': n.codigo or '',
        'tipo_nivel': n.tipo_nivel.nombre if n.tipo_nivel_id else '',
    }


def _serialize_evento(evento: EventoDecision, *, include_registros_count=False) -> dict:
    data = {
        'id': evento.id,
        'proyecto_id': evento.proyecto_id,
        'omoe_id': evento.omoe_id,
        'omoe_nombre': (
            evento.omoe.nombre_modelo if evento.omoe_id and evento.omoe else None
        ),
        'nombre': evento.nombre,
        'descripcion': evento.descripcion,
        'estado': evento.estado,
        'estado_label': evento.get_estado_display(),
        'tipo_proceso': evento.tipo_proceso,
        'tipo_proceso_label': evento.get_tipo_proceso_display(),
        'alcance_modo': evento.alcance_modo,
        'alcance_modo_label': evento.get_alcance_modo_display(),
        'nodos_auditoria': [
            _serialize_nodo_auditoria(link)
            for link in evento.nodos_auditoria.all()
        ],
        'mediador_usuario_id': evento.mediador_usuario_id,
        'mediador_usuario': (
            evento.mediador_usuario.username if evento.mediador_usuario_id else None
        ),
        'mediador_nombre': evento.mediador_nombre,
        'mediador_cargo': evento.mediador_cargo,
        'mediador_dependencia': evento.mediador_dependencia,
        'fecha_inicio': evento.fecha_inicio.isoformat() if evento.fecha_inicio else None,
        'fecha_cierre': evento.fecha_cierre.isoformat() if evento.fecha_cierre else None,
        'justificacion_cierre': evento.justificacion_cierre,
        'creado_por': evento.creado_por.username if evento.creado_por_id else None,
        'fecha_creacion': evento.fecha_creacion.isoformat(),
        'fecha_actualizacion': evento.fecha_actualizacion.isoformat(),
        'participantes': [
            _serialize_participante(p)
            for p in evento.participantes.all()
        ],
    }
    if include_registros_count:
        data['total_registros'] = evento.registros.count()
    return data


def _serialize_registro(r: EventoDecisionRegistro) -> dict:
    return {
        'id': r.id,
        'evento_id': r.evento_id,
        'evento_nombre': r.evento.nombre if r.evento_id else None,
        'proyecto_id': r.proyecto_id,
        'omoe_id': r.omoe_id,
        'omoe_nombre': (
            r.omoe.nombre_modelo if r.omoe_id and r.omoe else None
        ),
        'escenario_id': r.escenario_id,
        'tipo_cambio': r.tipo_cambio,
        'tipo_cambio_label': r.get_tipo_cambio_display(),
        'entidad_tipo': r.entidad_tipo,
        'entidad_id': r.entidad_id,
        'entidad_nombre': r.entidad_nombre,
        'campo': r.campo,
        'valor_anterior': r.valor_anterior,
        'valor_nuevo': r.valor_nuevo,
        'notas': r.notas,
        'metadata': r.metadata or {},
        'usuario': r.usuario.username if r.usuario_id else None,
        'fecha_creacion': r.fecha_creacion.isoformat(),
    }


def listar_colaboradores_evento(proyecto: Proyecto) -> list[dict]:
    """Usuarios con acceso al proyecto, para armar mesas de trabajo."""
    from .models import ProyectoMembership

    rol_labels = dict(ProyectoMembership.ROL_CHOICES)
    qs = (
        ProyectoMembership.objects.filter(proyecto=proyecto, activo=True)
        .select_related('usuario')
        .order_by('usuario__first_name', 'usuario__last_name', 'usuario__username')
    )
    out = []
    for m in qs:
        u = m.usuario
        nombre = f'{u.first_name} {u.last_name}'.strip() or u.username
        out.append({
            'usuario_id': u.id,
            'username': u.username,
            'nombre': nombre,
            'email': u.email or '',
            'rol_proyecto': m.rol,
            'rol_label': rol_labels.get(m.rol, m.rol),
        })
    return out


def _sync_nodos_auditoria(evento: EventoDecision, nodo_ids: list[int] | None) -> None:
    evento.nodos_auditoria.all().delete()
    if evento.alcance_modo != EventoDecision.ALCANCE_NODOS_SELECCIONADOS:
        return
    if not nodo_ids:
        return
    qs = NodoArbol.objects.filter(id__in=nodo_ids, omoe__proyecto_id=evento.proyecto_id)
    if evento.omoe_id:
        qs = qs.filter(omoe_id=evento.omoe_id)
    valid_ids = set(qs.values_list('id', flat=True))
    EventoDecisionNodo.objects.bulk_create([
        EventoDecisionNodo(evento=evento, nodo_id=nid)
        for nid in valid_ids
    ])


@transaction.atomic
def crear_evento(proyecto: Proyecto, usuario: User, data: dict) -> EventoDecision:
    omoe = None
    omoe_id = data.get('omoe_id')
    if omoe_id:
        omoe = Omoe.objects.get(pk=omoe_id, proyecto=proyecto)
    alcance_modo = data.get('alcance_modo') or EventoDecision.ALCANCE_DIMENSION_COMPLETA
    if alcance_modo not in (
        EventoDecision.ALCANCE_DIMENSION_COMPLETA,
        EventoDecision.ALCANCE_NODOS_SELECCIONADOS,
    ):
        alcance_modo = EventoDecision.ALCANCE_DIMENSION_COMPLETA
    evento = EventoDecision.objects.create(
        proyecto=proyecto,
        omoe=omoe,
        nombre=(data.get('nombre') or '').strip(),
        descripcion=(data.get('descripcion') or '').strip(),
        tipo_proceso=data.get('tipo_proceso') or EventoDecision.TIPO_CONSENSO,
        alcance_modo=alcance_modo,
        mediador_usuario_id=data.get('mediador_usuario_id') or usuario.id,
        mediador_nombre=(data.get('mediador_nombre') or '').strip(),
        mediador_cargo=(data.get('mediador_cargo') or '').strip(),
        mediador_dependencia=(data.get('mediador_dependencia') or '').strip(),
        creado_por=usuario,
    )
    for p in data.get('participantes') or []:
        if not (p.get('nombre') or '').strip():
            continue
        EventoDecisionParticipante.objects.create(
            evento=evento,
            nombre=p['nombre'].strip(),
            cargo=(p.get('cargo') or '').strip(),
            rol=(p.get('rol') or '').strip(),
            dependencia=(p.get('dependencia') or '').strip(),
            usuario_id=p.get('usuario_id'),
        )
    _sync_nodos_auditoria(evento, data.get('nodos_auditoria'))
    return evento


@transaction.atomic
def actualizar_evento(evento: EventoDecision, data: dict) -> EventoDecision:
    if evento.estado == EventoDecision.ESTADO_CERRADO:
        raise ValueError('No se puede editar un evento cerrado.')
    for field in ('nombre', 'descripcion', 'justificacion_cierre'):
        if field in data:
            setattr(evento, field, (data[field] or '').strip())
    if 'tipo_proceso' in data:
        evento.tipo_proceso = data['tipo_proceso']
    if 'alcance_modo' in data:
        modo = data['alcance_modo']
        if modo in (
            EventoDecision.ALCANCE_DIMENSION_COMPLETA,
            EventoDecision.ALCANCE_NODOS_SELECCIONADOS,
        ):
            evento.alcance_modo = modo
    if 'omoe_id' in data:
        if data['omoe_id']:
            evento.omoe = Omoe.objects.get(pk=data['omoe_id'], proyecto_id=evento.proyecto_id)
        else:
            evento.omoe = None
    for field in ('mediador_nombre', 'mediador_cargo', 'mediador_dependencia'):
        if field in data:
            setattr(evento, field, (data.get(field) or '').strip())
    if 'mediador_usuario_id' in data:
        evento.mediador_usuario_id = data['mediador_usuario_id']
    evento.save()
    if 'participantes' in data:
        evento.participantes.all().delete()
        for p in data['participantes'] or []:
            if not (p.get('nombre') or '').strip():
                continue
            EventoDecisionParticipante.objects.create(
                evento=evento,
                nombre=p['nombre'].strip(),
                cargo=(p.get('cargo') or '').strip(),
                rol=(p.get('rol') or '').strip(),
                dependencia=(p.get('dependencia') or '').strip(),
                usuario_id=p.get('usuario_id'),
            )
    if 'alcance_modo' in data:
        modo = data['alcance_modo']
        if modo == EventoDecision.ALCANCE_DIMENSION_COMPLETA:
            _sync_nodos_auditoria(evento, [])
    if 'nodos_auditoria' in data:
        _sync_nodos_auditoria(evento, data.get('nodos_auditoria'))
    return evento


@transaction.atomic
def activar_evento(evento: EventoDecision) -> EventoDecision:
    if evento.estado == EventoDecision.ESTADO_CERRADO:
        raise ValueError('No se puede reactivar un evento cerrado.')
    if evento.alcance_modo == EventoDecision.ALCANCE_NODOS_SELECCIONADOS:
        if not evento.omoe_id:
            raise ValueError('Seleccione la dimensión para auditar nodos específicos.')
        if not evento.nodos_auditoria.exists():
            raise ValueError('Seleccione al menos un nodo para auditar en esta sesión.')
    EventoDecision.objects.filter(
        proyecto_id=evento.proyecto_id,
        estado=EventoDecision.ESTADO_ACTIVO,
    ).exclude(pk=evento.pk).update(estado=EventoDecision.ESTADO_BORRADOR)
    evento.estado = EventoDecision.ESTADO_ACTIVO
    if not evento.fecha_inicio:
        evento.fecha_inicio = timezone.now()
    evento.save(update_fields=['estado', 'fecha_inicio', 'fecha_actualizacion'])
    return evento


@transaction.atomic
def cerrar_evento(evento: EventoDecision, justificacion: str = '') -> EventoDecision:
    if evento.estado != EventoDecision.ESTADO_ACTIVO:
        raise ValueError('Solo se pueden cerrar eventos activos.')
    evento.estado = EventoDecision.ESTADO_CERRADO
    evento.fecha_cierre = timezone.now()
    if justificacion:
        evento.justificacion_cierre = justificacion.strip()
    evento.save(update_fields=[
        'estado', 'fecha_cierre', 'justificacion_cierre', 'fecha_actualizacion',
    ])
    return evento


def listar_eventos(proyecto: Proyecto) -> list[dict]:
    qs = (
        EventoDecision.objects.filter(proyecto=proyecto)
        .select_related('omoe', 'mediador_usuario', 'creado_por')
        .prefetch_related('participantes', 'nodos_auditoria__nodo__tipo_nivel')
    )
    return [_serialize_evento(e, include_registros_count=True) for e in qs]


def consultar_auditoria(
    proyecto: Proyecto,
    *,
    evento_id: int | None = None,
    omoe_id: int | None = None,
    participante: str | None = None,
    nodo_id: int | None = None,
    entidad_tipo: str | None = None,
    entidad_id: int | None = None,
    tipo_cambio: str | None = None,
    limit: int = 100,
) -> dict:
    qs = (
        EventoDecisionRegistro.objects.filter(proyecto=proyecto)
        .select_related('evento', 'omoe', 'usuario')
    )
    if evento_id:
        qs = qs.filter(evento_id=evento_id)
    if omoe_id:
        qs = qs.filter(omoe_id=omoe_id)
    if tipo_cambio:
        qs = qs.filter(tipo_cambio=tipo_cambio)
    if entidad_id:
        qs = qs.filter(
            entidad_id=entidad_id,
            entidad_tipo=entidad_tipo or 'nodo_arbol',
        )
    elif nodo_id:
        qs = qs.filter(entidad_id=nodo_id, entidad_tipo='nodo_arbol')
    if participante:
        qs = qs.filter(
            evento__participantes__nombre__icontains=participante,
        ).distinct()
    total = qs.count()
    # Tomar más filas crudas para poder agrupar lotes sin truncar efectos.
    raw_limit = min(max(limit * 8, limit), 500)
    raw_items = [
        _serialize_registro(r)
        for r in qs.order_by('-fecha_creacion', '-id')[:raw_limit]
    ]
    grouped = agrupar_items_auditoria(raw_items)[:limit]
    evento_activo = get_evento_activo(proyecto.id)
    return {
        'total': total,
        'total_acciones': len(grouped),
        'items': grouped,
        'agrupado': True,
        'evento_activo': (
            _serialize_evento(evento_activo) if evento_activo else None
        ),
    }


def listar_nodos_auditoria(proyecto: Proyecto, omoe_id: int | None = None) -> list[dict]:
    """Nodos del árbol disponibles para consultar historial."""
    from .models import NodoArbol

    qs = (
        NodoArbol.objects.filter(omoe__proyecto=proyecto)
        .select_related('omoe', 'tipo_nivel')
        .order_by('omoe__orden', 'omoe__nombre_modelo', 'orden_visual', 'nombre', 'id')
    )
    if omoe_id:
        qs = qs.filter(omoe_id=omoe_id)
    return [
        {
            'entidad_tipo': 'nodo_arbol',
            'entidad_id': n.id,
            'nombre': n.nombre,
            'codigo': n.codigo or '',
            'omoe_id': n.omoe_id,
            'omoe_nombre': n.omoe.nombre_modelo or n.omoe.codigo or '',
            'tipo_nivel': n.tipo_nivel.nombre if n.tipo_nivel_id else '',
            'fecha_creacion': n.fecha_creacion.isoformat() if n.fecha_creacion else None,
        }
        for n in qs
    ]


def historial_entidad(
    proyecto: Proyecto,
    *,
    entidad_tipo: str,
    entidad_id: int,
) -> dict[str, Any]:
    """Línea de tiempo de cambios de un nodo/entidad a través de todas las sesiones."""
    from .models import NodoArbol

    entidad: dict[str, Any] | None = None
    fecha_creacion_sistema: str | None = None

    if entidad_tipo == 'nodo_arbol':
        nodo = (
            NodoArbol.objects.filter(pk=entidad_id, omoe__proyecto=proyecto)
            .select_related('omoe', 'tipo_nivel')
            .first()
        )
        if not nodo:
            return {'entidad': None, 'timeline': [], 'total': 0, 'sesiones': []}
        entidad = {
            'entidad_tipo': 'nodo_arbol',
            'entidad_id': nodo.id,
            'nombre': nodo.nombre,
            'codigo': nodo.codigo or '',
            'omoe_id': nodo.omoe_id,
            'omoe_nombre': nodo.omoe.nombre_modelo or nodo.omoe.codigo or '',
            'tipo_nivel': nodo.tipo_nivel.nombre if nodo.tipo_nivel_id else '',
        }
        fecha_creacion_sistema = (
            nodo.fecha_creacion.isoformat() if nodo.fecha_creacion else None
        )

    registros = list(
        EventoDecisionRegistro.objects.filter(
            proyecto=proyecto,
            entidad_tipo=entidad_tipo,
            entidad_id=entidad_id,
        )
        .select_related('evento', 'omoe', 'usuario')
        .order_by('fecha_creacion', 'id')
    )

    timeline: list[dict[str, Any]] = []
    tiene_creacion_auditada = any(r.campo == 'creacion' for r in registros)

    if fecha_creacion_sistema and not tiene_creacion_auditada:
        timeline.append({
            'id': None,
            'kind': 'sistema',
            'fecha_creacion': fecha_creacion_sistema,
            'tipo_cambio': EventoDecisionRegistro.TIPO_ESTRUCTURA,
            'tipo_cambio_label': 'Creación del nodo',
            'campo': 'creacion',
            'valor_anterior': None,
            'valor_nuevo': entidad,
            'usuario': None,
            'evento_id': None,
            'evento_nombre': None,
            'evento_estado': None,
            'notas': 'Fecha de creación en el sistema (sin sesión activa registrada).',
        })

    sesiones_map: dict[int, dict] = {}
    for r in registros:
        item = _serialize_registro(r)
        item['kind'] = 'registro'
        item['evento_estado'] = r.evento.estado if r.evento_id else None
        item['evento_estado_label'] = (
            r.evento.get_estado_display() if r.evento_id else None
        )
        timeline.append(item)
        if r.evento_id and r.evento_id not in sesiones_map:
            sesiones_map[r.evento_id] = {
                'id': r.evento_id,
                'nombre': r.evento.nombre,
                'estado': r.evento.estado,
                'estado_label': r.evento.get_estado_display(),
                'fecha_inicio': (
                    r.evento.fecha_inicio.isoformat() if r.evento.fecha_inicio else None
                ),
                'fecha_cierre': (
                    r.evento.fecha_cierre.isoformat() if r.evento.fecha_cierre else None
                ),
            }

    sesiones = sorted(
        sesiones_map.values(),
        key=lambda s: s.get('fecha_inicio') or '',
        reverse=True,
    )

    return {
        'entidad': entidad,
        'total': len(timeline),
        'timeline': timeline,
        'sesiones': sesiones,
    }


def exportar_informe_evento(evento: EventoDecision) -> dict:
    registros = list(
        evento.registros.select_related('omoe', 'usuario')
        .order_by('fecha_creacion', 'id')
    )
    por_tipo: dict[str, int] = {}
    for r in registros:
        por_tipo[r.tipo_cambio] = por_tipo.get(r.tipo_cambio, 0) + 1
    return {
        'evento': _serialize_evento(evento),
        'registros': [_serialize_registro(r) for r in registros],
        'resumen': {
            'total_cambios': len(registros),
            'por_tipo': por_tipo,
        },
    }
