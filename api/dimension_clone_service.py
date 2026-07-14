"""Clonar / importar dimensión (árbol micro) entre proyectos."""
from __future__ import annotations

from copy import deepcopy
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
