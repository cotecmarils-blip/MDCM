"""Importación del caso demo oceanográfico (pyDecisionMaking) a NodoArbol + escenario."""
from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.db import transaction

from .arbol_nivel_service import (
    ensure_niveles_arbol,
    get_max_nivel_orden,
    get_nivel_por_orden,
    next_orden_visual_nodo,
)
from .models import Escenario, NodoArbol, NodoArbolEscenario, Omoe, Proyecto
from .nodo_escenario_service import seed_arbol_config_for_escenario

OCEAN_OMOE_CODIGO = 'OCEAN-PYDM'
OCEAN_ESCENARIO_NOMBRE = 'Evaluación demo'


def _collect_attributes(node: dict, acc: list[dict] | None = None) -> list[dict]:
    if acc is None:
        acc = []
    if node.get('type') == 'Attribute':
        acc.append(node)
    for child in node.get('children') or []:
        _collect_attributes(child, acc)
    return acc


def _pydecision_uf_to_MCDM(uf: dict | None) -> dict[str, Any]:
    if not uf:
        return {
            'familia_funciones': 'min_max',
            'parametros_funcion': {'L': 0, 'U': 100},
            'tipo_dato': 'numerico',
            'tipo_criterio': 'mas_es_mejor',
        }

    if uf.get('type') == 'DiscreteUtilityFunction':
        mapping = uf.get('mapping') or {}
        return {
            'familia_funciones': 'escalas_discretas',
            'parametros_funcion': {
                'categorias_utilidad': [
                    {'categoria': str(k), 'utilidad': float(v)}
                    for k, v in mapping.items()
                ],
                'categorias_opciones': [str(k) for k in mapping.keys()],
            },
            'tipo_dato': 'categorico',
            # 'escalas_discretas' solo es válida bajo 'preferencia_categorias'
            # (ver FAMILIA_FUNCIONES_POR_TIPO); con otro tipo la UI descarta las
            # categorías al normalizar el formulario.
            'tipo_criterio': 'preferencia_categorias',
        }

    threshold = uf.get('threshold', 0)
    goal = uf.get('goal', 1)
    increasing = uf.get('is_increasing', True)
    return {
        'familia_funciones': 'min_max',
        'parametros_funcion': {'L': threshold, 'U': goal},
        'tipo_dato': 'numerico',
        'tipo_criterio': 'mas_es_mejor' if increasing else 'menos_es_mejor',
    }


def sync_oceanographic_constantes_escenario(
    escenario: Escenario,
    hierarchy_path: str | Path,
) -> dict[str, int]:
    """
    Carga L/U y escalas discretas en NodoArbolEscenario (Definición de escenarios).
    Las hojas del árbol conservan familia y tipo; sin constantes en el nodo base.
    """
    path = Path(hierarchy_path)
    with path.open(encoding='utf-8') as f:
        hierarchy = json.load(f)

    attrs = _collect_attributes(hierarchy)
    if not escenario.omoe_id:
        raise ValueError('El escenario debe estar vinculado a una dimensión.')

    seed_arbol_config_for_escenario(escenario)

    by_name = {
        n.nombre: n
        for n in NodoArbol.objects.filter(omoe_id=escenario.omoe_id)
    }
    updated = 0
    for attr in attrs:
        nodo = by_name.get(attr['name'])
        if not nodo:
            continue

        MCDM = _pydecision_uf_to_MCDM(attr.get('utility_function'))
        nodo.familia_funciones = MCDM['familia_funciones']
        nodo.tipo_criterio = MCDM['tipo_criterio']
        nodo.tipo_dato = MCDM['tipo_dato']
        nodo.parametros_funcion = {}
        nodo.save(update_fields=[
            'familia_funciones',
            'tipo_criterio',
            'tipo_dato',
            'parametros_funcion',
            'fecha_actualizacion',
        ])

        cfg, _ = NodoArbolEscenario.objects.get_or_create(
            escenario=escenario,
            nodo_arbol=nodo,
            defaults={
                'peso': nodo.peso,
                'aplica': True,
                'tipo_criterio': MCDM['tipo_criterio'],
                'familia_funciones': MCDM['familia_funciones'],
                'parametros_funcion': MCDM['parametros_funcion'],
            },
        )
        cfg.tipo_criterio = MCDM['tipo_criterio']
        cfg.familia_funciones = MCDM['familia_funciones']
        cfg.parametros_funcion = MCDM['parametros_funcion']
        cfg.aplica = True
        cfg.save(update_fields=[
            'tipo_criterio',
            'familia_funciones',
            'parametros_funcion',
            'aplica',
            'fecha_actualizacion',
        ])
        updated += 1

    return {'constantes_escenario': updated, 'atributos': len(attrs)}


def ensure_oceanographic_eval_nodes(
    proyecto: Proyecto,
    hierarchy_path: str | Path,
    *,
    replace: bool = False,
) -> dict[str, Any]:
    """
    Crea dimensión demo con hojas nombradas como en oceanographic_alternatives.json
    (atributos del JSON de jerarquía pyDecisionMaking).
    """
    path = Path(hierarchy_path)
    with path.open(encoding='utf-8') as f:
        hierarchy = json.load(f)

    attrs = _collect_attributes(hierarchy)
    if not attrs:
        raise ValueError('No se encontraron atributos en la jerarquía oceanográfica.')

    ensure_niveles_arbol(proyecto, 'omoe')
    nivel_raiz = get_nivel_por_orden(proyecto.id, 1, 'omoe')
    max_orden = get_max_nivel_orden(proyecto.id, 'omoe') or 7
    nivel_hoja = get_nivel_por_orden(proyecto.id, max_orden, 'omoe')
    if not nivel_raiz or not nivel_hoja:
        raise ValueError('El proyecto no tiene niveles de árbol configurados.')

    with transaction.atomic():
        omoe, _ = Omoe.objects.get_or_create(
            proyecto=proyecto,
            codigo=OCEAN_OMOE_CODIGO,
            defaults={
                'nombre_modelo': 'Caso demo oceanográfico (pyDM)',
                'descripcion_general': 'Atributos importados de oceanographic_hierarchy.json',
                'orden': 99,
                'rama_evaluacion': 'omoe',
            },
        )

        escenario, _ = Escenario.objects.get_or_create(
            omoe=omoe,
            nombre=OCEAN_ESCENARIO_NOMBRE,
            defaults={
                'proyecto': proyecto,
                'descripcion': 'Escenario único para atributos con misión en el nombre',
                'peso': Decimal('1'),
                'orden': 1,
                'rama_evaluacion': 'omoe',
            },
        )

        existing = NodoArbol.objects.filter(omoe=omoe)
        if replace and existing.exists():
            existing.delete()

        root = NodoArbol.objects.filter(omoe=omoe, parent__isnull=True).first()
        if root is None:
            root = NodoArbol.objects.create(
                omoe=omoe,
                parent=None,
                tipo_nivel=nivel_raiz,
                nombre=hierarchy.get('name') or 'Oceanographic Vessel Selection',
                codigo=OCEAN_OMOE_CODIGO,
                peso=Decimal('100'),
                orden_visual=1,
                aplica=True,
            )

        existing_names = set(
            NodoArbol.objects.filter(omoe=omoe, parent=root).values_list('nombre', flat=True)
        )
        created = 0
        for attr in attrs:
            name = attr['name']
            if name in existing_names:
                continue
            MCDM = _pydecision_uf_to_MCDM(attr.get('utility_function'))
            NodoArbol.objects.create(
                omoe=omoe,
                parent=root,
                tipo_nivel=nivel_hoja,
                nombre=name,
                codigo='',
                peso=Decimal(str(round(float(attr.get('local_weight', 1)) * 100, 2))),
                orden_visual=next_orden_visual_nodo(
                    omoe_id=omoe.id,
                    parent_id=root.id,
                    tipo_nivel_id=nivel_hoja.id,
                ),
                aplica=True,
                familia_funciones=MCDM['familia_funciones'],
                parametros_funcion={},
                tipo_dato=MCDM['tipo_dato'],
                tipo_criterio=MCDM['tipo_criterio'],
            )
            created += 1

        const_stats = sync_oceanographic_constantes_escenario(escenario, path)

    return {
        'omoe_id': omoe.id,
        'escenario_id': escenario.id,
        'atributos': len(attrs),
        'hojas_creadas': created,
        'constantes_escenario': const_stats['constantes_escenario'],
    }
