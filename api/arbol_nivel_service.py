"""Configuración flexible de niveles del árbol por proyecto y rama/tipo de dimensión."""
from __future__ import annotations

from django.core.exceptions import ValidationError

from .evaluacion_rama_choices import RAMA_OMOE
from .models import NodoArbol, Proyecto, ProyectoNivelArbol

DEFAULT_NIVELES = (
    ('nivel_1', 'Nivel 1'),
    ('mop_1', 'MOP 1'),
    ('mop_2', 'MOP 2'),
    ('mop_3', 'MOP 3'),
    ('dp_1', 'DP 1'),
    ('dp_2', 'DP 2'),
    ('dp_3', 'DP 3'),
)

DEFAULT_NIVEL_COUNT = len(DEFAULT_NIVELES)
MIN_NIVELES_ARBOL = 1
MAX_NIVELES_ARBOL = 9

# Compatibilidad con código que importaba el valor fijo anterior.
NUM_NIVELES_ARBOL = MAX_NIVELES_ARBOL


def _normalize_rama(rama: str | None) -> str:
    rama = (rama or '').strip().lower()
    if not rama or rama == 'auto':
        return RAMA_OMOE
    return rama


def _ramas_catalogo() -> list[str]:
    from .tipo_dimension_service import codigos_tipos_activos
    try:
        return codigos_tipos_activos()
    except Exception:
        from .evaluacion_rama_choices import RAMAS_DIMENSION
        return list(RAMAS_DIMENSION)


def _default_nombre(orden: int) -> str:
    if 1 <= orden <= len(DEFAULT_NIVELES):
        return DEFAULT_NIVELES[orden - 1][1]
    return f'Nivel {orden}'


def _default_codigo(rama: str, orden: int) -> str:
    if 1 <= orden <= len(DEFAULT_NIVELES):
        return DEFAULT_NIVELES[orden - 1][0]
    return f'{rama}_nivel_{orden}'


def ensure_niveles_arbol(
    proyecto: Proyecto,
    rama: str | None = None,
) -> list[ProyectoNivelArbol]:
    """Crea la plantilla inicial de niveles para una rama/tipo si aún no existen."""
    rama = _normalize_rama(rama)
    if ProyectoNivelArbol.objects.filter(proyecto=proyecto, rama_evaluacion=rama).exists():
        return list_niveles_arbol(proyecto, rama)

    niveles: list[ProyectoNivelArbol] = []
    for orden in range(1, DEFAULT_NIVEL_COUNT + 1):
        codigo, nombre = DEFAULT_NIVELES[orden - 1]
        nivel = ProyectoNivelArbol.objects.create(
            proyecto=proyecto,
            rama_evaluacion=rama,
            orden=orden,
            codigo=codigo,
            nombre=nombre,
            activo=True,
        )
        niveles.append(nivel)
    return niveles


def ensure_all_ramas_niveles(proyecto: Proyecto) -> None:
    for rama in _ramas_catalogo():
        ensure_niveles_arbol(proyecto, rama)
    # También cualquier rama ya usada en el proyecto (tipos antiguos/inactivos).
    usadas = (
        ProyectoNivelArbol.objects.filter(proyecto=proyecto)
        .values_list('rama_evaluacion', flat=True)
        .distinct()
    )
    for rama in usadas:
        ensure_niveles_arbol(proyecto, rama)


def list_niveles_arbol(proyecto: Proyecto, rama: str | None = None) -> list[ProyectoNivelArbol]:
    rama = _normalize_rama(rama)
    return list(
        proyecto.niveles_arbol.filter(rama_evaluacion=rama).order_by('orden', 'id')
    )


def list_niveles_arbol_por_ramas(proyecto: Proyecto) -> dict[str, list[ProyectoNivelArbol]]:
    ensure_all_ramas_niveles(proyecto)
    ramas = list(dict.fromkeys(
        list(_ramas_catalogo())
        + list(
            ProyectoNivelArbol.objects.filter(proyecto=proyecto)
            .values_list('rama_evaluacion', flat=True)
            .distinct()
        )
    ))
    return {rama: list_niveles_arbol(proyecto, rama) for rama in ramas}


def get_max_nivel_orden(proyecto_id: int, rama: str | None = None) -> int:
    """Mayor orden configurado (activo o no) para la rama."""
    rama = _normalize_rama(rama)
    niveles = ProyectoNivelArbol.objects.filter(
        proyecto_id=proyecto_id,
        rama_evaluacion=rama,
    ).order_by('-orden').values_list('orden', flat=True)[:1]
    return int(niveles[0]) if niveles else 0


def get_nivel_por_orden(
    proyecto_id: int,
    orden: int,
    rama: str | None = None,
) -> ProyectoNivelArbol | None:
    rama = _normalize_rama(rama)
    return ProyectoNivelArbol.objects.filter(
        proyecto_id=proyecto_id,
        rama_evaluacion=rama,
        orden=orden,
    ).first()


def get_nivel_por_codigo(
    proyecto_id: int,
    codigo: str,
    rama: str | None = None,
) -> ProyectoNivelArbol | None:
    rama = _normalize_rama(rama)
    return ProyectoNivelArbol.objects.filter(
        proyecto_id=proyecto_id,
        rama_evaluacion=rama,
        codigo=codigo,
    ).first()


def effective_rama_for_omoe(omoe) -> str:
    rama = (getattr(omoe, 'rama_evaluacion', None) or '').strip()
    if rama and rama != 'auto':
        return rama
    return RAMA_OMOE


def nivel_en_uso(nivel: ProyectoNivelArbol) -> bool:
    return NodoArbol.objects.filter(tipo_nivel_id=nivel.id).exists()


def save_niveles_arbol(
    proyecto: Proyecto,
    rama: str,
    items: list[dict],
) -> list[ProyectoNivelArbol]:
    """
    Guarda la configuración de niveles de una rama (1–9 niveles).
    items: [{id?, nombre, activo}, ...] en orden ascendente.
    """
    rama = _normalize_rama(rama)
    if not isinstance(items, list):
        raise ValidationError('Se esperaba una lista de niveles.')
    count = len(items)
    if count < MIN_NIVELES_ARBOL or count > MAX_NIVELES_ARBOL:
        raise ValidationError(
            f'Cada rama debe tener entre {MIN_NIVELES_ARBOL} y {MAX_NIVELES_ARBOL} niveles.'
        )

    existing = list(
        ProyectoNivelArbol.objects.filter(proyecto=proyecto, rama_evaluacion=rama)
        .order_by('orden', 'id')
    )
    by_id = {n.id: n for n in existing}

    if count < len(existing):
        survivors = {int(row['id']) for row in items if row.get('id')}
        for nivel in existing[count:]:
            if nivel.id not in survivors and nivel_en_uso(nivel):
                raise ValidationError(
                    f'No se puede quitar el nivel «{nivel.nombre}»: hay nodos del árbol que lo usan.'
                )

    kept_ids: set[int] = set()
    result: list[ProyectoNivelArbol] = []

    for idx, row in enumerate(items, start=1):
        nombre = (row.get('nombre') or '').strip() or _default_nombre(idx)
        activo = bool(row.get('activo', True))
        raw_id = row.get('id')
        nivel = None
        if raw_id is not None:
            nivel = by_id.get(int(raw_id))

        if nivel is None:
            nivel = ProyectoNivelArbol(
                proyecto=proyecto,
                rama_evaluacion=rama,
                codigo=_default_codigo(rama, idx),
            )
        elif idx <= len(DEFAULT_NIVELES) and nivel.codigo.startswith(f'{rama}_nivel_'):
            nivel.codigo = _default_codigo(rama, idx)

        nivel.orden = idx
        nivel.nombre = nombre
        nivel.activo = activo
        nivel.save()
        kept_ids.add(nivel.id)
        result.append(nivel)

    for nivel in existing:
        if nivel.id not in kept_ids:
            if nivel_en_uso(nivel):
                raise ValidationError(
                    f'No se puede eliminar el nivel «{nivel.nombre}»: hay nodos del árbol que lo usan.'
                )
            nivel.delete()

    return result


def next_orden_visual(siblings_qs) -> int:
    """Siguiente orden entre hermanos (1, 2, 3…)."""
    from django.db.models import Max

    current = siblings_qs.aggregate(m=Max('orden_visual'))['m']
    return int(current or 0) + 1


def next_orden_visual_nodo(
    *,
    omoe_id: int,
    parent_id: int | None,
    tipo_nivel_id: int | None,
) -> int:
    """Siguiente orden entre hermanos del mismo padre y mismo tipo de nivel."""
    from .models import NodoArbol

    qs = NodoArbol.objects.filter(omoe_id=omoe_id, parent_id=parent_id)
    if tipo_nivel_id is not None:
        qs = qs.filter(tipo_nivel_id=tipo_nivel_id)
    return next_orden_visual(qs)


def next_orden_omoe(proyecto_id: int) -> int:
    """Siguiente orden de dimensión dentro del proyecto (0, 1, 2…)."""
    from django.db.models import Max

    from .models import Omoe

    current = Omoe.objects.filter(proyecto_id=proyecto_id).aggregate(m=Max('orden'))['m']
    return int(current if current is not None else -1) + 1


def reordenar_nodos_arbol(nodos: list, ordered_ids: list[int]) -> None:
    """Reasigna orden_visual entre hermanos del mismo padre y mismo tipo de nivel."""
    from .models import NodoArbol

    if not ordered_ids:
        return
    by_id = {int(n.id): n for n in nodos}
    if set(by_id.keys()) != {int(i) for i in ordered_ids}:
        raise ValueError('La lista de ids no coincide con los nodos.')

    first = nodos[0]
    parent_id = first.parent_id
    omoe_id = first.omoe_id
    nivel_orden = first.tipo_nivel.orden if first.tipo_nivel_id else None

    for nodo in nodos:
        if nodo.parent_id != parent_id or nodo.omoe_id != omoe_id:
            raise ValueError('Todos los nodos deben compartir el mismo padre.')
        orden = nodo.tipo_nivel.orden if nodo.tipo_nivel_id else None
        if orden != nivel_orden:
            raise ValueError('Solo se puede reordenar entre nodos del mismo nivel.')

    for i, pk in enumerate(ordered_ids, start=1):
        NodoArbol.objects.filter(pk=int(pk)).update(orden_visual=i)
