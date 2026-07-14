"""Configuración del árbol de criterios por escenario (pesos, activación, utilidad)."""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from .models import Escenario, NivelImpacto, NodoArbol, NodoArbolEscenario, NivelProbabilidad, Omoe
from .peso_service import (
    PESO_TOLERANCE,
    PESO_TOTAL,
    _q2,
    _validate_peso_value,
)


def _config_row_from_nodo(nodo: NodoArbol) -> dict[str, Any]:
    return {
        'peso': nodo.peso,
        'aplica': nodo.aplica,
        'tipo_criterio': nodo.tipo_criterio or '',
        'familia_funciones': nodo.familia_funciones or '',
        'parametros_funcion': nodo.parametros_funcion or {},
        'nivel_probabilidad_id': nodo.nivel_probabilidad_id,
        'nivel_impacto_id': nodo.nivel_impacto_id,
        'tipo_consecuencia': nodo.tipo_consecuencia or NivelImpacto.TIPO_DESEMPENO,
    }


def _resolve_fk_id(model_cls, raw_id, proyecto_id: int | None) -> int | None:
    if raw_id in (None, '', 0, '0'):
        return None
    try:
        pk = int(raw_id)
    except (TypeError, ValueError):
        return None
    if proyecto_id is None:
        return pk if model_cls.objects.filter(pk=pk).exists() else None
    return pk if model_cls.objects.filter(pk=pk, proyecto_id=proyecto_id).exists() else None


def _riesgo_fields_from_cfg(cfg: NodoArbolEscenario, nodo: NodoArbol) -> dict[str, Any]:
    prob = cfg.nivel_probabilidad or nodo.nivel_probabilidad
    imp = cfg.nivel_impacto or nodo.nivel_impacto
    tipo = cfg.tipo_consecuencia or nodo.tipo_consecuencia or NivelImpacto.TIPO_DESEMPENO
    return {
        'nivel_probabilidad_id': prob.id if prob else None,
        'nivel_impacto_id': imp.id if imp else None,
        'tipo_consecuencia': tipo,
        'nivel_probabilidad': (
            {'id': prob.id, 'valor': float(prob.valor), 'descripcion': prob.descripcion}
            if prob else None
        ),
        'nivel_impacto': (
            {
                'id': imp.id,
                'valor': float(imp.valor),
                'descripcion': imp.descripcion_para(tipo),
            }
            if imp else None
        ),
    }


def seed_arbol_config_for_escenario(escenario: Escenario) -> int:
    """Crea filas de configuración para todos los nodos de la dimensión del escenario."""
    if not escenario.omoe_id:
        return 0
    nodos = NodoArbol.objects.filter(omoe_id=escenario.omoe_id)
    existing = set(
        NodoArbolEscenario.objects.filter(escenario=escenario).values_list('nodo_arbol_id', flat=True)
    )
    to_create = []
    for nodo in nodos:
        if nodo.id in existing:
            continue
        defaults = _config_row_from_nodo(nodo)
        to_create.append(
            NodoArbolEscenario(
                escenario=escenario,
                nodo_arbol=nodo,
                **defaults,
            )
        )
    if to_create:
        NodoArbolEscenario.objects.bulk_create(to_create, ignore_conflicts=True)
    return len(to_create)


def seed_nodo_for_escenarios(nodo: NodoArbol) -> None:
    """Añade configuración del nodo a todos los escenarios de su dimensión."""
    if not nodo.omoe_id:
        return
    defaults = _config_row_from_nodo(nodo)
    for escenario in Escenario.objects.filter(omoe_id=nodo.omoe_id):
        NodoArbolEscenario.objects.get_or_create(
            escenario=escenario,
            nodo_arbol=nodo,
            defaults=defaults,
        )


def load_config_map(escenario_id: int) -> dict[int, dict[str, Any]]:
    """Mapa nodo_id → configuración efectiva para un escenario."""
    rows = NodoArbolEscenario.objects.filter(escenario_id=escenario_id).select_related('nodo_arbol')
    return {
        row.nodo_arbol_id: {
            'peso': float(row.peso or 0),
            'aplica': bool(row.aplica),
            'tipo_criterio': row.tipo_criterio or '',
            'familia_funciones': row.familia_funciones or '',
            'parametros_funcion': row.parametros_funcion or {},
        }
        for row in rows
    }


def resolve_tree_config_for_calc(omoe_id: int, escenarios: list) -> dict[int, dict[str, Any]] | None:
    """Elige la configuración de árbol según el escenario de cálculo."""
    linked = [esc for esc in escenarios if getattr(esc, 'omoe_id', None) == omoe_id]
    if not linked:
        linked = list(escenarios)
    if not linked:
        return None
    escenario_id = linked[0].id
    config = load_config_map(escenario_id)
    if config:
        return config
    escenario = linked[0]
    seed_arbol_config_for_escenario(escenario)
    return load_config_map(escenario_id)


def nodo_effective_aplica(nodo: NodoArbol, config_map: dict[int, dict[str, Any]] | None) -> bool:
    if config_map and nodo.id in config_map:
        return bool(config_map[nodo.id].get('aplica', True))
    return bool(nodo.aplica)


def nodo_effective_peso(nodo: NodoArbol, config_map: dict[int, dict[str, Any]] | None) -> float:
    if config_map and nodo.id in config_map:
        return float(config_map[nodo.id].get('peso', 0) or 0)
    return float(nodo.peso or 0)


def merge_criterio_fields_for_escenario(
    nodo: NodoArbol,
    config_map: dict[int, dict[str, Any]] | None,
) -> dict[str, Any]:
    cfg = (config_map or {}).get(nodo.id) or {}
    # El nodo (Información del árbol de dimensiones) es la fuente de verdad de la
    # configuración de evaluación; el escenario solo ajusta peso/activación.
    familia = (nodo.familia_funciones or cfg.get('familia_funciones') or '').strip()
    tipo = (nodo.tipo_criterio or cfg.get('tipo_criterio') or '').strip()
    params = nodo.parametros_funcion or cfg.get('parametros_funcion') or {}
    return {
        'nombre': nodo.nombre,
        'familia': familia,
        'params': params,
        'tipo_criterio': tipo,
        'tipo_dato': nodo.tipo_dato or '',
        'valor_umbral': nodo.valor_umbral,
        'valor_meta': nodo.valor_meta,
        'sentido_mejora': nodo.sentido_mejora or '',
        # Modo (certeza/incertidumbre) es propiedad del nodo, no del escenario.
        'modo_evaluacion': nodo.modo_evaluacion or 'certeza',
    }


def _sibling_groups(nodos: list[NodoArbol]) -> dict[int | None, list[NodoArbol]]:
    groups: dict[int | None, list[NodoArbol]] = defaultdict(list)
    for nodo in nodos:
        groups[nodo.parent_id].append(nodo)
    return groups


def _is_terminal_for_items(nodo_id: int, nodos: list[NodoArbol], active_ids: set[int]) -> bool:
    return not any(n.parent_id == nodo_id and n.id in active_ids for n in nodos)


def _peso_resumen_grupo(items: list[dict[str, Any]]) -> dict[str, Any]:
    activos = [i for i in items if i.get('aplica')]
    total = sum(float(i.get('peso') or 0) for i in activos)
    ok = len(activos) <= 1 or abs(total - float(PESO_TOTAL)) <= float(PESO_TOLERANCE)
    return {
        'total': round(total, 2),
        'count': len(activos),
        'ok': ok,
        'esperado': float(PESO_TOTAL),
    }


def validate_config_items(omoe_id: int, items: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    nodos = {n.id: n for n in NodoArbol.objects.filter(omoe_id=omoe_id)}
    if not nodos:
        return errors

    for item in items:
        nodo_id = int(item['nodo_id'])
        nodo = nodos.get(nodo_id)
        if not nodo:
            errors.append(f'Nodo #{nodo_id} no pertenece a la dimensión.')
            continue
        if item.get('aplica'):
            try:
                _validate_peso_value(item.get('peso', 0))
            except ValidationError as exc:
                errors.append(f'«{nodo.nombre}»: {exc.messages[0]}')

    return errors


def get_arbol_config_payload(escenario: Escenario) -> dict[str, Any]:
    if not escenario.omoe_id:
        raise ValidationError('El escenario debe estar vinculado a una dimensión (OMOE).')

    omoe = Omoe.objects.get(pk=escenario.omoe_id)
    nodos = list(
        NodoArbol.objects.filter(omoe_id=escenario.omoe_id)
        .select_related('tipo_nivel')
        .order_by('orden_visual', 'nombre', 'id')
    )
    seed_arbol_config_for_escenario(escenario)
    configs = {
        row.nodo_arbol_id: row
        for row in NodoArbolEscenario.objects.filter(escenario=escenario)
    }

    active_ids = {n.id for n in nodos if configs[n.id].aplica}
    items: list[dict[str, Any]] = []
    for nodo in nodos:
        cfg = configs[nodo.id]
        items.append({
            'nodo_id': nodo.id,
            'parent_id': nodo.parent_id,
            'nombre': nodo.nombre,
            'codigo': nodo.codigo or '',
            'tipo_nivel_id': nodo.tipo_nivel_id,
            'tipo_nivel_nombre': nodo.tipo_nivel.nombre if nodo.tipo_nivel_id else '',
            'orden_visual': nodo.orden_visual,
            'peso': float(cfg.peso or 0),
            'aplica': bool(cfg.aplica),
            'tipo_criterio': cfg.tipo_criterio or nodo.tipo_criterio or '',
            'familia_funciones': cfg.familia_funciones or nodo.familia_funciones or '',
            'parametros_funcion': cfg.parametros_funcion or nodo.parametros_funcion or {},
            'es_terminal': _is_terminal_for_items(nodo.id, nodos, active_ids),
            'defaults': {
                'peso': float(nodo.peso or 0),
                'aplica': bool(nodo.aplica),
                'tipo_criterio': nodo.tipo_criterio or '',
                'familia_funciones': nodo.familia_funciones or '',
                'parametros_funcion': nodo.parametros_funcion or {},
            },
        })

    from .peso_grupo_ahp_service import grupo_ahp_resumen_for_arbol

    grupos_ahp = grupo_ahp_resumen_for_arbol(escenario)
    grupos_peso: dict[str, dict[str, Any]] = {}
    for parent_id, group_nodos in _sibling_groups(nodos).items():
        group_items = [i for i in items if i['parent_id'] == parent_id]
        key = 'root' if parent_id is None else str(parent_id)
        resumen = _peso_resumen_grupo(group_items)
        ahp = grupos_ahp.get(key, {})
        grupos_peso[key] = {**resumen, **ahp}

    return {
        'escenario_id': escenario.id,
        'escenario_nombre': escenario.nombre,
        'omoe_id': omoe.id,
        'omoe_nombre': omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.id}',
        'nodos': items,
        'grupos_peso': grupos_peso,
        'valido': all(g['ok'] for g in grupos_peso.values()),
    }


@transaction.atomic
def save_arbol_config(
    escenario: Escenario,
    items: list[dict[str, Any]],
    *,
    usuario=None,
) -> dict[str, Any]:
    if not escenario.omoe_id:
        raise ValidationError('El escenario debe estar vinculado a una dimensión (OMOE).')

    errors = validate_config_items(escenario.omoe_id, items)
    if errors:
        raise ValidationError(errors)

    nodos_ids = set(
        NodoArbol.objects.filter(omoe_id=escenario.omoe_id).values_list('id', flat=True)
    )
    seed_arbol_config_for_escenario(escenario)
    existing = {
        row.nodo_arbol_id: row
        for row in NodoArbolEscenario.objects.filter(escenario=escenario)
    }

    for item in items:
        nodo_id = int(item['nodo_id'])
        if nodo_id not in nodos_ids:
            raise ValidationError(f'Nodo #{nodo_id} no pertenece a la dimensión del escenario.')
        row = existing.get(nodo_id)
        if row is None:
            row = NodoArbolEscenario(escenario=escenario, nodo_arbol_id=nodo_id)
        nodo = NodoArbol.objects.filter(pk=nodo_id).first()
        nodo_nombre = nodo.nombre if nodo else f'Nodo #{nodo_id}'
        antes = {
            'peso': float(row.peso or 0) if row.pk else None,
            'aplica': row.aplica if row.pk else None,
            'tipo_criterio': row.tipo_criterio if row.pk else None,
            'familia_funciones': row.familia_funciones if row.pk else None,
            'parametros_funcion': row.parametros_funcion if row.pk else None,
        }
        row.peso = _q2(Decimal(str(item.get('peso') or 0)))
        row.aplica = bool(item.get('aplica', True))
        row.tipo_criterio = (item.get('tipo_criterio') or '').strip()
        row.familia_funciones = (item.get('familia_funciones') or '').strip()
        row.parametros_funcion = item.get('parametros_funcion') or {}
        row.save()
        if usuario:
            from .evento_decision_service import registrar_cambio
            from .models import EventoDecisionRegistro

            proyecto_id = escenario.proyecto_id
            omoe_id = escenario.omoe_id
            escenario_id = escenario.id
            for campo, tipo in (
                ('peso', EventoDecisionRegistro.TIPO_PESO),
                ('aplica', EventoDecisionRegistro.TIPO_CONFIG_ESCENARIO),
                ('tipo_criterio', EventoDecisionRegistro.TIPO_UTILIDAD),
                ('familia_funciones', EventoDecisionRegistro.TIPO_UTILIDAD),
                ('parametros_funcion', EventoDecisionRegistro.TIPO_UTILIDAD),
            ):
                nuevo = item.get(campo) if campo != 'peso' else float(row.peso or 0)
                if campo == 'aplica':
                    nuevo = bool(item.get('aplica', True))
                anterior = antes.get(campo)
                if anterior == nuevo:
                    continue
                registrar_cambio(
                    proyecto_id,
                    usuario,
                    tipo_cambio=tipo,
                    entidad_tipo='nodo_arbol_escenario',
                    entidad_id=nodo_id,
                    entidad_nombre=nodo_nombre,
                    campo=campo,
                    valor_anterior=anterior,
                    valor_nuevo=nuevo,
                    omoe_id=omoe_id,
                    escenario_id=escenario_id,
                )

    return get_arbol_config_payload(escenario)


def get_nodo_config_payload(escenario: Escenario, nodo_id: int) -> dict[str, Any]:
    if not escenario.omoe_id:
        raise ValidationError('El escenario debe estar vinculado a una dimensión (OMOE).')

    nodo = NodoArbol.objects.filter(pk=nodo_id, omoe_id=escenario.omoe_id).select_related(
        'tipo_nivel', 'nivel_probabilidad', 'nivel_impacto',
    ).first()
    if not nodo:
        raise ValidationError('El nodo no pertenece a la dimensión del escenario.')

    seed_arbol_config_for_escenario(escenario)
    cfg, _ = NodoArbolEscenario.objects.select_related(
        'nivel_probabilidad', 'nivel_impacto',
    ).get_or_create(
        escenario=escenario,
        nodo_arbol=nodo,
        defaults=_config_row_from_nodo(nodo),
    )

    hermanos_qs = NodoArbol.objects.filter(
        omoe_id=escenario.omoe_id, parent_id=nodo.parent_id,
    ).order_by('orden_visual', 'nombre', 'id')
    hermano_configs = {
        row.nodo_arbol_id: row
        for row in NodoArbolEscenario.objects.filter(
            escenario=escenario, nodo_arbol_id__in=hermanos_qs.values_list('id', flat=True),
        )
    }
    hermanos = []
    for h in hermanos_qs:
        hcfg = hermano_configs.get(h.id)
        if hcfg is None:
            defaults = _config_row_from_nodo(h)
            hcfg, _ = NodoArbolEscenario.objects.get_or_create(
                escenario=escenario,
                nodo_arbol=h,
                defaults=defaults,
            )
        hermanos.append({
            'nodo_id': h.id,
            'nombre': h.nombre,
            'peso': float(hcfg.peso or 0),
            'aplica': bool(hcfg.aplica),
        })

    all_nodos = NodoArbol.objects.filter(omoe_id=escenario.omoe_id)
    all_configs = {
        row.nodo_arbol_id: row
        for row in NodoArbolEscenario.objects.filter(escenario=escenario)
    }
    active_all = {nid for nid, c in all_configs.items() if c.aplica}
    es_terminal = not any(
        n.parent_id == nodo.id and n.id in active_all for n in all_nodos
    )

    grupo = _peso_resumen_grupo([
        {'aplica': h['aplica'], 'peso': h['peso']} for h in hermanos
    ])
    tiene_hijos = NodoArbol.objects.filter(omoe_id=escenario.omoe_id, parent_id=nodo.id).exists()

    from .peso_grupo_ahp_service import build_grupo_payload

    try:
        peso_grupo_ahp = build_grupo_payload(escenario, nodo.parent_id)
    except ValidationError:
        peso_grupo_ahp = None

    return {
        'escenario_id': escenario.id,
        'escenario_nombre': escenario.nombre,
        'nodo_id': nodo.id,
        'nodo_nombre': nodo.nombre,
        'tipo_nivel_nombre': nodo.tipo_nivel.nombre if nodo.tipo_nivel_id else '',
        'parent_id': nodo.parent_id,
        'peso': float(cfg.peso or 0),
        'aplica': bool(cfg.aplica),
        'tipo_criterio': cfg.tipo_criterio or nodo.tipo_criterio or '',
        'familia_funciones': cfg.familia_funciones or nodo.familia_funciones or '',
        'parametros_funcion': cfg.parametros_funcion or nodo.parametros_funcion or {},
        **_riesgo_fields_from_cfg(cfg, nodo),
        'es_terminal': es_terminal,
        'tiene_hijos': tiene_hijos,
        'hermanos': hermanos,
        'grupo_peso': grupo,
        'peso_grupo_ahp': peso_grupo_ahp,
    }


def _collect_descendant_ids(omoe_id: int, root_id: int) -> list[int]:
    """IDs de todos los nodos descendientes de root_id en la dimensión."""
    rows = NodoArbol.objects.filter(omoe_id=omoe_id).values_list('id', 'parent_id')
    by_parent: dict[int | None, list[int]] = defaultdict(list)
    for nid, pid in rows:
        by_parent[pid].append(nid)
    out: list[int] = []
    stack = list(by_parent.get(root_id, []))
    while stack:
        cur = stack.pop()
        out.append(cur)
        stack.extend(by_parent.get(cur, []))
    return out


def _cascade_deactivate_descendants(escenario: Escenario, nodo_id: int) -> int:
    """Desactiva en el escenario todos los nodos hijos (recursivo) del nodo dado."""
    if not escenario.omoe_id:
        return 0
    desc_ids = _collect_descendant_ids(escenario.omoe_id, nodo_id)
    if not desc_ids:
        return 0
    seed_arbol_config_for_escenario(escenario)
    nodos_by_id = {
        n.id: n for n in NodoArbol.objects.filter(pk__in=desc_ids)
    }
    to_update: list[NodoArbolEscenario] = []
    for did in desc_ids:
        nodo = nodos_by_id.get(did)
        if not nodo:
            continue
        row, _ = NodoArbolEscenario.objects.get_or_create(
            escenario=escenario,
            nodo_arbol=nodo,
            defaults=_config_row_from_nodo(nodo),
        )
        if row.aplica:
            row.aplica = False
            to_update.append(row)
    if to_update:
        NodoArbolEscenario.objects.bulk_update(to_update, ['aplica'])
    return len(to_update)


def _cascade_activate_descendants(escenario: Escenario, nodo_id: int) -> int:
    """Activa en el escenario todos los nodos hijos (recursivo) del nodo dado."""
    if not escenario.omoe_id:
        return 0
    desc_ids = _collect_descendant_ids(escenario.omoe_id, nodo_id)
    if not desc_ids:
        return 0
    seed_arbol_config_for_escenario(escenario)
    nodos_by_id = {
        n.id: n for n in NodoArbol.objects.filter(pk__in=desc_ids)
    }
    to_update: list[NodoArbolEscenario] = []
    for did in desc_ids:
        nodo = nodos_by_id.get(did)
        if not nodo:
            continue
        row, _ = NodoArbolEscenario.objects.get_or_create(
            escenario=escenario,
            nodo_arbol=nodo,
            defaults=_config_row_from_nodo(nodo),
        )
        if not row.aplica:
            row.aplica = True
            to_update.append(row)
    if to_update:
        NodoArbolEscenario.objects.bulk_update(to_update, ['aplica'])
    return len(to_update)


def _hermano_items_for_escenario(escenario: Escenario, parent_id: int | None) -> list[dict[str, Any]]:
    hermanos_qs = NodoArbol.objects.filter(omoe_id=escenario.omoe_id, parent_id=parent_id)
    items = []
    for h in hermanos_qs:
        hcfg, _ = NodoArbolEscenario.objects.get_or_create(
            escenario=escenario,
            nodo_arbol=h,
            defaults=_config_row_from_nodo(h),
        )
        items.append({
            'nodo_id': h.id,
            'peso': float(hcfg.peso or 0),
            'aplica': bool(hcfg.aplica),
        })
    return items


def propagate_nodo_config(
    escenario_origen: Escenario,
    nodo_id: int,
    row: NodoArbolEscenario,
    *,
    cascade_aplica: bool = False,
) -> int:
    """Copia peso, activación y utilidad del nodo al resto de escenarios de la dimensión."""
    if not escenario_origen.omoe_id:
        raise ValidationError('El escenario debe estar vinculado a una dimensión (OMOE).')

    nodo = NodoArbol.objects.filter(pk=nodo_id, omoe_id=escenario_origen.omoe_id).first()
    if not nodo:
        raise ValidationError('El nodo no pertenece a la dimensión del escenario.')

    otros = Escenario.objects.filter(omoe_id=escenario_origen.omoe_id).exclude(pk=escenario_origen.pk)
    count = 0
    for esc in otros:
        seed_arbol_config_for_escenario(esc)
        target, _ = NodoArbolEscenario.objects.get_or_create(
            escenario=esc,
            nodo_arbol=nodo,
            defaults=_config_row_from_nodo(nodo),
        )
        target.peso = row.peso
        target.aplica = row.aplica
        target.tipo_criterio = row.tipo_criterio
        target.familia_funciones = row.familia_funciones
        target.parametros_funcion = row.parametros_funcion or {}
        target.nivel_probabilidad_id = row.nivel_probabilidad_id
        target.nivel_impacto_id = row.nivel_impacto_id
        target.tipo_consecuencia = row.tipo_consecuencia
        target.save()
        if cascade_aplica:
            if not row.aplica:
                _cascade_deactivate_descendants(esc, nodo.id)
            else:
                _cascade_activate_descendants(esc, nodo.id)
        count += 1
    return count


@transaction.atomic
def save_nodo_config(
    escenario: Escenario,
    nodo_id: int,
    data: dict[str, Any],
    *,
    usuario=None,
) -> dict[str, Any]:
    if not escenario.omoe_id:
        raise ValidationError('El escenario debe estar vinculado a una dimensión (OMOE).')

    nodo = NodoArbol.objects.filter(pk=nodo_id, omoe_id=escenario.omoe_id).first()
    if not nodo:
        raise ValidationError('El nodo no pertenece a la dimensión del escenario.')

    seed_arbol_config_for_escenario(escenario)
    row, _ = NodoArbolEscenario.objects.get_or_create(
        escenario=escenario,
        nodo_arbol=nodo,
        defaults=_config_row_from_nodo(nodo),
    )
    from .peso_grupo_ahp_service import get_grupo_modo
    from .models import PesoGrupoAhp

    propagar = bool(data.get('propagar_a_todos', False))
    aplica_antes = bool(row.aplica)
    snapshot_antes = {
        'peso': float(row.peso or 0),
        'aplica': row.aplica,
        'tipo_criterio': row.tipo_criterio or '',
        'familia_funciones': row.familia_funciones or '',
        'parametros_funcion': row.parametros_funcion or {},
    }

    modo_grupo = get_grupo_modo(escenario, nodo.parent_id)
    if modo_grupo == PesoGrupoAhp.MODO_AHP and 'peso' in data:
        pass
    else:
        row.peso = _q2(Decimal(str(data.get('peso', row.peso) or 0)))
    row.aplica = bool(data.get('aplica', row.aplica))
    # La configuración de evaluación (utilidad/riesgo) vive en el nodo; el escenario
    # solo actualiza estos campos si se envían explícitamente (compatibilidad).
    if 'tipo_criterio' in data:
        row.tipo_criterio = (data.get('tipo_criterio') or '').strip()
    if 'familia_funciones' in data:
        row.familia_funciones = (data.get('familia_funciones') or '').strip()
    if 'parametros_funcion' in data:
        row.parametros_funcion = data.get('parametros_funcion') or {}
    proyecto_id = escenario.proyecto_id
    if 'nivel_probabilidad_id' in data:
        row.nivel_probabilidad_id = _resolve_fk_id(
            NivelProbabilidad,
            data.get('nivel_probabilidad_id'),
            proyecto_id,
        )
    if 'nivel_impacto_id' in data:
        row.nivel_impacto_id = _resolve_fk_id(
            NivelImpacto,
            data.get('nivel_impacto_id'),
            proyecto_id,
        )
    tipo = (data.get('tipo_consecuencia') or '').strip()
    if tipo in dict(NivelImpacto.TIPO_CONSECUENCIA_CHOICES):
        row.tipo_consecuencia = tipo
    row.save()

    if usuario:
        from .evento_decision_service import (
            _meta_accion,
            _meta_efecto,
            nuevo_lote_auditoria,
            registrar_cambio,
        )
        from .models import EventoDecisionRegistro

        proyecto_id = escenario.proyecto_id
        omoe_id = escenario.omoe_id
        escenario_id = escenario.id
        snapshot_despues = {
            'peso': float(row.peso or 0),
            'aplica': row.aplica,
            'tipo_criterio': row.tipo_criterio or '',
            'familia_funciones': row.familia_funciones or '',
            'parametros_funcion': dict(row.parametros_funcion or {}),
        }
        pendientes = []
        for campo, tipo in (
            ('peso', EventoDecisionRegistro.TIPO_PESO),
            ('aplica', EventoDecisionRegistro.TIPO_CONFIG_ESCENARIO),
            ('tipo_criterio', EventoDecisionRegistro.TIPO_UTILIDAD),
            ('familia_funciones', EventoDecisionRegistro.TIPO_UTILIDAD),
            ('parametros_funcion', EventoDecisionRegistro.TIPO_UTILIDAD),
        ):
            if campo not in data and campo != 'peso':
                continue
            if campo == 'peso' and modo_grupo == PesoGrupoAhp.MODO_AHP and 'peso' in data:
                continue
            anterior = snapshot_antes.get(campo)
            nuevo = snapshot_despues.get(campo)
            if anterior == nuevo:
                continue
            pendientes.append((tipo, campo, anterior, nuevo))

        if pendientes:
            lote_id = nuevo_lote_auditoria()
            prefer = (
                'parametros_funcion', 'familia_funciones', 'peso',
                'tipo_criterio', 'aplica',
            )
            prefer_idx = {c: i for i, c in enumerate(prefer)}
            pendientes.sort(key=lambda row: prefer_idx.get(row[1], 99))
            resumen = f'Actualización de «{nodo.nombre}»'
            if any(c == 'parametros_funcion' for _, c, _, _ in pendientes):
                resumen = f'Constantes / función de utilidad · {nodo.nombre}'
            for i, (tipo, campo, anterior, nuevo) in enumerate(pendientes):
                registrar_cambio(
                    proyecto_id,
                    usuario,
                    tipo_cambio=tipo,
                    entidad_tipo='nodo_arbol',
                    entidad_id=nodo.id,
                    entidad_nombre=nodo.nombre,
                    campo=campo,
                    valor_anterior=anterior,
                    valor_nuevo=nuevo,
                    omoe_id=omoe_id,
                    escenario_id=escenario_id,
                    metadata=(
                        _meta_accion(lote_id, resumen)
                        if i == 0
                        else _meta_efecto(lote_id)
                    ),
                )

    aplica_cambio = row.aplica != aplica_antes
    descendientes_desactivados = 0
    descendientes_activados = 0
    if aplica_cambio:
        if not row.aplica:
            descendientes_desactivados = _cascade_deactivate_descendants(escenario, nodo.id)
        else:
            descendientes_activados = _cascade_activate_descendants(escenario, nodo.id)

    hermano_items = _hermano_items_for_escenario(escenario, nodo.parent_id)
    errors = validate_config_items(escenario.omoe_id, hermano_items)
    if errors:
        raise ValidationError(errors)

    payload = get_nodo_config_payload(escenario, nodo_id)
    if descendientes_desactivados:
        payload['descendientes_desactivados'] = descendientes_desactivados
    if descendientes_activados:
        payload['descendientes_activados'] = descendientes_activados
    if propagar:
        payload['propagados'] = propagate_nodo_config(
            escenario, nodo_id, row, cascade_aplica=aplica_cambio,
        )
    return payload
