"""Carga completa del caso oceanográfico (pyDecisionMaking) como un proyecto nuevo.

A diferencia de ``oceanographic_import.ensure_oceanographic_eval_nodes`` (que aplana
los atributos bajo una única dimensión demo), este módulo reconstruye TODO el
contenido de los .json:

* ``oceanographic_hierarchy.json`` → un proyecto con 3 dimensiones
  (Effectiveness→OMOE, Cost→OMOC, Risk→OMOR) y el árbol completo de criterios
  respetando niveles, pesos (normalizados a 100 % por grupo de hermanos) y
  funciones de utilidad de cada hoja.
* ``oceanographic_alternatives.json`` → las alternativas (Ship_*) con todos sus
  valores mapeados a las hojas del árbol.
"""
from __future__ import annotations

import json
import re
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction

from .arbol_nivel_service import ensure_niveles_arbol, get_nivel_por_orden
from .escenario_agregacion_choices import (
    ESCENARIO_AGREG_COMPENSATORIO,
    ESCENARIO_AGREG_MINIMO_MEJOR,
)
from .evaluacion_rama_choices import RAMA_OMOC, RAMA_OMOE, RAMA_OMOR
from .evaluacion_service import import_alternativas_from_json
from .models import (
    Escenario,
    NodoArbol,
    Omoe,
    Proyecto,
    ProyectoMembership,
    ProyectoNivelArbol,
)
from .modo_valor_terminal_choices import MODO_VALOR_BRUTO, MODO_VALOR_UTILIDAD
from .nodo_escenario_service import seed_arbol_config_for_escenario
from .oceanographic_import import _pydecision_uf_to_MCDM
from .peso_service import _q2

# Nombre de rama del primer nivel del JSON → rama de dimensión MCDM.
BRANCH_RAMA = {
    'Effectiveness': RAMA_OMOE,
    'Cost': RAMA_OMOC,
    'Risk': RAMA_OMOR,
}
BRANCH_CODIGO = {
    'Effectiveness': 'OCEAN-OMOE',
    'Cost': 'OCEAN-OMOC',
    'Risk': 'OCEAN-OMOR',
}

# Etiquetas de nivel por rama (según la profundidad usada por cada rama).
# En OMOE las misiones (M1..M5) se modelan como ESCENARIOS, no como un nivel del
# árbol; por eso el árbol solo tiene Grupo de afinidad → Atributo.
LEVEL_NAMES = {
    RAMA_OMOE: ['Grupo de afinidad', 'Atributo'],
    RAMA_OMOC: ['Atributo de costo'],
    RAMA_OMOR: ['Categoría de riesgo', 'Atributo'],
}

PESO_TOTAL = Decimal('100')

MISSION_SUFFIX = re.compile(r'\s*\(M(\d+)\)\s*$')


def _strip_mission(name: str) -> str:
    """Quita el sufijo de misión « (M1)» del nombre de un criterio."""
    return MISSION_SUFFIX.sub('', name or '').strip()


def _mission_number(node: dict) -> int | None:
    """Número de misión detectado en el nodo o en cualquiera de sus descendientes."""
    m = MISSION_SUFFIX.search(node.get('name') or '')
    if m:
        return int(m.group(1))
    for child in node.get('children') or []:
        found = _mission_number(child)
        if found:
            return found
    return None


def _structure_sig(node: dict) -> tuple:
    """Firma canónica del subárbol (nombre base sin misión, peso y utilidad)."""
    kids = node.get('children') or []
    uf = node.get('utility_function')
    return (
        _strip_mission(node['name']),
        round(float(node.get('local_weight') or 0), 6),
        json.dumps(uf, sort_keys=True) if not kids else None,
        tuple(_structure_sig(c) for c in kids),
    )


def _detect_missions(branch: dict) -> list[tuple[int, dict]] | None:
    """Detecta si los hijos de una rama son la misma estructura repetida por misión.

    Devuelve [(nº_misión, hijo_json), ...] ordenado por misión si cada hijo tiene un
    número de misión distinto y una estructura de criterios idéntica; si no, None.
    """
    children = branch.get('children') or []
    if len(children) < 2:
        return None
    missions: list[tuple[int, dict]] = []
    sigs: list[tuple] = []
    for child in children:
        num = _mission_number(child)
        if num is None:
            return None
        missions.append((num, child))
        sigs.append(tuple(_structure_sig(c) for c in (child.get('children') or [])))
    if len({num for num, _ in missions}) != len(missions):
        return None
    if any(sig != sigs[0] for sig in sigs):
        return None
    missions.sort(key=lambda item: item[0])
    return missions


def _delete_proyectos_por_nombre(nombre: str) -> int:
    """Elimina proyectos con ese nombre respetando el FK PROTECT de tipo_nivel.

    ``NodoArbol.tipo_nivel`` protege a ``ProyectoNivelArbol``; hay que borrar los
    nodos (y su config de escenario en cascada) antes que los niveles y el proyecto.
    """
    proyectos = list(Proyecto.objects.filter(nombre=nombre))
    for proyecto in proyectos:
        NodoArbol.objects.filter(omoe__proyecto=proyecto).delete()
        ProyectoNivelArbol.objects.filter(proyecto=proyecto).delete()
        proyecto.delete()
    return len(proyectos)


def _canonical_rol(user) -> str:
    """Rol más frecuente del usuario en otros proyectos; JEFE si no tiene ninguno."""
    rol = (
        ProyectoMembership.objects.filter(usuario=user, activo=True)
        .values_list('rol', flat=True)
        .first()
    )
    return rol or ProyectoMembership.ROL_JEFE


def grant_memberships(
    proyecto: Proyecto,
    usuarios: list[str] | None = None,
    rol: str | None = None,
) -> list[dict[str, str]]:
    """Da acceso al proyecto (el frontend solo lista proyectos donde hay membresía).

    * ``usuarios``: lista de usernames; si es None se toman todos los usuarios
      activos que NO son superusuarios (los admin ya ven todo).
    * ``rol``: rol a asignar; si es None se replica el rol habitual del usuario.
    """
    User = get_user_model()
    if usuarios:
        qs = User.objects.filter(username__in=usuarios, is_active=True)
    else:
        qs = User.objects.filter(is_active=True, is_superuser=False)

    concedidos: list[dict[str, str]] = []
    for user in qs:
        rol_final = rol or _canonical_rol(user)
        _, creado = ProyectoMembership.objects.get_or_create(
            proyecto=proyecto,
            usuario=user,
            defaults={'rol': rol_final, 'activo': True},
        )
        concedidos.append({
            'usuario': user.get_username(),
            'rol': rol_final,
            'nuevo': creado,
        })
    return concedidos


def _normalizar_pesos(children: list[dict]) -> list[Decimal]:
    """Reparte 100 % entre hermanos proporcional a ``local_weight`` (suma exacta 100)."""
    n = len(children)
    if n == 0:
        return []
    weights = [max(float(c.get('local_weight') or 0), 0.0) for c in children]
    total = sum(weights)
    if total <= 0:
        each = _q2(PESO_TOTAL / n)
        pesos = [each] * (n - 1)
        pesos.append(PESO_TOTAL - each * (n - 1))
        return pesos
    pesos = [_q2(Decimal(str(w / total)) * PESO_TOTAL) for w in weights]
    pesos[-1] = PESO_TOTAL - sum(pesos[:-1], Decimal('0'))
    return pesos


def _rename_niveles(proyecto: Proyecto, rama: str) -> None:
    nombres = LEVEL_NAMES.get(rama) or []
    for idx, nombre in enumerate(nombres, start=1):
        ProyectoNivelArbol.objects.filter(
            proyecto=proyecto, rama_evaluacion=rama, orden=idx,
        ).update(nombre=nombre)


def _build_level(
    omoe: Omoe,
    parent: NodoArbol | None,
    children: list[dict],
    proyecto_id: int,
    rama: str,
    orden_nivel: int,
    stats: dict[str, int],
) -> None:
    nivel = get_nivel_por_orden(proyecto_id, orden_nivel, rama)
    if nivel is None:
        raise ValueError(
            f'La rama «{rama}» no tiene nivel de árbol en el orden {orden_nivel}. '
            f'Aumenta el número de niveles del proyecto.'
        )
    pesos = _normalizar_pesos(children)
    for idx, (child, peso) in enumerate(zip(children, pesos), start=1):
        grandchildren = child.get('children') or []
        es_hoja = (child.get('type') == 'Attribute') or not grandchildren

        kwargs: dict[str, Any] = dict(
            omoe=omoe,
            parent=parent,
            tipo_nivel=nivel,
            nombre=_strip_mission(child['name']),
            codigo='',
            peso=peso,
            orden_visual=idx,
            aplica=True,
        )
        if es_hoja:
            MCDM = _pydecision_uf_to_MCDM(child.get('utility_function'))
            kwargs.update(
                familia_funciones=MCDM['familia_funciones'],
                tipo_criterio=MCDM['tipo_criterio'],
                tipo_dato=MCDM['tipo_dato'],
                parametros_funcion=MCDM['parametros_funcion'],
            )

        nodo = NodoArbol.objects.create(**kwargs)
        stats['nodos'] += 1
        if es_hoja:
            stats['hojas'] += 1
        else:
            _build_level(
                omoe, nodo, grandchildren, proyecto_id, rama, orden_nivel + 1, stats,
            )


def import_oceanographic_project(
    nombre_proyecto: str,
    hierarchy_path: str | Path,
    alternatives_path: str | Path,
    *,
    reemplazar: bool = False,
    asignar_membresias: bool = True,
    usuarios: list[str] | None = None,
    rol: str | None = None,
) -> dict[str, Any]:
    """Crea un proyecto nuevo con todo el contenido de los .json oceanográficos."""
    hierarchy_path = Path(hierarchy_path)
    alternatives_path = Path(alternatives_path)

    with hierarchy_path.open(encoding='utf-8') as f:
        hierarchy = json.load(f)
    with alternatives_path.open(encoding='utf-8') as f:
        alternatives = json.load(f)

    branches = hierarchy.get('children') or []
    if not branches:
        raise ValueError('La jerarquía no contiene ramas de primer nivel (children).')
    if not isinstance(alternatives, dict) or not alternatives:
        raise ValueError('El JSON de alternativas debe ser un objeto no vacío.')

    with transaction.atomic():
        if reemplazar:
            _delete_proyectos_por_nombre(nombre_proyecto)

        proyecto = Proyecto.objects.create(
            nombre=nombre_proyecto,
            descripcion=(
                f'Importado de {hierarchy_path.name} y {alternatives_path.name} '
                f'(caso oceanográfico pyDecisionMaking).'
            ),
        )

        dimensiones: list[dict[str, Any]] = []
        for orden, branch in enumerate(branches):
            nombre = branch['name']
            rama = BRANCH_RAMA.get(nombre, RAMA_OMOE)
            ensure_niveles_arbol(proyecto, rama)
            _rename_niveles(proyecto, rama)

            # OMOC (costos): valor bruto + mínimo-mejor (sin pesos entre escenarios).
            omoe = Omoe.objects.create(
                proyecto=proyecto,
                nombre_modelo=nombre,
                codigo=BRANCH_CODIGO.get(nombre, ''),
                descripcion_general=(
                    f'Peso relativo original en la jerarquía: '
                    f'{float(branch.get("local_weight") or 0):.2f}'
                ),
                rama_evaluacion=rama,
                orden=orden,
                modo_valor_terminal=(
                    MODO_VALOR_BRUTO if rama == RAMA_OMOC else MODO_VALOR_UTILIDAD
                ),
                escenario_agregacion=(
                    ESCENARIO_AGREG_MINIMO_MEJOR
                    if rama == RAMA_OMOC
                    else ESCENARIO_AGREG_COMPENSATORIO
                ),
            )

            stats = {'nodos': 0, 'hojas': 0}
            misiones = _detect_missions(branch)
            escenarios_info: list[dict[str, Any]] = []

            if misiones:
                # Las misiones (M1..M5) son ESCENARIOS: el árbol se construye una sola
                # vez a partir de la primera misión (sin sufijo) y cada misión es un
                # escenario con su peso.
                plantilla = misiones[0][1].get('children') or []
                _build_level(omoe, None, plantilla, proyecto.id, rama, 1, stats)

                areas = [child for _, child in misiones]
                pesos_esc = _normalizar_pesos(areas)
                for orden_esc, ((num, child), peso_esc) in enumerate(
                    zip(misiones, pesos_esc), start=1,
                ):
                    escenario = Escenario.objects.create(
                        proyecto=proyecto,
                        omoe=omoe,
                        nombre=f'M{num} — {child["name"]}'[:255],
                        descripcion=f'Misión {num}: {child["name"]}',
                        peso=peso_esc,
                        rama_evaluacion=rama,
                        orden=num,
                    )
                    configs = seed_arbol_config_for_escenario(escenario)
                    escenarios_info.append({
                        'nombre': escenario.nombre,
                        'peso': float(peso_esc),
                        'configs': configs,
                    })
            else:
                _build_level(
                    omoe, None, branch.get('children') or [],
                    proyecto.id, rama, 1, stats,
                )
                escenario = Escenario.objects.create(
                    proyecto=proyecto,
                    omoe=omoe,
                    nombre='Escenario base',
                    descripcion='Escenario único con los pesos de la jerarquía original.',
                    peso=PESO_TOTAL,
                    rama_evaluacion=rama,
                    orden=1,
                )
                configs = seed_arbol_config_for_escenario(escenario)
                escenarios_info.append({
                    'nombre': escenario.nombre,
                    'peso': float(PESO_TOTAL),
                    'configs': configs,
                })

            dimensiones.append({
                'dimension': nombre,
                'rama': rama,
                'omoe_id': omoe.id,
                'peso_relativo': float(branch.get('local_weight') or 0),
                'nodos': stats['nodos'],
                'hojas': stats['hojas'],
                'escenarios': escenarios_info,
            })

        alt_result = import_alternativas_from_json(
            proyecto, alternatives, update_existing=True,
        )

        membresias: list[dict[str, str]] = []
        if asignar_membresias:
            membresias = grant_memberships(proyecto, usuarios=usuarios, rol=rol)

    return {
        'proyecto_id': proyecto.id,
        'proyecto_nombre': proyecto.nombre,
        'dimensiones': dimensiones,
        'alternativas': alt_result,
        'membresias': membresias,
    }
