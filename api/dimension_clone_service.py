"""Clonar / importar dimensión (árbol micro) entre proyectos."""
from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, InvalidOperation
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count

from .arbol_nivel_service import (
    MAX_NIVELES_ARBOL,
    ensure_niveles_arbol,
    get_max_nivel_orden,
    get_nivel_por_orden,
    next_orden_omoe,
)
from .escenario_service import ensure_escenario_estandar
from .evaluacion_rama_choices import RAMA_OMOE
from .models import NodoArbol, Omoe, Proyecto, ProyectoNivelArbol
from .nodo_escenario_service import seed_arbol_config_for_escenario
from .peso_service import _q2

NODO_COPY_FIELDS = (
    'nombre',
    'codigo',
    'descripcion',
    'peso',
    'orden_visual',
    'aplica',
    'justificacion_peso',
    'observaciones',
    'tipo_criterio',
    'familia_funciones',
    'parametros_funcion',
    'unidad',
    'tipo_dato',
    'valor_umbral',
    'valor_meta',
    'sentido_mejora',
    'metodo_evaluacion',
    'valor_minimo_utilidad',
    'valor_maximo_utilidad',
    'fuente_dato',
    'evidencia_requerida',
    'tipo_evidencia',
    'tipo_consecuencia',
    'modo_evaluacion',
    'consecuencia_descripciones',
)

OMOE_COPY_FIELDS = (
    'codigo',
    'descripcion_general',
    'version',
    'responsable',
    'estado',
    'rango_minimo',
    'rango_maximo',
    'observaciones',
    'rama_evaluacion',
    'tipo_criterio',
    'familia_funciones',
    'parametros_funcion',
    'unidad',
    'tipo_dato',
    'valor_umbral',
    'valor_meta',
    'sentido_mejora',
    'modo_evaluacion',
    'consecuencia_descripciones',
    'calculation_method',
    'calculation_config',
    'escenario_agregacion',
    'modo_valor_terminal',
    'enable_sensitivity_analysis',
)


def _default_nivel_nombre(orden: int) -> str:
    return f'Nivel {orden}'


def ensure_niveles_hasta(proyecto: Proyecto, rama: str, max_orden: int) -> None:
    """Garantiza que existan niveles 1..max_orden en la rama del proyecto destino."""
    if max_orden < 1:
        return
    if max_orden > MAX_NIVELES_ARBOL:
        raise ValidationError(
            f'El árbol origen requiere {max_orden} niveles; el máximo permitido es {MAX_NIVELES_ARBOL}.'
        )
    ensure_niveles_arbol(proyecto, rama)
    current = get_max_nivel_orden(proyecto.id, rama)
    for orden in range(current + 1, max_orden + 1):
        ProyectoNivelArbol.objects.create(
            proyecto=proyecto,
            rama_evaluacion=rama,
            orden=orden,
            codigo=f'{rama}_nivel_{orden}',
            nombre=_default_nivel_nombre(orden),
            activo=True,
        )


def listar_catalogo_dimensiones(
    *,
    proyecto_ids: list[int] | set[int],
    excluir_proyecto_id: int | None = None,
    incluir_proyecto_actual: bool = True,
) -> list[dict[str, Any]]:
    """Catálogo de dimensiones accesibles para importar (plantillas de árbol)."""
    qs = (
        Omoe.objects.filter(proyecto_id__in=proyecto_ids)
        .select_related('proyecto')
        .annotate(nodos_count=Count('nodos'))
        .order_by('proyecto__nombre', 'orden', 'nombre_modelo', 'id')
    )
    if excluir_proyecto_id is not None and not incluir_proyecto_actual:
        qs = qs.exclude(proyecto_id=excluir_proyecto_id)

    out: list[dict[str, Any]] = []
    for omoe in qs:
        out.append({
            'omoe_id': omoe.id,
            'nombre_modelo': omoe.nombre_modelo,
            'codigo': omoe.codigo or '',
            'rama_evaluacion': omoe.rama_evaluacion or RAMA_OMOE,
            'escenario_agregacion': getattr(omoe, 'escenario_agregacion', None),
            'modo_valor_terminal': getattr(omoe, 'modo_valor_terminal', None),
            'nodos_count': int(omoe.nodos_count or 0),
            'proyecto_id': omoe.proyecto_id,
            'proyecto_nombre': omoe.proyecto.nombre if omoe.proyecto_id else '',
            'es_proyecto_actual': (
                excluir_proyecto_id is not None and omoe.proyecto_id == excluir_proyecto_id
            ),
        })
    return out


def _clone_nodo(
    src: NodoArbol,
    *,
    dest_omoe: Omoe,
    parent: NodoArbol | None,
    tipo_nivel: ProyectoNivelArbol,
) -> NodoArbol:
    kwargs: dict[str, Any] = {
        'omoe': dest_omoe,
        'parent': parent,
        'tipo_nivel': tipo_nivel,
    }
    for field in NODO_COPY_FIELDS:
        val = getattr(src, field)
        if field == 'parametros_funcion' or field == 'consecuencia_descripciones':
            kwargs[field] = deepcopy(val) if val is not None else {}
        elif field == 'peso':
            kwargs[field] = _q2(val if val is not None else 0)
        else:
            kwargs[field] = val
    return NodoArbol.objects.create(**kwargs)


@transaction.atomic
def clonar_dimension_en_proyecto(
    fuente_omoe: Omoe,
    proyecto_destino: Proyecto,
    *,
    nombre_modelo: str | None = None,
) -> dict[str, Any]:
    """
    Copia la dimensión y su árbol de nodos (pesos + curvas) al proyecto destino.

    No copia escenarios fuente ni valores de evaluación: crea «Estandar» y semillas
    de configuración por nodo en ese escenario.
    """
    if fuente_omoe.proyecto_id == proyecto_destino.id:
        # Duplicar dentro del mismo proyecto también es válido (plantilla local).
        pass

    rama = (fuente_omoe.rama_evaluacion or RAMA_OMOE).strip() or RAMA_OMOE
    nodos_src = list(
        NodoArbol.objects.filter(omoe=fuente_omoe)
        .select_related('tipo_nivel')
        .order_by('orden_visual', 'id')
    )
    max_orden = 1
    for n in nodos_src:
        orden = int(getattr(n.tipo_nivel, 'orden', 1) or 1)
        if orden > max_orden:
            max_orden = orden
    ensure_niveles_hasta(proyecto_destino, rama, max_orden)

    nombre = (nombre_modelo or '').strip()
    if not nombre:
        sufijo = 'copia' if fuente_omoe.proyecto_id == proyecto_destino.id else 'importada'
        nombre = f'{fuente_omoe.nombre_modelo} ({sufijo})'

    dest_kwargs: dict[str, Any] = {
        'proyecto': proyecto_destino,
        'nombre_modelo': nombre,
        'orden': next_orden_omoe(proyecto_destino.id),
    }
    for field in OMOE_COPY_FIELDS:
        val = getattr(fuente_omoe, field, None)
        if field in ('parametros_funcion', 'consecuencia_descripciones', 'calculation_config'):
            dest_kwargs[field] = deepcopy(val) if val is not None else {}
        else:
            dest_kwargs[field] = val

    dest_omoe = Omoe.objects.create(**dest_kwargs)
    id_map: dict[int, NodoArbol] = {}

    # Padres antes que hijos (orden topológico por profundidad aproximada: roots first)
    pending = list(nodos_src)
    safety = 0
    while pending and safety < len(nodos_src) + 5:
        safety += 1
        progressed = False
        still: list[NodoArbol] = []
        for src in pending:
            if src.parent_id and src.parent_id not in id_map:
                still.append(src)
                continue
            orden = int(getattr(src.tipo_nivel, 'orden', 1) or 1)
            nivel = get_nivel_por_orden(proyecto_destino.id, orden, rama)
            if nivel is None:
                raise ValidationError(
                    f'No hay nivel {orden} en la rama «{rama}» del proyecto destino.'
                )
            parent = id_map.get(src.parent_id) if src.parent_id else None
            nuevo = _clone_nodo(src, dest_omoe=dest_omoe, parent=parent, tipo_nivel=nivel)
            id_map[src.id] = nuevo
            progressed = True
        if not progressed and still:
            raise ValidationError(
                'No se pudo reconstruir el árbol origen (referencia de padre inconsistente).'
            )
        pending = still

    esc = ensure_escenario_estandar(dest_omoe)
    seed_arbol_config_for_escenario(esc)

    return {
        'omoe_id': dest_omoe.id,
        'nombre_modelo': dest_omoe.nombre_modelo,
        'rama_evaluacion': dest_omoe.rama_evaluacion,
        'nodos_copiados': len(id_map),
        'fuente_omoe_id': fuente_omoe.id,
        'fuente_proyecto_id': fuente_omoe.proyecto_id,
        'escenario_estandar_id': esc.id,
    }


# ---------------------------------------------------------------------------
# Serialización / reconstrucción a JSON (backups e import/export de árbol)
# ---------------------------------------------------------------------------

FORMATO_ARBOL = 'mdcm-arbol'
FORMATO_ARBOL_VERSION = 1

_DECIMAL_NODE_FIELDS = frozenset({
    'peso',
    'valor_umbral',
    'valor_meta',
    'valor_minimo_utilidad',
    'valor_maximo_utilidad',
})
_JSON_NODE_FIELDS = frozenset({'parametros_funcion', 'consecuencia_descripciones'})
_DECIMAL_OMOE_FIELDS = frozenset({'rango_minimo', 'rango_maximo', 'valor_umbral', 'valor_meta'})
_JSON_OMOE_FIELDS = frozenset({
    'parametros_funcion', 'consecuencia_descripciones', 'calculation_config',
})


def _ser_value(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, Decimal):
        return str(val)
    if isinstance(val, (dict, list)):
        return deepcopy(val)
    return val


def _deser_decimal(val: Any) -> Decimal | None:
    if val is None or val == '':
        return None
    try:
        return Decimal(str(val))
    except (InvalidOperation, ValueError, TypeError):
        return None


def serialize_dimension(omoe: Omoe) -> dict[str, Any]:
    """Serializa una dimensión (Omoe + árbol de nodos) a un dict JSON re-importable."""
    nodos = list(
        NodoArbol.objects.filter(omoe=omoe)
        .select_related('tipo_nivel')
        .order_by('orden_visual', 'id')
    )

    omoe_data: dict[str, Any] = {'nombre_modelo': omoe.nombre_modelo}
    for field in OMOE_COPY_FIELDS:
        omoe_data[field] = _ser_value(getattr(omoe, field, None))

    nodos_data: list[dict[str, Any]] = []
    for n in nodos:
        entry: dict[str, Any] = {
            'id': n.id,
            'parent_id': n.parent_id,
            'nivel_orden': int(getattr(n.tipo_nivel, 'orden', 1) or 1),
        }
        for field in NODO_COPY_FIELDS:
            entry[field] = _ser_value(getattr(n, field))
        nodos_data.append(entry)

    return {
        'formato': FORMATO_ARBOL,
        'version': FORMATO_ARBOL_VERSION,
        'omoe': omoe_data,
        'nodos': nodos_data,
    }


def _node_kwargs_from_data(
    entry: dict[str, Any], *, dest_omoe: Omoe, parent: NodoArbol | None,
    tipo_nivel: ProyectoNivelArbol,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        'omoe': dest_omoe,
        'parent': parent,
        'tipo_nivel': tipo_nivel,
    }
    for field in NODO_COPY_FIELDS:
        val = entry.get(field)
        if field in _JSON_NODE_FIELDS:
            kwargs[field] = deepcopy(val) if isinstance(val, (dict, list)) else {}
        elif field == 'peso':
            kwargs[field] = _q2(_deser_decimal(val) or Decimal('0'))
        elif field in _DECIMAL_NODE_FIELDS:
            kwargs[field] = _deser_decimal(val)
        else:
            kwargs[field] = val if val is not None else ''
    return kwargs


@transaction.atomic
def rebuild_dimension_from_data(
    data: dict[str, Any],
    proyecto_destino: Proyecto,
    *,
    nombre_modelo: str | None = None,
) -> dict[str, Any]:
    """Reconstruye una dimensión y su árbol desde un dict serializado (backup / JSON).

    Igual que la clonación: no trae valores de evaluación; crea «Estandar».
    """
    if not isinstance(data, dict):
        raise ValidationError('El contenido del árbol no es válido (se esperaba un objeto JSON).')
    if data.get('formato') and data.get('formato') != FORMATO_ARBOL:
        raise ValidationError('El archivo no corresponde a un árbol MDCM.')

    omoe_data = data.get('omoe')
    nodos_data = data.get('nodos')
    if not isinstance(omoe_data, dict) or not isinstance(nodos_data, list):
        raise ValidationError('Estructura de árbol incompleta (faltan «omoe» o «nodos»).')

    rama = (omoe_data.get('rama_evaluacion') or RAMA_OMOE)
    rama = (rama.strip() if isinstance(rama, str) else RAMA_OMOE) or RAMA_OMOE

    max_orden = 1
    for entry in nodos_data:
        orden = int(entry.get('nivel_orden') or 1)
        if orden > max_orden:
            max_orden = orden
    ensure_niveles_hasta(proyecto_destino, rama, max_orden)

    nombre = (nombre_modelo or '').strip() or (
        f"{omoe_data.get('nombre_modelo') or 'Árbol'} (restaurada)"
    )

    dest_kwargs: dict[str, Any] = {
        'proyecto': proyecto_destino,
        'nombre_modelo': nombre,
        'orden': next_orden_omoe(proyecto_destino.id),
    }
    for field in OMOE_COPY_FIELDS:
        val = omoe_data.get(field)
        if field in _JSON_OMOE_FIELDS:
            dest_kwargs[field] = deepcopy(val) if isinstance(val, (dict, list)) else {}
        elif field in _DECIMAL_OMOE_FIELDS:
            dest_kwargs[field] = _deser_decimal(val)
        else:
            dest_kwargs[field] = val

    dest_omoe = Omoe.objects.create(**dest_kwargs)

    id_map: dict[Any, NodoArbol] = {}
    pending = list(nodos_data)
    safety = 0
    while pending and safety < len(nodos_data) + 5:
        safety += 1
        progressed = False
        still: list[dict[str, Any]] = []
        for entry in pending:
            parent_tmp = entry.get('parent_id')
            if parent_tmp is not None and parent_tmp not in id_map:
                still.append(entry)
                continue
            orden = int(entry.get('nivel_orden') or 1)
            nivel = get_nivel_por_orden(proyecto_destino.id, orden, rama)
            if nivel is None:
                raise ValidationError(
                    f'No hay nivel {orden} en la rama «{rama}» del proyecto destino.'
                )
            parent = id_map.get(parent_tmp) if parent_tmp is not None else None
            kwargs = _node_kwargs_from_data(
                entry, dest_omoe=dest_omoe, parent=parent, tipo_nivel=nivel,
            )
            nuevo = NodoArbol.objects.create(**kwargs)
            id_map[entry.get('id')] = nuevo
            progressed = True
        if not progressed and still:
            raise ValidationError(
                'No se pudo reconstruir el árbol (referencia de padre inconsistente).'
            )
        pending = still

    esc = ensure_escenario_estandar(dest_omoe)
    seed_arbol_config_for_escenario(esc)

    return {
        'omoe_id': dest_omoe.id,
        'nombre_modelo': dest_omoe.nombre_modelo,
        'rama_evaluacion': dest_omoe.rama_evaluacion,
        'nodos_copiados': len(id_map),
        'escenario_estandar_id': esc.id,
    }
