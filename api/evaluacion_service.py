"""Nodos terminales del árbol OMOE y matriz de evaluación por alternativa / escenario."""

from __future__ import annotations

import re
from typing import Any

from .evaluacion_rama_choices import RAMA_OMOE
from .mcdm_utils import _classify_branch, _grupos_for_omoe
from .riesgo_nodo_utils import (
    DEFAULT_NIVELES,
    MODO_INCERTIDUMBRE,
    clean_consecuencia_descripciones,
    nivel_key,
)
from .models import (
    DpCriterio,
    Escenario,
    GrupoAfinidad,
    MopCriterio,
    NivelImpacto,
    NivelProbabilidad,
    NodoArbol,
    Omoe,
    Proyecto,
    ValorEvaluacion,
)
from django.db.models import Count, Q


def build_risk_ctx(proyecto: Proyecto) -> dict:
    """Opciones de probabilidad (tabla del proyecto) y niveles de consecuencia."""
    probs = list(
        NivelProbabilidad.objects.filter(proyecto=proyecto).order_by('orden', 'valor')
    )
    imps = list(
        NivelImpacto.objects.filter(proyecto=proyecto).order_by('orden', 'valor')
    )
    prob_options = [
        {
            'value': nivel_key(p.valor),
            'label': (
                f'{p.descripcion} ({nivel_key(p.valor)})'
                if p.descripcion else nivel_key(p.valor)
            ),
        }
        for p in probs
    ]
    niveles = [nivel_key(i.valor) for i in imps] or list(DEFAULT_NIVELES)
    return {'prob_options': prob_options, 'niveles': niveles}


def _cons_options(descripciones, niveles: list[str]) -> list[dict]:
    desc = clean_consecuencia_descripciones(descripciones)
    options = []
    for lvl in niveles:
        text = desc.get(lvl, '')
        options.append({
            'value': lvl,
            'label': f'{text} ({lvl})' if text else f'({lvl})',
        })
    return options


def _riesgo_terminal_extra(node_obj, risk_ctx: dict | None) -> dict:
    """input_kind/prob_options/cons_options para un nodo en modo incertidumbre."""
    descripciones = getattr(node_obj, 'consecuencia_descripciones', None) or {}
    niveles = (risk_ctx or {}).get('niveles') or list(DEFAULT_NIVELES)
    return {
        'input_kind': 'riesgo',
        'select_options': [],
        'prob_options': (risk_ctx or {}).get('prob_options') or [],
        'cons_options': _cons_options(descripciones, niveles),
    }


NIVEL_GRUPO = 'grupo_afinidad'
NIVEL_MOP = 'mop'
NIVEL_DP = 'dp'


def _nombre_nodo(obj, attr: str, fallback: str = '') -> str:
    return getattr(obj, attr, None) or fallback or f'#{obj.pk}'


def _escenario_label(escenario: Escenario, index: int) -> str:
    return f'M{index}'


def _input_kind(node: dict) -> str:
    familia = (node.get('familia_funciones') or '').strip()
    tipo = (node.get('tipo_dato') or node.get('tipo_mop') or '').lower()
    params = node.get('parametros_funcion') or {}
    if familia == 'escalas_discretas' or tipo in ('categorico', 'texto', 'booleano', 'cualitativo'):
        opts = params.get('categorias_opciones') or params.get('estados_opciones') or []
        if opts:
            return 'select'
    if tipo == 'numerico' or familia and familia not in ('escalas_discretas', 'tablas_equivalencia'):
        return 'number'
    return 'text'


def _select_options(node: dict) -> list[str]:
    params = node.get('parametros_funcion') or {}
    opts = params.get('categorias_opciones') or params.get('estados_opciones') or []
    if isinstance(opts, list):
        return [str(o) for o in opts if o is not None and str(o).strip()]
    return []


def _terminal_from_grupo(grupo: GrupoAfinidad, omoe: Omoe, omoe_rama: str | None) -> dict | None:
    mops = list(grupo.mops.filter(aplica=True).order_by('orden_visual', 'id'))
    if mops:
        return None
    branch = _classify_branch(grupo, None, omoe_rama)
    return {
        'nivel': NIVEL_GRUPO,
        'nodo_id': grupo.id,
        'omoe_id': omoe.id,
        'nombre': _nombre_nodo(grupo, 'nombre_grupo'),
        'codigo': grupo.codigo or '',
        'branch': branch,
        'unidad': '',
        'tipo_dato': grupo.tipo_mop or '',
        'tipo_mop': grupo.tipo_mop or '',
        'familia_funciones': grupo.familia_funciones or '',
        'parametros_funcion': grupo.parametros_funcion or {},
        'constantes': grupo.parametros_funcion or {},
        'input_kind': _input_kind({
            'familia_funciones': grupo.familia_funciones,
            'tipo_mop': grupo.tipo_mop,
            'parametros_funcion': grupo.parametros_funcion,
        }),
        'select_options': _select_options({
            'familia_funciones': grupo.familia_funciones,
            'parametros_funcion': grupo.parametros_funcion,
        }),
    }


def _terminal_from_mop(mop: MopCriterio, omoe: Omoe, omoe_rama: str | None) -> dict | None:
    dps = list(mop.dps.order_by('orden_visual', 'id'))
    if dps:
        return None
    branch = _classify_branch(mop.grupo_afinidad, mop, omoe_rama)
    return {
        'nivel': NIVEL_MOP,
        'nodo_id': mop.id,
        'omoe_id': omoe.id,
        'nombre': _nombre_nodo(mop, 'nombre_mop'),
        'codigo': mop.codigo or '',
        'branch': branch,
        'unidad': mop.unidad_medida or '',
        'tipo_dato': mop.tipo_mop or '',
        'tipo_mop': mop.tipo_mop or '',
        'familia_funciones': mop.familia_funciones or '',
        'parametros_funcion': mop.parametros_funcion or {},
        'constantes': mop.parametros_funcion or {},
        'input_kind': _input_kind({
            'familia_funciones': mop.familia_funciones,
            'tipo_mop': mop.tipo_mop,
            'parametros_funcion': mop.parametros_funcion,
        }),
        'select_options': _select_options({
            'familia_funciones': mop.familia_funciones,
            'parametros_funcion': mop.parametros_funcion,
        }),
    }


def _terminal_from_dp(dp: DpCriterio, mop: MopCriterio, omoe: Omoe, omoe_rama: str | None) -> dict:
    branch = _classify_branch(mop.grupo_afinidad, mop, omoe_rama)
    return {
        'nivel': NIVEL_DP,
        'nodo_id': dp.id,
        'omoe_id': omoe.id,
        'nombre': _nombre_nodo(dp, 'nombre_dp'),
        'codigo': dp.codigo or '',
        'branch': branch,
        'unidad': dp.unidad or mop.unidad_medida or '',
        'tipo_dato': dp.tipo_dato or '',
        'tipo_mop': mop.tipo_mop or '',
        'familia_funciones': dp.familia_funciones or mop.familia_funciones or '',
        'parametros_funcion': dp.parametros_funcion or mop.parametros_funcion or {},
        'constantes': dp.parametros_funcion or mop.parametros_funcion or {},
        'input_kind': _input_kind({
            'familia_funciones': dp.familia_funciones or mop.familia_funciones,
            'tipo_dato': dp.tipo_dato,
            'parametros_funcion': dp.parametros_funcion or mop.parametros_funcion,
        }),
        'select_options': _select_options({
            'familia_funciones': dp.familia_funciones or mop.familia_funciones,
            'parametros_funcion': dp.parametros_funcion or mop.parametros_funcion,
        }),
    }


NIVEL_NODO_ARBOL = 'nodo_arbol'
NIVEL_OMOE = 'omoe'


def _terminal_from_omoe(omoe: Omoe, omoe_rama: str | None, risk_ctx: dict | None = None) -> dict:
    branch = omoe_rama or RAMA_OMOE
    params = omoe.parametros_funcion or {}
    modo = getattr(omoe, 'modo_evaluacion', '') or 'certeza'
    base = {
        'nivel': NIVEL_OMOE,
        'nodo_id': omoe.id,
        'omoe_id': omoe.id,
        'nombre': _nombre_nodo(omoe, 'nombre_modelo'),
        'codigo': omoe.codigo or '',
        'branch': branch,
        'unidad': omoe.unidad or '',
        'tipo_dato': omoe.tipo_dato or '',
        'tipo_mop': omoe.tipo_criterio or '',
        'familia_funciones': omoe.familia_funciones or '',
        'parametros_funcion': params,
        'constantes': params,
        'modo_evaluacion': modo,
        'consecuencia_descripciones': omoe.consecuencia_descripciones or {},
        'input_kind': _input_kind({
            'familia_funciones': omoe.familia_funciones,
            'tipo_mop': omoe.tipo_criterio,
            'tipo_dato': omoe.tipo_dato,
            'parametros_funcion': params,
        }),
        'select_options': _select_options({
            'familia_funciones': omoe.familia_funciones,
            'parametros_funcion': params,
        }),
    }
    if modo == MODO_INCERTIDUMBRE:
        base.update(_riesgo_terminal_extra(omoe, risk_ctx))
    return base


def _terminal_from_nodo_arbol(nodo: NodoArbol, omoe_rama: str | None, risk_ctx: dict | None = None) -> dict:
    branch = omoe_rama or RAMA_OMOE
    params = nodo.parametros_funcion or {}
    modo = getattr(nodo, 'modo_evaluacion', '') or 'certeza'
    base = {
        'nivel': NIVEL_NODO_ARBOL,
        'nodo_id': nodo.id,
        'omoe_id': nodo.omoe_id,
        'nombre': nodo.nombre,
        'codigo': nodo.codigo or '',
        'branch': branch,
        'unidad': nodo.unidad or '',
        'tipo_dato': nodo.tipo_dato or '',
        'tipo_mop': nodo.tipo_criterio or '',
        'familia_funciones': nodo.familia_funciones or '',
        'parametros_funcion': params,
        'constantes': params,
        'modo_evaluacion': modo,
        'consecuencia_descripciones': nodo.consecuencia_descripciones or {},
        'input_kind': _input_kind({
            'familia_funciones': nodo.familia_funciones,
            'tipo_mop': nodo.tipo_criterio,
            'tipo_dato': nodo.tipo_dato,
            'parametros_funcion': params,
        }),
        'select_options': _select_options({
            'familia_funciones': nodo.familia_funciones,
            'parametros_funcion': params,
        }),
    }
    if modo == MODO_INCERTIDUMBRE:
        base.update(_riesgo_terminal_extra(nodo, risk_ctx))
    return base


def collect_terminal_nodes_for_omoe(omoe: Omoe, risk_ctx: dict | None = None) -> list[dict]:
    """Nodos hoja del árbol bajo una dimensión (estructura; activación por escenario en columnas)."""
    omoe_rama = getattr(omoe, 'rama_evaluacion', None) or RAMA_OMOE
    has_arbol = NodoArbol.objects.filter(omoe=omoe).exists()
    if not has_arbol:
        return [_terminal_from_omoe(omoe, omoe_rama, risk_ctx)]

    leaves = (
        NodoArbol.objects.filter(omoe=omoe)
        .annotate(num_hijos=Count('hijos'))
        .filter(num_hijos=0)
        .order_by('orden_visual', 'id')
    )
    if leaves.exists():
        return [_terminal_from_nodo_arbol(n, omoe_rama, risk_ctx) for n in leaves]

    terminales: list[dict] = []
    seen: set[tuple[str, int]] = set()

    for grupo in _grupos_for_omoe(omoe):
        if not grupo.aplica:
            continue
        t = _terminal_from_grupo(grupo, omoe, omoe_rama)
        if t:
            key = (t['nivel'], t['nodo_id'])
            if key not in seen:
                seen.add(key)
                terminales.append(t)
            continue
        for mop in grupo.mops.filter(aplica=True).order_by('orden_visual', 'id'):
            t = _terminal_from_mop(mop, omoe, omoe_rama)
            if t:
                key = (t['nivel'], t['nodo_id'])
                if key not in seen:
                    seen.add(key)
                    terminales.append(t)
                continue
            for dp in mop.dps.order_by('orden_visual', 'id'):
                t = _terminal_from_dp(dp, mop, omoe, omoe_rama)
                key = (t['nivel'], t['nodo_id'])
                if key not in seen:
                    seen.add(key)
                    terminales.append(t)

    return terminales


def collect_terminal_nodes(proyecto: Proyecto, risk_ctx: dict | None = None) -> list[dict]:
    terminales: list[dict] = []
    if risk_ctx is None:
        risk_ctx = build_risk_ctx(proyecto)
    omoes = Omoe.objects.filter(proyecto=proyecto).prefetch_related(
        'nodos__hijos__hijos__hijos',
        'grupos__mops__dps',
        'misiones__grupos__mops__dps',
    ).order_by('orden', 'id')
    for omoe in omoes:
        terminales.extend(collect_terminal_nodes_for_omoe(omoe, risk_ctx))
    return terminales


def valor_key(nivel: str, nodo_id: int, escenario_id: int | None) -> str:
    esc = escenario_id if escenario_id is not None else 'global'
    return f'{nivel}:{nodo_id}:{esc}'


def parse_valor_key(key: str) -> tuple[str, int, int | None]:
    nivel, nodo_id, esc = key.split(':', 2)
    escenario_id = None if esc == 'global' else int(esc)
    return nivel, int(nodo_id), escenario_id


CONSTANTE_KEYS = ('L', 'U', 'k', 'T', 'S', 'M', 'M1', 'M2', 'V', 'x0', 'R', 'I', 'dmax')


def _format_constantes(params: dict | None) -> str:
    if not params:
        return ''
    parts = []
    for key in CONSTANTE_KEYS:
        val = params.get(key)
        if val is not None and str(val).strip() != '':
            parts.append(f'{key}={val}')
    return ', '.join(parts)


def _merge_terminal_escenario_config(terminal: dict, config_map: dict[int, dict] | None) -> dict:
    """Combina terminal base con configuración del escenario (peso, constantes, activo)."""
    merged = dict(terminal)
    # El modo (certeza/incertidumbre) y las descripciones de consecuencia son del
    # nodo (aplican a todos los escenarios); no se sobreescriben por escenario.
    if terminal.get('nivel') != NIVEL_NODO_ARBOL or not config_map:
        merged['peso_nodo'] = None
        merged['constantes'] = dict(terminal.get('parametros_funcion') or {})
        merged['constantes_display'] = _format_constantes(merged['constantes'])
        merged['aplica'] = True
        return merged

    if terminal.get('modo_evaluacion') == MODO_INCERTIDUMBRE:
        cfg = config_map.get(terminal['nodo_id']) or {}
        merged['aplica'] = bool(cfg.get('aplica', True))
        merged['peso_nodo'] = float(cfg['peso']) if cfg.get('peso') is not None else None
        merged['constantes'] = {}
        merged['constantes_display'] = ''
        return merged

    cfg = config_map.get(terminal['nodo_id']) or {}
    merged['aplica'] = bool(cfg.get('aplica', True))
    params = dict(terminal.get('parametros_funcion') or {})
    if cfg.get('parametros_funcion'):
        params = dict(cfg['parametros_funcion'])
    if cfg.get('familia_funciones'):
        merged['familia_funciones'] = cfg['familia_funciones']
    if cfg.get('tipo_criterio'):
        merged['tipo_mop'] = cfg['tipo_criterio']
    merged['parametros_funcion'] = params
    merged['constantes'] = params
    merged['constantes_display'] = _format_constantes(params)
    merged['peso_nodo'] = float(cfg['peso']) if cfg.get('peso') is not None else None
    merged['input_kind'] = _input_kind({
        'familia_funciones': merged.get('familia_funciones'),
        'tipo_mop': merged.get('tipo_mop'),
        'tipo_dato': merged.get('tipo_dato'),
        'parametros_funcion': params,
    })
    merged['select_options'] = _select_options({
        'familia_funciones': merged.get('familia_funciones'),
        'parametros_funcion': params,
    })
    return merged


def _escenario_payload(escenario: Escenario, index: int) -> dict[str, Any]:
    return {
        'id': escenario.id,
        'nombre': escenario.nombre,
        'rama_evaluacion': escenario.rama_evaluacion,
        'peso': float(escenario.peso),
        'orden': escenario.orden,
        'label': _escenario_label(escenario, index),
    }


def escenarios_for_dimension(omoe: Omoe) -> list[Escenario]:
    """Escenarios vinculados exclusivamente a esta dimensión (Omoe)."""
    return list(
        Escenario.objects.filter(omoe=omoe).order_by('orden', 'nombre', 'id')
    )


def escenario_tiene_valores_en_terminales(
    escenario: Escenario,
    terminales: list[dict],
    valores: dict[str, str],
) -> bool:
    """True si hay al menos un valor x no vacío en terminales para ese escenario."""
    for t in terminales:
        nodo_id = t.get('nodo_id')
        if nodo_id is None:
            continue
        nivel = t.get('nivel') or 'nodo_arbol'
        raw = valores.get(valor_key(nivel, nodo_id, escenario.id))
        if str(raw or '').strip():
            return True
    return False


def filter_escenarios_con_valores(
    escenarios: list[Escenario],
    terminales: list[dict],
    valores: dict[str, str],
) -> list[Escenario]:
    """
    Excluye escenarios sin datos de evaluación.
    Si ninguno tiene datos, devuelve la lista original (evita quedarse sin escenarios).
    """
    if not escenarios or not terminales:
        return list(escenarios)
    con_datos = [
        esc for esc in escenarios
        if escenario_tiene_valores_en_terminales(esc, terminales, valores)
    ]
    return con_datos if con_datos else list(escenarios)


def apply_valores_fallback_escenarios(
    omoe: Omoe,
    escenario: Escenario,
    terminales: list[dict],
    valores: dict[str, str],
) -> tuple[dict[str, str], bool]:
    """
    Completa celdas vacías del escenario objetivo con valores de hermanos
    (p. ej. Estandar vacío + datos en «Escenario base» del import oceanográfico).
    """
    sibling_ids = list(
        Escenario.objects.filter(omoe=omoe)
        .exclude(pk=escenario.pk)
        .order_by('orden', 'id')
        .values_list('id', flat=True)
    )
    if not sibling_ids:
        return valores, False

    patched = dict(valores)
    used_fallback = False
    for t in terminales:
        nivel = t.get('nivel') or 'nodo_arbol'
        nodo_id = t.get('nodo_id')
        if nodo_id is None:
            continue
        key_target = valor_key(nivel, nodo_id, escenario.id)
        if str(patched.get(key_target) or '').strip():
            continue
        for sid in sibling_ids:
            key_src = valor_key(nivel, nodo_id, sid)
            raw = patched.get(key_src)
            if str(raw or '').strip():
                patched[key_target] = raw
                used_fallback = True
                break
    return patched, used_fallback


def _terminal_aplica_en_escenario(
    terminal: dict,
    config_map: dict[int, dict] | None,
    parent_by_id: dict[int, int | None] | None = None,
) -> bool:
    """False si el nodo o algún ancestro está desactivado en el escenario."""
    if terminal.get('nivel') != NIVEL_NODO_ARBOL:
        return True
    if not config_map:
        return True
    nodo_id = terminal.get('nodo_id')
    if nodo_id is None:
        return True
    visited: set[int] = set()
    current: int | None = int(nodo_id)
    while current is not None and current not in visited:
        visited.add(current)
        cfg = config_map.get(current) or {}
        if not bool(cfg.get('aplica', True)):
            return False
        if not parent_by_id:
            break
        current = parent_by_id.get(current)
    return True


def _columnas_for_dimension(terminales: list[dict], escenarios: list[Escenario]) -> list[dict]:
    from .nodo_escenario_service import load_config_map, seed_arbol_config_for_escenario

    parent_by_id: dict[int, int | None] = {}
    omoe_ids = {t.get('omoe_id') for t in terminales if t.get('omoe_id')}
    if omoe_ids:
        parent_by_id = {
            n['id']: n['parent_id']
            for n in NodoArbol.objects.filter(omoe_id__in=omoe_ids).values('id', 'parent_id')
        }

    columnas = []
    for idx, esc in enumerate(escenarios, start=1):
        seed_arbol_config_for_escenario(esc)
        config_map = load_config_map(esc.id)
        for t in terminales:
            if not _terminal_aplica_en_escenario(t, config_map, parent_by_id):
                continue
            merged = _merge_terminal_escenario_config(t, config_map)
            if not merged.get('aplica', True):
                continue
            columnas.append({
                'key': valor_key(merged['nivel'], merged['nodo_id'], esc.id),
                'nivel': merged['nivel'],
                'nodo_id': merged['nodo_id'],
                'omoe_id': merged['omoe_id'],
                'escenario_id': esc.id,
                'label': merged['nombre'],
                'terminal_nombre': merged['nombre'],
                'escenario_nombre': esc.nombre,
                'escenario_label': _escenario_label(esc, idx),
                'peso_nodo': merged.get('peso_nodo'),
                'constantes_display': merged.get('constantes_display') or '',
                'input_kind': merged.get('input_kind'),
                'select_options': merged.get('select_options') or [],
                'unidad': merged.get('unidad') or '',
                'constantes': merged.get('constantes') or {},
                'familia_funciones': merged.get('familia_funciones') or '',
                'tipo_criterio': merged.get('tipo_mop') or '',
                'tipo_dato': merged.get('tipo_dato') or '',
                'branch': merged.get('branch'),
                'modo_evaluacion': merged.get('modo_evaluacion') or 'certeza',
                'prob_options': merged.get('prob_options') or [],
                'cons_options': merged.get('cons_options') or [],
                'consecuencia_descripciones': merged.get('consecuencia_descripciones') or {},
            })
    return columnas


def build_evaluacion_schema(proyecto: Proyecto) -> dict[str, Any]:
    risk_ctx = build_risk_ctx(proyecto)
    omoes = list(
        Omoe.objects.filter(proyecto=proyecto)
        .prefetch_related('grupos__mops__dps', 'misiones__grupos__mops__dps', 'escenarios')
        .order_by('orden', 'id')
    )

    dimensiones = []
    all_columnas: list[dict] = []

    for omoe in omoes:
        terminales = collect_terminal_nodes_for_omoe(omoe, risk_ctx)
        escenarios = escenarios_for_dimension(omoe)
        esc_payload = [
            _escenario_payload(e, idx) for idx, e in enumerate(escenarios, start=1)
        ]
        columnas = _columnas_for_dimension(terminales, escenarios)
        all_columnas.extend(columnas)

        dimensiones.append({
            'omoe_id': omoe.id,
            'omoe_nombre': omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.pk}',
            'rama_evaluacion': getattr(omoe, 'rama_evaluacion', None) or RAMA_OMOE,
            'escenario_agregacion': getattr(omoe, 'escenario_agregacion', None) or 'compensatorio',
            'modo_valor_terminal': getattr(omoe, 'modo_valor_terminal', None) or 'utilidad',
            'escenarios': esc_payload,
            'terminales': terminales,
            'columnas': columnas,
        })

    return {
        'dimensiones': dimensiones,
        'columnas': all_columnas,
        'terminales': collect_terminal_nodes(proyecto, risk_ctx),
        'escenarios': [
            _escenario_payload(e, idx)
            for idx, e in enumerate(
                Escenario.objects.filter(proyecto=proyecto).order_by('orden', 'nombre', 'id'),
                start=1,
            )
        ],
    }


def load_valores_map(alternativa_id: int) -> dict[str, str]:
    rows = ValorEvaluacion.objects.filter(alternativa_id=alternativa_id)
    result = {}
    for row in rows:
        if row.nodo_arbol_id:
            key = valor_key(NIVEL_NODO_ARBOL, row.nodo_arbol_id, row.escenario_id)
        else:
            key = valor_key(row.nivel, row.nodo_id, row.escenario_id)
        result[key] = row.valor or ''
    return result


def save_valores_bulk(alternativa_id: int, valores: dict[str, str]) -> dict[str, str]:
    from .models import Alternativa

    alt = Alternativa.objects.get(pk=alternativa_id)
    proyecto = alt.proyecto
    schema = build_evaluacion_schema(proyecto)
    valid_keys = {c['key'] for c in schema['columnas']}

    to_save = []
    for key, raw in valores.items():
        if key not in valid_keys:
            continue
        nivel, nodo_id, escenario_id = parse_valor_key(key)
        to_save.append((nivel, nodo_id, escenario_id, '' if raw is None else str(raw)))

    ValorEvaluacion.objects.filter(alternativa_id=alternativa_id).delete()
    for nivel, nodo_id, escenario_id, valor in to_save:
        if valor == '':
            continue
        create_kwargs = {
            'alternativa_id': alternativa_id,
            'escenario_id': escenario_id,
            'nivel': nivel,
            'nodo_id': nodo_id,
            'valor': valor,
        }
        if nivel == NIVEL_NODO_ARBOL:
            create_kwargs['nodo_arbol_id'] = nodo_id
        ValorEvaluacion.objects.create(**create_kwargs)
    return load_valores_map(alternativa_id)


def export_alternativa_valores(alternativa_id: int) -> dict[str, Any]:
    """Formato plano tipo oceanographic_alternatives.json."""
    from .models import Alternativa

    alt = Alternativa.objects.select_related('proyecto').get(pk=alternativa_id)
    schema = build_evaluacion_schema(alt.proyecto)
    valores = load_valores_map(alternativa_id)
    row: dict[str, Any] = {}
    for col in schema['columnas']:
        raw = valores.get(col['key'], '')
        if raw == '':
            continue
        label = export_label_for_column(col)
        if col['input_kind'] == 'number':
            try:
                row[label] = float(raw) if '.' in raw else int(raw)
            except ValueError:
                row[label] = raw
        else:
            row[label] = raw
    return row


_OCEAN_MISSION_SUFFIX = re.compile(r' \(M(\d+)\)$')


def export_label_for_column(col: dict) -> str:
    label = col['terminal_nombre']
    if col.get('escenario_nombre'):
        label = f"{label} ({col['escenario_nombre']})"
    return label


def build_import_label_map(schema: dict) -> dict[str, str]:
    """Etiqueta export (oceanographic_alternatives.json) -> clave interna de valor."""
    by_export: dict[str, str] = {}
    by_terminal: dict[str, list[dict]] = {}

    for col in schema.get('columnas') or []:
        export_label = export_label_for_column(col)
        by_export[export_label] = col['key']
        # Compatibilidad con archivos anteriores que usaban M1, M2, etc.
        if col.get('escenario_label'):
            legacy_label = f"{col['terminal_nombre']} ({col['escenario_label']})"
            by_export[legacy_label] = col['key']
        by_terminal.setdefault(col['terminal_nombre'], []).append(col)

    for terminal, cols in by_terminal.items():
        if terminal not in by_export:
            by_export[terminal] = cols[0]['key']

    return by_export


def row_json_to_valores(row: dict[str, Any], schema: dict) -> dict[str, str]:
    label_map = build_import_label_map(schema)
    by_terminal: dict[str, list[dict]] = {}
    for col in schema.get('columnas') or []:
        by_terminal.setdefault(col['terminal_nombre'], []).append(col)

    valores: dict[str, str] = {}
    for json_key, raw in row.items():
        if raw is None:
            continue

        export_label = json_key
        m = _OCEAN_MISSION_SUFFIX.search(json_key)
        if m:
            export_label = f"{json_key} (M{m.group(1)})"

        key = label_map.get(export_label)
        if not key and json_key in label_map:
            key = label_map[json_key]
        if not key:
            cols = by_terminal.get(json_key)
            if cols:
                key = cols[0]['key']

        if key:
            valores[key] = '' if raw == '' else str(raw)

    return valores


def import_alternativas_from_json(
    proyecto: Proyecto,
    data: dict[str, dict[str, Any]],
    *,
    update_existing: bool = True,
) -> dict[str, Any]:
    """Importa alternativas y valores desde formato oceanographic_alternatives.json."""
    from decimal import Decimal, InvalidOperation

    from .models import Alternativa

    schema = build_evaluacion_schema(proyecto)
    created = 0
    updated = 0
    valores_guardados = 0
    alternativas: list[Alternativa] = []

    for nombre, row in data.items():
        if not isinstance(row, dict):
            continue

        costo = None
        if 'Acquisition Cost' in row and row['Acquisition Cost'] is not None:
            try:
                costo = Decimal(str(row['Acquisition Cost']))
            except (InvalidOperation, TypeError, ValueError):
                costo = None

        alt = Alternativa.objects.filter(proyecto=proyecto, nombre=nombre).first()
        if alt is None:
            alt = Alternativa.objects.create(
                proyecto=proyecto,
                nombre=nombre,
                descripcion='Importado desde oceanographic_alternatives.json',
                referencia='oceanographic-demo',
                costo=costo,
                costo_unidad=Alternativa.COSTO_MUSD,
            )
            created += 1
        elif update_existing:
            if costo is not None:
                alt.costo = costo
                alt.costo_unidad = Alternativa.COSTO_MUSD
            alt.save(update_fields=['costo', 'costo_unidad', 'fecha_actualizacion'])
            updated += 1

        valores = row_json_to_valores(row, schema)
        if valores:
            save_valores_bulk(alt.id, valores)
            valores_guardados += len(valores)
        alternativas.append(alt)

    return {
        'alternativas': len(alternativas),
        'creadas': created,
        'actualizadas': updated,
        'valores_guardados': valores_guardados,
        'columnas_schema': len(schema.get('columnas') or []),
    }
