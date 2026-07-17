"""
Exportación JSON (jerarquía + alternativas) y evaluación OMOE/OMOC/OMOR.
Formato compatible con salidas/oceanographic_*.json
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from .models import (
    Alternativa,
    DpCriterio,
    GrupoAfinidad,
    Mision,
    MopCriterio,
    Omoe,
    Proyecto,
    VopResultado,
)

from .evaluacion_rama_choices import RAMA_AUTO


def _to_float(value) -> float | None:
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _first_present(*values):
    """Primer valor "presente" (no None ni ''); a diferencia de `a or b`,
    conserva ceros válidos (0 y 0.0 se consideran presentes)."""
    for value in values:
        if value is not None and value != '':
            return value
    return None


def _normalize_weights(items, weight_attr='peso') -> dict[int, float]:
    """Convierte pesos (0-100 o fracción) a local_weight entre hermanos."""
    raw = {}
    for item in items:
        w = _to_float(getattr(item, weight_attr, None)) or 0.0
        raw[item.id] = max(w, 0.0)
    total = sum(raw.values())
    if total <= 0:
        n = len(items) or 1
        return {item.id: 1.0 / n for item in items}
    if total > 1.5:
        return {k: v / total for k, v in raw.items()}
    return {k: v / total for k, v in raw.items()}


COST_KEYWORDS = ('costo', 'cost', 'capex', 'adquisicion', 'acquisition')
RISK_KEYWORDS = ('riesgo', 'risk', 'incertidumbre', 'probabilidad')


def _classify_branch(
    grupo: GrupoAfinidad | None,
    mop: MopCriterio | None,
    omoe_rama: str | None = None,
) -> str:
    if omoe_rama and omoe_rama not in (None, '', RAMA_AUTO):
        return omoe_rama
    if grupo and getattr(grupo, 'rama_evaluacion', None) not in (None, '', RAMA_AUTO):
        return grupo.rama_evaluacion
    texts = []
    if grupo:
        texts.append((grupo.nombre_grupo or '').lower())
        texts.append((grupo.codigo or '').lower())
    if mop:
        texts.append((mop.nombre_mop or '').lower())
        texts.append((mop.tipo_mop or '').lower())
        texts.append((mop.unidad_medida or '').lower())
    blob = ' '.join(texts)
    if any(k in blob for k in COST_KEYWORDS) or (mop and mop.tipo_mop == 'menos_es_mejor'):
        return 'omoc'
    if any(k in blob for k in RISK_KEYWORDS):
        return 'omor'
    return 'omoe'


def build_utility_function(dp: DpCriterio, mop: MopCriterio) -> dict[str, Any]:
    """Construye la función de utilidad para pyDecisionMaking a partir del nodo MOP/DP.

    La familia elegida en la UI («Familias de funciones aplicadas») es
    ``familia_funciones``; su documentación (nombre visible, parámetros, fórmula)
    está en ``api/familia_funciones_doc.FAMILIA_FUNCIONES_DOC``.

    Mapeo resumido (etiqueta UI → clase):

    - **Escalas discretas** / **Tablas de equivalencia** → ``DiscreteUtilityFunction``
    - **Exponencial creciente** / **Exponencial decreciente** → ``ExponentialUtilityFunction``
    - **Meta saturada** / **Función saturada** → ``LogarithmicUtilityFunction``
    - **Logística decreciente** → ``SigmoidalUtilityFunction``
    - **Razón relativa** / **Razón inversa** → ``RatioUtilityFunction`` (x/U, L/x)
    - **Triangular** → ``TriangularUtilityFunction`` (pico en M)
    - **Trapezoidal** → ``TrapezoidalUtilityFunction`` (meseta M1–M2)
    - **Distancia a meta** / **Distancia al ideal** → ``DistanceUtilityFunction``
    - **Umbral de veto** → ``VetoUtilityFunction`` (0 si x ≥ V)
    - **Min-max** / **Min-max decreciente** (y legacy **Umbral creciente/decreciente**,
      **Funciones por tramos**) → ``LinearUtilityFunction`` (normalización min–max L–U)

    Parámetros habituales: L, U (límites), k (pendiente), T/S (meta/saturación),
    x0 (inflexión logística), V (veto), M/M1/M2 (óptimo/meseta), I/dmax (ideal).
    """
    familia = (dp.familia_funciones or mop.familia_funciones or '').strip()
    params = dp.parametros_funcion or mop.parametros_funcion or {}
    tipo_mop = mop.tipo_mop or ''

    if familia == 'escalas_discretas':
        # UI: «Escalas discretas»
        mapping = {}
        for entry in params.get('categorias_utilidad') or []:
            cat = entry.get('categoria')
            util = entry.get('utilidad')
            if cat is not None and util is not None:
                mapping[str(cat)] = float(util)
        if mapping:
            return {'type': 'DiscreteUtilityFunction', 'mapping': mapping}

    if dp.tipo_dato in ('categorico', 'texto', 'booleano', 'cualitativo'):
        mapping = params.get('mapping')
        if isinstance(mapping, dict) and mapping:
            return {
                'type': 'DiscreteUtilityFunction',
                'mapping': {str(k): float(v) for k, v in mapping.items()},
            }

    # Nota: no usar `a or b` para elegir L/U, porque un límite válido de 0
    # (p. ej. goal=0 en una función decreciente) es "falsy" y se descartaría.
    threshold = _to_float(_first_present(params.get('L'), dp.valor_umbral, mop.valor_umbral))
    goal = _to_float(_first_present(params.get('U'), dp.valor_meta, mop.valor_meta))
    if threshold is None:
        threshold = 0.0
    if goal is None:
        goal = threshold + 1.0

    decreasing = (
        tipo_mop == 'menos_es_mejor'
        or 'decreciente' in familia
        or 'inversa' in familia
        or (dp.sentido_mejora or mop.sentido_mejora or '').lower() in ('minimizar', 'menor')
    )
    base = {
        'threshold': threshold,
        'goal': goal,
        'threshold_utility': 0.0,
        'goal_utility': 1.0,
        'is_increasing': not decreasing,
    }

    if familia in ('exponencial_creciente', 'exponencial_decreciente'):
        # UI: «Exponencial creciente» / «Exponencial decreciente»
        k = _to_float(params.get('k')) or 2.0
        return {'type': 'ExponentialUtilityFunction', 'shape_parameter': k, **base}

    if familia in ('meta_saturada', 'funcion_saturada'):
        # UI: «Meta saturada» / «Función saturada»
        k = _to_float(params.get('k') or params.get('S') or params.get('T')) or 10.0
        return {'type': 'LogarithmicUtilityFunction', 'shape_parameter': k, **base}

    if familia == 'logistica_decreciente':
        # UI: «Logística decreciente»
        k = _to_float(params.get('k')) or 10.0
        x0 = _to_float(params.get('x0'))
        midpoint = 0.5
        if x0 is not None and goal != threshold:
            midpoint = max(0.0, min(1.0, (x0 - threshold) / (goal - threshold)))
        return {
            'type': 'SigmoidalUtilityFunction',
            'shape_parameter': k,
            'midpoint': midpoint,
            **base,
        }

    if familia in ('razon_relativa', 'razon_inversa'):
        # UI: «Razón relativa» (beneficio, x/U) / «Razón inversa» (costo, L/x).
        # Normalización por razón: distinta de min–max (no resta el límite inferior).
        return {'type': 'RatioUtilityFunction', **base}

    if familia == 'triangular':
        # UI: «Triangular» — óptimo en el punto M.
        peak = _to_float(params.get('M'))
        if peak is None:
            peak = (threshold + goal) / 2.0
        return {'type': 'TriangularUtilityFunction', 'peak': peak, **base}

    if familia == 'trapezoidal':
        # UI: «Trapezoidal» — meseta óptima entre M1 y M2.
        span = (goal - threshold) or 1.0
        m1 = _to_float(params.get('M1'))
        m2 = _to_float(params.get('M2'))
        if m1 is None:
            m1 = threshold + span / 3.0
        if m2 is None:
            m2 = threshold + 2.0 * span / 3.0
        return {
            'type': 'TrapezoidalUtilityFunction',
            'plateau_start': m1,
            'plateau_end': m2,
            **base,
        }

    if familia in ('distancia_meta', 'distancia_ideal'):
        # UI: «Distancia a meta» (T, R) / «Distancia al ideal» (I, dmax).
        target = _to_float(_first_present(params.get('T'), params.get('I')))
        radius = _to_float(_first_present(params.get('R'), params.get('dmax')))
        if target is None:
            target = (threshold + goal) / 2.0
        if radius is None or radius == 0:
            radius = abs(goal - threshold) / 2.0 or 1.0
        dist_base = dict(base)
        dist_base['threshold'] = target - radius
        dist_base['goal'] = target + radius
        return {
            'type': 'DistanceUtilityFunction',
            'target': target,
            'radius': radius,
            **dist_base,
        }

    if familia == 'umbral_veto':
        # UI: «Umbral de veto» — u decrece hasta 0 y veto absoluto en V.
        veto = _to_float(params.get('V'))
        if veto is None:
            veto = goal
        veto_base = dict(base)
        veto_base['is_increasing'] = False
        veto_base['goal'] = veto
        return {'type': 'VetoUtilityFunction', 'veto': veto, **veto_base}

    if familia == 'tablas_equivalencia':
        # UI: «Tablas de equivalencia» — estado → utilidad (mapa discreto).
        mapping = {}
        for entry in params.get('equivalencias') or []:
            est = entry.get('estado')
            util = entry.get('utilidad')
            if est is not None and util is not None and str(est).strip() != '':
                try:
                    mapping[str(est)] = float(util)
                except (TypeError, ValueError):
                    continue
        if mapping:
            return {'type': 'DiscreteUtilityFunction', 'mapping': mapping}

    # Fallback lineal (normalización min–max L–U): Min-max, Min-max decreciente,
    # Umbral creciente/decreciente (legacy) y Funciones por tramos (sin evaluador).
    return {'type': 'LinearUtilityFunction', **base}


def _dp_export_name(dp: DpCriterio, mision: Mision | None) -> str:
    base = dp.nombre_dp or dp.codigo or f'DP-{dp.id}'
    if mision and mision.codigo:
        return f'{base} ({mision.codigo})'
    if mision:
        idx = list(mision.omoe.misiones.order_by('orden_visual', 'id')).index(mision) + 1
        return f'{base} (M{idx})'
    return base


def _build_dp_node(dp: DpCriterio, mop: MopCriterio, mision: Mision, weight: float, omoe_rama: str | None) -> dict:
    return {
        'name': _dp_export_name(dp, mision),
        'local_weight': round(weight, 4),
        'type': 'Attribute',
        'children': [],
        'description': dp.descripcion_tecnica or '',
        'utility_function': build_utility_function(dp, mop),
        '_meta': {
            'dp_id': dp.id,
            'branch': _classify_branch(mop.grupo_afinidad, mop, omoe_rama),
            'codigo': dp.codigo,
        },
    }


def _build_mop_node(mop: MopCriterio, mision: Mision, omoe_rama: str | None) -> dict:
    dps = list(mop.dps.order_by('orden_visual', 'id'))
    wmap = _normalize_weights(dps)
    return {
        'name': mop.nombre_mop,
        'local_weight': 0.0,
        'type': 'Criterion',
        'children': [
            _build_dp_node(dp, mop, mision, wmap.get(dp.id, 0.0), omoe_rama) for dp in dps
        ],
        'description': mop.descripcion_indicador or '',
        '_meta': {'mop_id': mop.id, 'branch': _classify_branch(mop.grupo_afinidad, mop, omoe_rama)},
    }


def _build_grupo_node(grupo: GrupoAfinidad, mision: Mision, omoe_rama: str | None) -> dict:
    mops = list(grupo.mops.order_by('orden_visual', 'id'))
    wmap = _normalize_weights(mops)
    children = []
    for mop in mops:
        node = _build_mop_node(mop, mision, omoe_rama)
        node['local_weight'] = round(wmap.get(mop.id, 0.0), 4)
        children.append(node)
    return {
        'name': grupo.nombre_grupo,
        'local_weight': 0.0,
        'type': 'Criterion',
        'children': children,
        'description': grupo.descripcion_funcional or '',
        '_meta': {
            'grupo_id': grupo.id,
            'branch': _classify_branch(grupo, None, omoe_rama),
        },
    }


def _build_mision_node(mision: Mision, omoe_rama: str | None) -> dict:
    grupos = list(mision.grupos.order_by('orden_visual', 'id'))
    wmap = _normalize_weights(grupos)
    children = []
    for grupo in grupos:
        node = _build_grupo_node(grupo, mision, omoe_rama)
        node['local_weight'] = round(wmap.get(grupo.id, 0.0), 4)
        children.append(node)
    return {
        'name': mision.nombre_mision,
        'local_weight': 0.0,
        'type': 'Criterion',
        'children': children,
        'description': mision.descripcion_operacional or '',
        '_meta': {'mision_id': mision.id, 'branch': omoe_rama or 'omoe'},
    }


def _grupos_for_omoe(omoe: Omoe):
    direct = list(omoe.grupos.filter(aplica=True).order_by('orden_visual', 'id'))
    if direct:
        return direct
    grupos = []
    for mision in omoe.misiones.filter(aplica=True).order_by('orden_visual', 'id'):
        grupos.extend(mision.grupos.filter(aplica=True).order_by('orden_visual', 'id'))
    return grupos


def build_hierarchy_export(omoe: Omoe, *, strip_meta: bool = True) -> dict:
    omoe_rama = getattr(omoe, 'rama_evaluacion', None) or 'omoe'
    grupos = _grupos_for_omoe(omoe)
    wmap = _normalize_weights(grupos)
    children = []
    for grupo in grupos:
        node = _build_grupo_node(grupo, None, omoe_rama)
        node['local_weight'] = round(wmap.get(grupo.id, 0.0), 4)
        children.append(node)

    root = {
        'name': omoe.nombre_modelo or omoe.codigo or 'OMOE',
        'local_weight': 1.0,
        'type': 'Criterion',
        'children': children,
        'description': omoe.descripcion_general or '',
    }
    if strip_meta:
        return _strip_internal_meta(root)
    return root


def _strip_internal_meta(node: dict) -> dict:
    clean = {k: v for k, v in node.items() if not k.startswith('_')}
    if 'children' in clean:
        clean['children'] = [_strip_internal_meta(c) for c in clean['children']]
    return clean


def _collect_attribute_nodes(node: dict, acc: list | None = None) -> list[dict]:
    if acc is None:
        acc = []
    if node.get('type') == 'Attribute':
        acc.append(node)
    for child in node.get('children') or []:
        _collect_attribute_nodes(child, acc)
    return acc


def _vop_lookup(proyecto_id: int) -> dict[tuple[int, int], VopResultado]:
    rows = VopResultado.objects.filter(
        alternativa__proyecto_id=proyecto_id
    ).select_related('dp', 'alternativa')
    return {(v.alternativa_id, v.dp_id): v for v in rows}


def build_alternatives_export(proyecto: Proyecto, omoe: Omoe) -> dict[str, dict[str, Any]]:
    from .evaluacion_service import build_evaluacion_schema, export_alternativa_valores

    schema = build_evaluacion_schema(proyecto)
    if schema['columnas']:
        result = {}
        for alt in Alternativa.objects.filter(proyecto=proyecto).order_by('id'):
            row = export_alternativa_valores(alt.id)
            if alt.costo is not None and alt.costo_unidad:
                row.setdefault('Acquisition Cost', float(alt.costo))
            result[alt.nombre] = row
        if result:
            return result

    hierarchy = build_hierarchy_export(omoe, strip_meta=False)
    attrs = _collect_attribute_nodes(hierarchy)
    dp_ids_by_name = {}
    for attr in attrs:
        meta = attr.get('_meta') or {}
        dp_id = meta.get('dp_id')
        if dp_id:
            dp_ids_by_name[attr['name']] = dp_id

    vops = _vop_lookup(proyecto.id)
    result = {}
    alternativas = Alternativa.objects.filter(proyecto=proyecto).order_by('id')
    for alt in alternativas:
        row = {}
        for name, dp_id in dp_ids_by_name.items():
            vop = vops.get((alt.id, dp_id))
            if vop is None:
                continue
            if vop.valor_real_ofertado is not None:
                val = vop.valor_real_ofertado
                row[name] = float(val) if '.' in str(val) else int(val) if val == int(val) else float(val)
            elif vop.evidencia:
                row[name] = vop.evidencia
        if alt.costo is not None and alt.costo_unidad:
            row.setdefault('Acquisition Cost', float(alt.costo))
        result[alt.nombre] = row
    return result


def _utility_from_function(raw_value: Any, utility_function: dict) -> float:
    from .pydecision_bridge import evaluate_utility

    return evaluate_utility(raw_value, utility_function)


def _evaluate_node(node: dict, values: dict[str, Any]) -> tuple[float, dict]:
    """Retorna (utilidad agregada 0-1, desglose por rama)."""
    branch_scores = {'omoe': [], 'omoc': [], 'omor': []}

    if node.get('type') == 'Attribute':
        util = _utility_from_function(
            values.get(node['name']),
            node.get('utility_function', {}),
        )
        branch = (node.get('_meta') or {}).get('branch', 'omoe')
        if branch in branch_scores:
            branch_scores[branch].append((util, node.get('local_weight', 1.0)))
        return util, branch_scores

    child_results = []
    for child in node.get('children') or []:
        score, child_branches = _evaluate_node(child, values)
        w = child.get('local_weight', 0.0) or 0.0
        child_results.append((score, w))
        for b, items in child_branches.items():
            branch_scores[b].extend(items)

    total_w = sum(w for _, w in child_results)
    if total_w <= 0:
        agg = sum(s for s, _ in child_results) / max(len(child_results), 1)
    else:
        agg = sum(s * w for s, w in child_results) / total_w
    return agg, branch_scores


def _weighted_mean(items: list[tuple[float, float]]) -> float:
    if not items:
        return 0.0
    total_w = sum(w for _, w in items)
    if total_w <= 0:
        return sum(u for u, _ in items) / len(items)
    return sum(u * w for u, w in items) / total_w


def _resolve_omoc_raw(alt: Alternativa, values: dict[str, Any], hierarchy: dict) -> float | None:
    attrs = _collect_attribute_nodes(hierarchy)
    for attr in attrs:
        meta = attr.get('_meta') or {}
        if meta.get('branch') == 'omoc':
            v = values.get(attr['name'])
            if v is not None:
                try:
                    return float(v)
                except (TypeError, ValueError):
                    pass
    if alt.costo is not None:
        return float(alt.costo)
    for key, val in values.items():
        kl = key.lower()
        if 'capex' in kl or 'acquisition cost' in kl or 'costo de adquisicion' in kl:
            try:
                return float(val)
            except (TypeError, ValueError):
                pass
    return None


def evaluate_proyecto(proyecto: Proyecto, omoe: Omoe | None = None) -> dict[str, Any]:
    omoe = omoe or Omoe.objects.filter(proyecto=proyecto).order_by('orden', 'id').first()
    if omoe is None:
        return {
            'omoe_id': None,
            'alternativas': [],
            'mensaje': 'No hay modelo OMOE definido para este proyecto.',
        }

    hierarchy = build_hierarchy_export(omoe, strip_meta=False)
    hierarchy_clean = build_hierarchy_export(omoe, strip_meta=True)
    alt_export = build_alternatives_export(proyecto, omoe)
    alternativas = list(Alternativa.objects.filter(proyecto=proyecto).order_by('id'))

    from .pydecision_bridge import evaluate_overall_scores
    from .rama_evaluacion_service import RAMA_OMOC, RAMA_OMOE, RAMA_OMOR, build_ramas_status

    overall_by_name = evaluate_overall_scores(hierarchy_clean, alt_export)
    ramas, advertencias = build_ramas_status(proyecto, hierarchy, alt_export)

    puntos = []
    labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for idx, alt in enumerate(alternativas):
        values = alt_export.get(alt.nombre, {})
        _, branches = _evaluate_node(hierarchy, values)
        overall = overall_by_name.get(alt.nombre, 0.0)

        omoe_score = None
        if ramas[RAMA_OMOE]['configurada']:
            omoe_score = _weighted_mean(branches[RAMA_OMOE]) or overall

        omor_score = None
        if ramas[RAMA_OMOR]['configurada']:
            omor_score = _weighted_mean(branches[RAMA_OMOR])

        omoc_value = None
        if ramas[RAMA_OMOC]['configurada']:
            omoc_value = _resolve_omoc_raw(alt, values, hierarchy)

        puntos.append({
            'id': alt.id,
            'nombre': alt.nombre,
            'apodo': alt.apodo or '',
            'label': labels[idx] if idx < len(labels) else str(idx + 1),
            'omoe': round(omoe_score, 4) if omoe_score is not None else None,
            'omoc': round(omoc_value, 4) if omoc_value is not None else None,
            'omor': round(omor_score, 4) if omor_score is not None else None,
            'overall': round(overall, 4),
        })

    puntos.sort(key=lambda p: p['overall'], reverse=True)
    for rank, punto in enumerate(puntos, start=1):
        punto['ranking'] = rank

    return {
        'omoe_id': omoe.id,
        'omoe_nombre': omoe.nombre_modelo,
        'proyecto_id': proyecto.id,
        'motor': 'pyDecisionMaking',
        'ramas': ramas,
        'advertencias': advertencias,
        'alternativas': puntos,
    }


def get_omoe_for_export(proyecto: Proyecto, omoe_id: int | None = None) -> Omoe | None:
    if omoe_id:
        return Omoe.objects.filter(proyecto=proyecto, pk=omoe_id).first()
    return Omoe.objects.filter(proyecto=proyecto).order_by('orden', 'id').first()
