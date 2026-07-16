"""Validación y cálculo de simulación (rollup ponderado por dimensión)."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from .evaluacion_service import (
    NIVEL_NODO_ARBOL,
    NIVEL_OMOE,
    build_evaluacion_schema,
    collect_terminal_nodes_for_omoe,
    escenarios_for_dimension,
    load_valores_map,
    valor_key,
)
from .familia_funciones_doc import etiqueta_familia
from .mcdm_utils import _weighted_mean, build_utility_function
from .riesgo_nodo_utils import MODO_INCERTIDUMBRE, riesgo_producto
from .models import (
    Alternativa,
    DpCriterio,
    GrupoAfinidad,
    Mision,
    MopCriterio,
    NodoArbol,
    Omoe,
    Proyecto,
)
from .mop_funcion_params import FAMILIA_PARAM_SPECS
from .peso_service import (
    validate_escenarios_peso_omoe,
    validate_sibling_pesos_nodo,
    validate_sibling_pesos_queryset,
)

logger = logging.getLogger('api.simulacion')


def _sim_log(debug_logs: list[str] | None, msg: str) -> None:
    logger.info('[SIM] %s', msg)
    if debug_logs is not None:
        debug_logs.append(msg)

@dataclass
class _CriterioStub:
    familia_funciones: str = ''
    parametros_funcion: dict | None = None
    tipo_dato: str = ''
    valor_umbral: Any = None
    valor_meta: Any = None
    sentido_mejora: str = ''
    tipo_mop: str = ''


def _utility_for_criterio(
    *,
    familia: str,
    params: dict,
    tipo_criterio: str = '',
    tipo_dato: str = '',
    valor_umbral=None,
    valor_meta=None,
    sentido_mejora: str = '',
) -> dict[str, Any]:
    dp = _CriterioStub(
        familia_funciones=familia,
        parametros_funcion=params or {},
        tipo_dato=tipo_dato,
        valor_umbral=valor_umbral,
        valor_meta=valor_meta,
        sentido_mejora=sentido_mejora,
    )
    mop = _CriterioStub(
        tipo_mop=tipo_criterio,
        familia_funciones=familia,
        parametros_funcion=params or {},
        valor_umbral=valor_umbral,
        valor_meta=valor_meta,
        sentido_mejora=sentido_mejora,
    )
    return build_utility_function(dp, mop)


def _load_criterio(nivel: str, nodo_id: int):
    if nivel == NIVEL_NODO_ARBOL:
        return NodoArbol.objects.filter(pk=nodo_id).first()
    if nivel == NIVEL_OMOE:
        return Omoe.objects.filter(pk=nodo_id).first()
    if nivel == 'grupo_afinidad':
        return GrupoAfinidad.objects.filter(pk=nodo_id).first()
    if nivel == 'mop':
        return MopCriterio.objects.filter(pk=nodo_id).first()
    if nivel == 'dp':
        return DpCriterio.objects.select_related('mop').filter(pk=nodo_id).first()
    return None


def _criterio_fields(obj) -> dict[str, Any]:
    if obj is None:
        return {}
    if isinstance(obj, NodoArbol):
        return {
            'nombre': obj.nombre,
            'familia': (obj.familia_funciones or '').strip(),
            'params': obj.parametros_funcion or {},
            'tipo_criterio': obj.tipo_criterio or '',
            'tipo_dato': obj.tipo_dato or '',
            'valor_umbral': obj.valor_umbral,
            'valor_meta': obj.valor_meta,
            'sentido_mejora': obj.sentido_mejora or '',
            'modo_evaluacion': obj.modo_evaluacion or 'certeza',
        }
    if isinstance(obj, Omoe):
        return {
            'nombre': obj.nombre_modelo or obj.codigo or f'Dimensión #{obj.pk}',
            'familia': (obj.familia_funciones or '').strip(),
            'params': obj.parametros_funcion or {},
            'tipo_criterio': obj.tipo_criterio or '',
            'tipo_dato': obj.tipo_dato or '',
            'valor_umbral': obj.valor_umbral,
            'valor_meta': obj.valor_meta,
            'sentido_mejora': obj.sentido_mejora or '',
            'modo_evaluacion': obj.modo_evaluacion or 'certeza',
        }
    if isinstance(obj, DpCriterio):
        mop = obj.mop
        return {
            'nombre': obj.nombre_dp or obj.codigo,
            'familia': (obj.familia_funciones or mop.familia_funciones or '').strip(),
            'params': obj.parametros_funcion or mop.parametros_funcion or {},
            'tipo_criterio': mop.tipo_mop or '',
            'tipo_dato': obj.tipo_dato or '',
            'valor_umbral': obj.valor_umbral,
            'valor_meta': obj.valor_meta,
            'sentido_mejora': obj.sentido_mejora or mop.sentido_mejora or '',
        }
    if isinstance(obj, MopCriterio):
        return {
            'nombre': obj.nombre_mop or obj.codigo,
            'familia': (obj.familia_funciones or '').strip(),
            'params': obj.parametros_funcion or {},
            'tipo_criterio': obj.tipo_mop or '',
            'tipo_dato': obj.tipo_mop or '',
            'valor_umbral': obj.valor_umbral,
            'valor_meta': obj.valor_meta,
            'sentido_mejora': obj.sentido_mejora or '',
        }
    if isinstance(obj, GrupoAfinidad):
        return {
            'nombre': obj.nombre_grupo or obj.codigo,
            'familia': (obj.familia_funciones or '').strip(),
            'params': obj.parametros_funcion or {},
            'tipo_criterio': obj.tipo_mop or '',
            'tipo_dato': obj.tipo_mop or '',
            'valor_umbral': None,
            'valor_meta': None,
            'sentido_mejora': '',
        }
    return {'nombre': str(obj), 'familia': '', 'params': {}}


def _append_peso_faltante(faltantes, exc, *, dimension, modulo='Árbol de dimensiones'):
    msg = exc.messages[0] if getattr(exc, 'messages', None) else str(exc)
    faltantes.append(_faltante('peso', msg, dimension=dimension, modulo=modulo))


def _validar_pesos_legacy_omoe(omoe, omoe_nombre, faltantes, vistos_grupos_peso):
    """Pesos 100 % en árbol legacy (misiones, grupos, MOP, DP)."""
    misiones = list(Mision.objects.filter(omoe=omoe, aplica=True))
    if misiones:
        try:
            validate_sibling_pesos_queryset(
                Mision.objects.filter(omoe_id=omoe.id, aplica=True),
            )
        except ValidationError as exc:
            _append_peso_faltante(faltantes, exc, dimension=omoe_nombre)
    grupos_raiz = GrupoAfinidad.objects.filter(
        omoe_id=omoe.id, mision__isnull=True, aplica=True,
    )
    if grupos_raiz.exists():
        key = (omoe.id, 'grupos_raiz')
        if key not in vistos_grupos_peso:
            vistos_grupos_peso.add(key)
            try:
                validate_sibling_pesos_queryset(grupos_raiz)
            except ValidationError as exc:
                _append_peso_faltante(faltantes, exc, dimension=omoe_nombre)
    for mision in misiones:
        grupos = GrupoAfinidad.objects.filter(mision_id=mision.id, aplica=True)
        if not grupos.exists():
            continue
        key = (omoe.id, f'mision-{mision.id}')
        if key in vistos_grupos_peso:
            continue
        vistos_grupos_peso.add(key)
        try:
            validate_sibling_pesos_queryset(grupos)
        except ValidationError as exc:
            _append_peso_faltante(faltantes, exc, dimension=omoe_nombre)
    for grupo in GrupoAfinidad.objects.filter(omoe=omoe, aplica=True):
        mops = MopCriterio.objects.filter(grupo_afinidad_id=grupo.id, aplica=True)
        if not mops.exists():
            continue
        key = (omoe.id, f'grupo-{grupo.id}-mops')
        if key in vistos_grupos_peso:
            continue
        vistos_grupos_peso.add(key)
        try:
            validate_sibling_pesos_queryset(mops)
        except ValidationError as exc:
            _append_peso_faltante(faltantes, exc, dimension=omoe_nombre)
        for mop in mops:
            dps = DpCriterio.objects.filter(mop_id=mop.id)
            if not dps.exists():
                continue
            key = (omoe.id, f'mop-{mop.id}-dps')
            if key in vistos_grupos_peso:
                continue
            vistos_grupos_peso.add(key)
            try:
                validate_sibling_pesos_queryset(dps)
            except ValidationError as exc:
                _append_peso_faltante(faltantes, exc, dimension=omoe_nombre)


def _faltante(
    tipo: str,
    detalle: str,
    *,
    alternativa_id=None,
    alternativa_nombre=None,
    dimension=None,
    escenario=None,
    criterio=None,
    modulo=None,
) -> dict[str, Any]:
    return {
        'tipo': tipo,
        'detalle': detalle,
        'alternativa_id': alternativa_id,
        'alternativa_nombre': alternativa_nombre,
        'dimension': dimension,
        'escenario': escenario,
        'criterio': criterio,
        'modulo': modulo,
    }


def _parametro_vacio(val) -> bool:
    if val is None:
        return True
    if isinstance(val, str):
        return val.strip() == ''
    if isinstance(val, (list, dict)):
        return len(val) == 0
    return False


def _validar_riesgo_terminal(
    col: dict,
    omoe_nombre: str,
    *,
    nombre: str | None = None,
    escenario: str | None = None,
) -> list[dict[str, Any]]:
    """Nodo terminal en modo incertidumbre: requiere tabla de probabilidad y descripciones."""
    faltantes = []
    nombre = nombre or 'Criterio'
    if not col.get('prob_options'):
        faltantes.append(_faltante(
            'constante',
            'Configure la tabla de probabilidad del proyecto (Tablas de riesgo).',
            dimension=omoe_nombre,
            escenario=escenario,
            criterio=nombre,
            modulo='Árbol de dimensiones',
        ))
    descripciones = col.get('consecuencia_descripciones') or {}
    if not any(str(v).strip() for v in descripciones.values()):
        faltantes.append(_faltante(
            'constante',
            'Falta describir al menos un nivel de consecuencia (modo incertidumbre).',
            dimension=omoe_nombre,
            escenario=escenario,
            criterio=nombre,
            modulo='Árbol de dimensiones',
        ))
    return faltantes


def _validar_constantes_terminal(
    terminal: dict,
    omoe_nombre: str,
    *,
    fields_override: dict | None = None,
    escenario: str | None = None,
) -> list[dict[str, Any]]:
    faltantes = []
    nombre = terminal.get('nombre') or 'Criterio'
    if fields_override is not None:
        fields = fields_override
        nombre = fields.get('nombre') or nombre
    else:
        obj = _load_criterio(terminal['nivel'], terminal['nodo_id'])
        fields = _criterio_fields(obj)
        nombre = terminal.get('nombre') or fields.get('nombre') or nombre
    familia = fields.get('familia', '')

    if not familia:
        faltantes.append(_faltante(
            'constante',
            'Falta seleccionar la familia de funciones aplicada.',
            dimension=omoe_nombre,
            escenario=escenario,
            criterio=nombre,
            modulo='Árbol de dimensiones',
        ))
        return faltantes

    params = fields.get('params') or {}
    specs = FAMILIA_PARAM_SPECS.get(familia, [])

    if familia == 'escalas_discretas':
        rows = params.get('categorias_utilidad') or []
        if not rows:
            faltantes.append(_faltante(
                'constante',
                f'Falta la tabla de utilidad por categoría ({etiqueta_familia(familia)}).',
                dimension=omoe_nombre,
                escenario=escenario,
                criterio=nombre,
                modulo='Árbol de dimensiones',
            ))
        return faltantes

    if familia == 'tablas_equivalencia':
        rows = params.get('equivalencias') or []
        if not rows:
            faltantes.append(_faltante(
                'constante',
                f'Falta la tabla de equivalencias ({etiqueta_familia(familia)}).',
                dimension=omoe_nombre,
                escenario=escenario,
                criterio=nombre,
                modulo='Árbol de dimensiones',
            ))
        return faltantes

    for spec in specs:
        if not spec.get('required'):
            continue
        key = spec['key']
        val = params.get(key)
        if _parametro_vacio(val):
            faltantes.append(_faltante(
                'constante',
                f'Falta el parámetro «{spec["label"]}» ({etiqueta_familia(familia)}).',
                dimension=omoe_nombre,
                escenario=escenario,
                criterio=nombre,
                modulo='Árbol de dimensiones',
            ))

    if familia in FAMILIA_PARAM_SPECS and not specs:
        if _parametro_vacio(params.get('L')) and fields.get('valor_umbral') is None:
            if terminal.get('input_kind') == 'number':
                faltantes.append(_faltante(
                    'constante',
                    'Falta al menos L (límite inferior) o valor umbral.',
                    dimension=omoe_nombre,
                    escenario=escenario,
                    criterio=nombre,
                    modulo='Árbol de dimensiones',
                ))

    return faltantes


def validar_simulacion(proyecto: Proyecto) -> dict[str, Any]:
    """Comprueba matrices de evaluación y constantes antes de calcular."""
    faltantes: list[dict[str, Any]] = []
    schema = build_evaluacion_schema(proyecto)
    alternativas = list(Alternativa.objects.filter(proyecto=proyecto).order_by('id'))

    if not alternativas:
        faltantes.append(_faltante(
            'configuracion',
            'No hay alternativas definidas.',
            modulo='Gestión de alternativas',
        ))

    if not schema.get('dimensiones'):
        faltantes.append(_faltante(
            'configuracion',
            'No hay dimensiones en el árbol.',
            modulo='Árbol de dimensiones',
        ))

    vistos_constantes: set[str] = set()
    vistos_grupos_peso: set[tuple[int, int | None]] = set()

    for omoe in Omoe.objects.filter(proyecto=proyecto).order_by('orden', 'id'):
        omoe_nombre = omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.pk}'
        es_valor_bruto = (
            getattr(omoe, 'modo_valor_terminal', None) or 'utilidad'
        ) == 'valor_bruto'
        nodos_qs = NodoArbol.objects.filter(omoe=omoe, aplica=True)
        if nodos_qs.exists():
            if not es_valor_bruto:
                parent_ids = set(nodos_qs.values_list('parent_id', flat=True))
                for parent_id in parent_ids:
                    grupo_key = (omoe.id, parent_id)
                    if grupo_key in vistos_grupos_peso:
                        continue
                    vistos_grupos_peso.add(grupo_key)
                    try:
                        validate_sibling_pesos_nodo(omoe.id, parent_id)
                    except ValidationError as exc:
                        msg = exc.messages[0] if getattr(exc, 'messages', None) else str(exc)
                        faltantes.append(_faltante(
                            'peso',
                            msg,
                            dimension=omoe_nombre,
                            modulo='Árbol de dimensiones',
                        ))
        else:
            if not es_valor_bruto:
                _validar_pesos_legacy_omoe(omoe, omoe_nombre, faltantes, vistos_grupos_peso)

    for dim in schema.get('dimensiones', []):
        omoe_nombre = dim['omoe_nombre']
        omoe_id = dim['omoe_id']
        es_valor_bruto = (dim.get('modo_valor_terminal') or 'utilidad') == 'valor_bruto'

        try:
            validate_escenarios_peso_omoe(omoe_id)
        except ValidationError as exc:
            faltantes.append(_faltante(
                'peso',
                str(exc.message if hasattr(exc, 'message') else exc.messages[0]),
                dimension=omoe_nombre,
                modulo='Definición de escenarios',
            ))

        for col in dim.get('columnas', []):
            col_key = col.get('key')
            if not col_key or col_key in vistos_constantes:
                continue
            vistos_constantes.add(col_key)
            nombre_col = col.get('terminal_nombre') or col.get('label')
            if col.get('modo_evaluacion') == MODO_INCERTIDUMBRE:
                faltantes.extend(_validar_riesgo_terminal(
                    col,
                    omoe_nombre,
                    nombre=nombre_col,
                    escenario=col.get('escenario_nombre') or col.get('escenario_label'),
                ))
                continue
            if es_valor_bruto:
                # Costos: no exigir familia/parámetros de utilidad.
                continue
            fields_override = {
                'nombre': nombre_col,
                'familia': col.get('familia_funciones') or '',
                'params': col.get('constantes') or {},
            }
            pseudo_terminal = {
                'nivel': col['nivel'],
                'nodo_id': col['nodo_id'],
                'nombre': fields_override['nombre'],
                'input_kind': col.get('input_kind'),
            }
            faltantes.extend(_validar_constantes_terminal(
                pseudo_terminal,
                omoe_nombre,
                fields_override=fields_override,
                escenario=col.get('escenario_nombre') or col.get('escenario_label'),
            ))

        if not dim.get('columnas'):
            faltantes.append(_faltante(
                'configuracion',
                'Sin nodos terminales ni escenarios para evaluar.',
                dimension=omoe_nombre,
                modulo='Árbol de dimensiones / Escenarios',
            ))
            continue

        for alt in alternativas:
            valores = load_valores_map(alt.id)
            for col in dim['columnas']:
                raw = valores.get(col['key'], '')
                if raw is None or str(raw).strip() == '':
                    faltantes.append(_faltante(
                        'valor_evaluacion',
                        'Celda vacía en la matriz de evaluación.',
                        alternativa_id=alt.id,
                        alternativa_nombre=alt.nombre,
                        dimension=omoe_nombre,
                        escenario=col.get('escenario_nombre') or col.get('escenario_label'),
                        criterio=col.get('terminal_nombre') or col.get('label'),
                        modulo='Evaluación',
                    ))

    return {
        'ok': len(faltantes) == 0,
        'total_faltantes': len(faltantes),
        'faltantes': faltantes,
    }


def _round6(val) -> float:
    try:
        return round(float(val), 6)
    except (TypeError, ValueError):
        return 0.0


def _dim_calc_context(omoe: Omoe) -> dict[str, str]:
    return {
        'escenario_agregacion': getattr(omoe, 'escenario_agregacion', None) or 'compensatorio',
        'modo_valor_terminal': getattr(omoe, 'modo_valor_terminal', None) or 'utilidad',
        'rama_evaluacion': getattr(omoe, 'rama_evaluacion', None) or 'omoe',
    }


def _coerce_terminal_value(raw, util_fn: dict, *, es_riesgo: bool, valor_bruto: bool):
    if es_riesgo:
        return riesgo_producto(raw)
    if valor_bruto:
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None
    from .pydecision_bridge import evaluate_utility
    return evaluate_utility(raw, util_fn)


def _aggregate_escenario_values(
    esc_rows: list[dict],
    pairs: list[tuple[float, float]],
    agregacion: str,
    *,
    dim_ctx: dict[str, str] | None = None,
) -> tuple[float | None, str, dict | None]:
    from .escenario_agregacion_choices import (
        ESCENARIO_AGREG_INDEPENDIENTE,
        ESCENARIO_AGREG_MAXIMO_MEJOR,
        ESCENARIO_AGREG_MINIMO_MEJOR,
        ESCENARIO_AGREG_PEOR_CASO,
        peor_caso_selecciona_maximo,
    )

    if not esc_rows:
        return None, 'Sin escenarios', None
    if agregacion == ESCENARIO_AGREG_MINIMO_MEJOR:
        best = min(esc_rows, key=lambda r: float(r['u']))
        return float(best['u']), f'mín(u) → «{best["nombre"]}»', best
    if agregacion == ESCENARIO_AGREG_MAXIMO_MEJOR:
        best = max(esc_rows, key=lambda r: float(r['u']))
        return float(best['u']), f'máx(u) → «{best["nombre"]}»', best
    if agregacion == ESCENARIO_AGREG_PEOR_CASO:
        if peor_caso_selecciona_maximo(dim_ctx=dim_ctx):
            best = max(esc_rows, key=lambda r: float(r['u']))
            return float(best['u']), f'máx(u) peor caso → «{best["nombre"]}»', best
        best = min(esc_rows, key=lambda r: float(r['u']))
        return float(best['u']), f'mín(u) peor caso → «{best["nombre"]}»', best
    if agregacion == ESCENARIO_AGREG_INDEPENDIENTE:
        first = esc_rows[0]
        return float(first['u']), f'escenario «{first["nombre"]}» (sin agregación)', first
    return _weighted_mean(pairs), 'Σ(u·peso_escenario)/Σ(peso_escenario)', None


def _rollup_aggregate(pairs: list[tuple[float, float]], ctx: dict[str, str] | None) -> float:
    if ctx and ctx.get('modo_valor_terminal') == 'valor_bruto':
        return sum(v for v, _ in pairs)
    return _weighted_mean(pairs)


def _nodo_level_label(nodo: NodoArbol) -> str:
    tipo = getattr(nodo, 'tipo_nivel', None)
    if tipo and getattr(tipo, 'nombre', None):
        return tipo.nombre
    return 'Nodo'


def _rollup_child_row(nodo_id, nombre, level_label, score, peso, child_trace) -> dict:
    w = float(peso or 0)
    return {
        'nodo_id': nodo_id,
        'nombre': nombre,
        'level_label': level_label,
        'valor': _round6(score),
        'peso': w,
        'contribucion': _round6(score * w),
        'trace': child_trace,
    }


def _build_leaf_trace(
    terminal: dict,
    valores: dict[str, str],
    escenarios: list,
    util_fn: dict,
    fields: dict,
    debug_logs: list[str] | None = None,
    dim_ctx: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    from .pydecision_bridge import evaluate_utility

    nombre = terminal.get('nombre') or fields.get('nombre', '—')
    nivel = terminal['nivel']
    nodo_id = terminal['nodo_id']
    familia = (fields.get('familia') or '').strip()
    es_riesgo = fields.get('modo_evaluacion') == MODO_INCERTIDUMBRE
    valor_bruto = bool(dim_ctx and dim_ctx.get('modo_valor_terminal') == 'valor_bruto')
    agregacion = (dim_ctx or {}).get('escenario_agregacion') or 'compensatorio'
    familia_label = (
        'Valor bruto (sin transformación)' if valor_bruto and not es_riesgo
        else 'Riesgo (probabilidad × consecuencia)' if es_riesgo
        else (etiqueta_familia(familia) if familia else 'Sin familia')
    )
    esc_rows: list[dict[str, Any]] = []
    keys_used: list[dict[str, Any]] = []
    escenario_elegido = None
    formula_esc = None

    l_val = util_fn.get('threshold')
    u_val = util_fn.get('goal')
    is_inc = util_fn.get('is_increasing', True)
    _sim_log(
        debug_logs,
        f'HOJA «{nombre}» nivel={nivel} id={nodo_id} familia={familia_label} '
        f'L={l_val} U={u_val} increasing={is_inc} util_type={util_fn.get("type")}',
    )

    if escenarios:
        pairs: list[tuple[float, float]] = []
        for esc in escenarios:
            key = valor_key(nivel, nodo_id, esc.id)
            raw = valores.get(key, '')
            keys_used.append({'key': key, 'raw': raw, 'escenario': esc.nombre})
            if str(raw).strip() == '':
                _sim_log(debug_logs, f'  ✗ celda vacía key={key} escenario={esc.nombre}')
                return None
            if es_riesgo:
                u = riesgo_producto(raw)
                if u is None:
                    _sim_log(debug_logs, f'  ✗ riesgo incompleto key={key} raw={raw!r}')
                    return None
            else:
                u = _coerce_terminal_value(raw, util_fn, es_riesgo=False, valor_bruto=valor_bruto)
                if u is None:
                    _sim_log(debug_logs, f'  ✗ valor no numérico key={key} raw={raw!r}')
                    return None
            w = float(esc.peso or 0)
            pairs.append((u, w))
            try:
                x_num = float(raw)
                if util_fn.get('type') == 'LinearUtilityFunction' and l_val is not None and u_val is not None:
                    nx = (x_num - float(l_val)) / (float(u_val) - float(l_val)) if float(u_val) != float(l_val) else 0
                    clip_note = f'norm={nx:.4f}→clip'
                else:
                    clip_note = '—'
            except (TypeError, ValueError):
                clip_note = 'no-numérico'
            _sim_log(
                debug_logs,
                f'  esc «{esc.nombre}» key={key} x={raw!r} u={u:.6f} peso_esc={w} ({clip_note})',
            )
            esc_rows.append({
                'escenario_id': esc.id,
                'nombre': esc.nombre or f'Escenario {esc.id}',
                'x': raw,
                'u': _round6(u),
                'peso': w,
                'valor_key': key,
            })
        valor, formula_esc, escenario_elegido = _aggregate_escenario_values(
            esc_rows, pairs, agregacion, dim_ctx=dim_ctx,
        )
        if valor is None:
            return None
        if escenario_elegido:
            _sim_log(
                debug_logs,
                f'  ⇒ agregado escenarios u={valor:.6f} ({formula_esc})',
            )
        else:
            _sim_log(debug_logs, f'  ⇒ agregado escenarios u={valor:.6f}')
    else:
        key = valor_key(nivel, nodo_id, None)
        raw = valores.get(key, '')
        keys_used.append({'key': key, 'raw': raw, 'escenario': 'global'})
        if str(raw).strip() == '':
            _sim_log(debug_logs, f'  ✗ celda vacía key={key}')
            return None
        if es_riesgo:
            valor = riesgo_producto(raw)
            if valor is None:
                _sim_log(debug_logs, f'  ✗ riesgo incompleto key={key} raw={raw!r}')
                return None
        else:
            valor = _coerce_terminal_value(raw, util_fn, es_riesgo=False, valor_bruto=valor_bruto)
            if valor is None:
                _sim_log(debug_logs, f'  ✗ valor no numérico key={key} raw={raw!r}')
                return None
        _sim_log(debug_logs, f'  valor único key={key} x={raw!r} u={valor:.6f}')
        esc_rows.append({
            'escenario_id': None,
            'nombre': 'Valor único',
            'x': raw,
            'u': _round6(valor),
            'peso': None,
            'valor_key': key,
        })
        formula_esc = None

    if util_fn.get('type') == 'LinearUtilityFunction' and l_val is not None and u_val is not None:
        nota = (
            f'Min-max: u=0 si x≤L ({l_val}); u=1 si x≥U ({u_val}). '
            f'Con x=L exactamente, u=0.'
        )
    else:
        nota = ''

    return {
        'kind': 'leaf',
        'nivel': nivel,
        'nodo_id': nodo_id,
        'nombre': nombre,
        'level_label': terminal.get('level_label') or 'Hoja',
        'valor': _round6(valor),
        'familia': familia,
        'familia_label': familia_label,
        'parametros': fields.get('params') or {},
        'utilidad_tipo': util_fn.get('type', ''),
        'utilidad_fn': util_fn if settings.DEBUG else None,
        'escenarios': esc_rows,
        'formula_escenarios': formula_esc,
        'formula': f'{"x" if valor_bruto else "u(x)"} — {familia_label}',
        'escenario_elegido': escenario_elegido.get('nombre') if escenario_elegido else None,
        'hijos': [],
        'debug': {
            'L': l_val,
            'U': u_val,
            'is_increasing': is_inc,
            'keys': keys_used,
            'nota': nota,
        },
    }


def _terminal_utility(
    valores: dict[str, str],
    terminal: dict,
    escenarios: list,
    utility_fn: dict,
    dim_ctx: dict[str, str] | None = None,
) -> float | None:
    es_riesgo = terminal.get('modo_evaluacion') == MODO_INCERTIDUMBRE
    valor_bruto = bool(dim_ctx and dim_ctx.get('modo_valor_terminal') == 'valor_bruto')
    agregacion = (dim_ctx or {}).get('escenario_agregacion') or 'compensatorio'

    def _eval(raw):
        return _coerce_terminal_value(raw, utility_fn, es_riesgo=es_riesgo, valor_bruto=valor_bruto)

    if not escenarios:
        raw = valores.get(valor_key(terminal['nivel'], terminal['nodo_id'], None), '')
        if str(raw).strip() == '':
            return None
        return _eval(raw)

    esc_rows: list[dict] = []
    pairs: list[tuple[float, float]] = []
    for esc in escenarios:
        key = valor_key(terminal['nivel'], terminal['nodo_id'], esc.id)
        raw = valores.get(key, '')
        if str(raw).strip() == '':
            return None
        u = _eval(raw)
        if u is None:
            return None
        w = float(esc.peso or 0)
        pairs.append((u, w))
        esc_rows.append({'nombre': esc.nombre, 'u': u})

    valor, _, _ = _aggregate_escenario_values(
        esc_rows, pairs, agregacion, dim_ctx=dim_ctx,
    )
    return valor


def _rollup_trace_nodo_arbol(
    nodo: NodoArbol,
    leaf_traces: dict[int, dict],
    by_parent: dict[int | None, list[NodoArbol]],
    debug_logs: list[str] | None = None,
    config_map: dict[int, dict] | None = None,
    dim_ctx: dict[str, str] | None = None,
) -> tuple[float, dict[str, Any]]:
    from .nodo_escenario_service import nodo_effective_peso

    hijos = by_parent.get(nodo.id, [])
    if not hijos:
        trace = leaf_traces.get(nodo.id)
        if trace:
            return trace['valor'], trace
        _sim_log(debug_logs, f'  nodo hoja sin trace id={nodo.id} «{nodo.nombre}» → 0')
        return 0.0, {
            'kind': 'leaf',
            'nivel': NIVEL_NODO_ARBOL,
            'nodo_id': nodo.id,
            'nombre': nodo.nombre,
            'level_label': _nodo_level_label(nodo),
            'valor': 0.0,
            'formula': 'Sin datos',
            'hijos': [],
        }

    hijo_rows = []
    pairs: list[tuple[float, float]] = []
    for h in hijos:
        score, child_trace = _rollup_trace_nodo_arbol(
            h, leaf_traces, by_parent, debug_logs, config_map, dim_ctx,
        )
        w = nodo_effective_peso(h, config_map)
        pairs.append((score, w))
        hijo_rows.append(_rollup_child_row(h.id, h.nombre, _nodo_level_label(h), score, w, child_trace))
        _sim_log(
            debug_logs,
            f'  rollup hijo «{h.nombre}» u={score:.6f} peso={w} contrib={score * w:.6f}',
        )

    valor = _rollup_aggregate(pairs, dim_ctx)
    sum_pesos = sum(w for _, w in pairs)
    rollup_formula = 'Σ(xᵢ)' if dim_ctx and dim_ctx.get('modo_valor_terminal') == 'valor_bruto' else 'Σ(uᵢ·pesoᵢ)/Σ(pesoᵢ)'
    _sim_log(
        debug_logs,
        f'ROLLUP «{nodo.nombre}» {rollup_formula} = {valor:.6f} (Σw={sum_pesos})',
    )
    return valor, {
        'kind': 'rollup',
        'nivel': NIVEL_NODO_ARBOL,
        'nodo_id': nodo.id,
        'nombre': nodo.nombre,
        'level_label': _nodo_level_label(nodo),
        'valor': _round6(valor),
        'formula': rollup_formula,
        'suma_pesos': _round6(sum_pesos),
        'hijos': hijo_rows,
    }


def _rollup_nodo_arbol(
    nodo: NodoArbol,
    leaf_scores: dict[int, float],
    by_parent: dict[int | None, list[NodoArbol]],
    config_map: dict[int, dict] | None = None,
) -> float:
    from .nodo_escenario_service import nodo_effective_peso

    hijos = by_parent.get(nodo.id, [])
    if not hijos:
        return leaf_scores.get(nodo.id, 0.0)
    pairs = []
    for h in hijos:
        score = _rollup_nodo_arbol(h, leaf_scores, by_parent, config_map)
        pairs.append((score, nodo_effective_peso(h, config_map)))
    return _weighted_mean(pairs)


def _calcular_dimension_nodo_arbol(
    omoe: Omoe,
    terminales: list[dict],
    escenarios: list,
    valores: dict[str, str],
    debug_logs: list[str] | None = None,
) -> tuple[float, dict[str, Any]]:
    from .nodo_escenario_service import (
        merge_criterio_fields_for_escenario,
        nodo_effective_aplica,
        nodo_effective_peso,
        resolve_tree_config_for_calc,
    )

    config_map = resolve_tree_config_for_calc(omoe.id, escenarios)
    dim_ctx = _dim_calc_context(omoe)
    leaf_traces: dict[int, dict] = {}
    detalle_hojas = []

    for t in terminales:
        if t['nivel'] != NIVEL_NODO_ARBOL:
            _sim_log(
                debug_logs,
                f'  (omitido terminal legacy/arbol nivel={t["nivel"]} «{t.get("nombre")}» — '
                f'árbol flexible solo procesa nodo_arbol)',
            )
            continue
        obj = _load_criterio(t['nivel'], t['nodo_id'])
        if isinstance(obj, NodoArbol) and not nodo_effective_aplica(obj, config_map):
            _sim_log(debug_logs, f'  (omitido nodo inactivo en escenario «{obj.nombre}»)')
            continue
        fields = merge_criterio_fields_for_escenario(obj, config_map) if isinstance(obj, NodoArbol) else _criterio_fields(obj)
        t_enriched = {
            **t,
            'level_label': _nodo_level_label(obj) if isinstance(obj, NodoArbol) else 'Hoja',
        }
        util_fn = _utility_for_criterio(
            familia=fields['familia'],
            params=fields['params'],
            tipo_criterio=fields.get('tipo_criterio', ''),
            tipo_dato=fields.get('tipo_dato', ''),
            valor_umbral=fields.get('valor_umbral'),
            valor_meta=fields.get('valor_meta'),
            sentido_mejora=fields.get('sentido_mejora', ''),
        )
        trace = _build_leaf_trace(
            t_enriched, valores, escenarios, util_fn, fields, debug_logs, dim_ctx,
        )
        if trace is None:
            continue
        leaf_traces[t['nodo_id']] = trace
        peso_hoja = nodo_effective_peso(obj, config_map) if isinstance(obj, NodoArbol) else None
        detalle_hojas.append({
            'nodo_id': t['nodo_id'],
            'nombre': t['nombre'],
            'utilidad': trace['valor'],
            'peso': peso_hoja,
        })

    nodos = list(
        NodoArbol.objects.filter(omoe=omoe)
        .select_related('tipo_nivel')
        .order_by('orden_visual', 'id')
    )
    if config_map is not None:
        nodos = [n for n in nodos if nodo_effective_aplica(n, config_map)]
    else:
        nodos = [n for n in nodos if n.aplica]

    by_parent: dict[int | None, list[NodoArbol]] = {}
    for n in nodos:
        by_parent.setdefault(n.parent_id, []).append(n)

    roots = by_parent.get(None, [])
    omoe_nombre = omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.pk}'
    if not roots:
        empty_trace = {
            'kind': 'dimension',
            'nivel': NIVEL_OMOE,
            'nodo_id': omoe.id,
            'nombre': omoe_nombre,
            'rama': omoe.rama_evaluacion,
            'valor': 0.0,
            'formula': 'Sin raíces en el árbol',
            'hijos': [],
        }
        return 0.0, {'trace': empty_trace, 'hojas': detalle_hojas, 'raices': []}

    root_rows = []
    root_pairs: list[tuple[float, float]] = []
    detalle_raices = []
    for r in roots:
        score, root_trace = _rollup_trace_nodo_arbol(
            r, leaf_traces, by_parent, debug_logs, config_map, dim_ctx,
        )
        w = nodo_effective_peso(r, config_map)
        root_pairs.append((score, w))
        root_rows.append(_rollup_child_row(r.id, r.nombre, _nodo_level_label(r), score, w, root_trace))
        detalle_raices.append({
            'nodo_id': r.id,
            'nombre': r.nombre,
            'valor': _round6(score),
            'peso': w,
        })

    dimension_val = _rollup_aggregate(root_pairs, dim_ctx)
    root_formula = 'Σ(x_raíz)' if dim_ctx.get('modo_valor_terminal') == 'valor_bruto' else 'Σ(u_raíz·peso)/Σ(peso)'
    trace = {
        'kind': 'dimension',
        'nivel': NIVEL_OMOE,
        'nodo_id': omoe.id,
        'nombre': omoe_nombre,
        'rama': omoe.rama_evaluacion,
        'valor': _round6(dimension_val),
        'formula': f'{root_formula} sobre raíces del árbol',
        'escenario_agregacion': dim_ctx.get('escenario_agregacion'),
        'modo_valor_terminal': dim_ctx.get('modo_valor_terminal'),
        'suma_pesos': _round6(sum(w for _, w in root_pairs)),
        'hijos': root_rows,
        'escenario_config_id': escenarios[0].id if escenarios else None,
    }
    return dimension_val, {'trace': trace, 'hojas': detalle_hojas, 'raices': detalle_raices}


def _calcular_dimension_omoe_terminal(
    omoe: Omoe,
    terminales: list[dict],
    escenarios: list,
    valores: dict[str, str],
    debug_logs: list[str] | None = None,
) -> tuple[float, dict[str, Any]]:
    t = terminales[0]
    fields = _criterio_fields(omoe)
    t_enriched = {**t, 'level_label': 'Dimensión', 'nombre': omoe.nombre_modelo or omoe.codigo}
    util_fn = _utility_for_criterio(
        familia=fields['familia'],
        params=fields['params'],
        tipo_criterio=fields.get('tipo_criterio', ''),
        tipo_dato=fields.get('tipo_dato', ''),
        valor_umbral=fields.get('valor_umbral'),
        valor_meta=fields.get('valor_meta'),
        sentido_mejora=fields.get('sentido_mejora', ''),
    )
    dim_ctx = _dim_calc_context(omoe)
    leaf = _build_leaf_trace(
        t_enriched, valores, escenarios, util_fn, fields, debug_logs, dim_ctx,
    )
    u = (leaf or {}).get('valor', 0.0)
    omoe_nombre = omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.pk}'
    trace = {
        'kind': 'dimension',
        'nivel': NIVEL_OMOE,
        'nodo_id': omoe.id,
        'nombre': omoe_nombre,
        'rama': omoe.rama_evaluacion,
        'valor': _round6(u or 0.0),
        'formula': 'Dimensión evaluable directamente (hoja única)',
        'hijos': [leaf] if leaf else [],
    }
    return (u or 0.0), {
        'trace': trace,
        'hojas': [{'nombre': omoe_nombre, 'utilidad': u}],
        'raices': [],
    }


def _legacy_level_label(node: dict) -> str:
    t = node.get('type', '')
    if t == 'Criterion':
        return 'Dimensión'
    if t == 'SubCriterion':
        return 'Grupo de afinidad'
    if t == 'Aspect':
        return 'MOP'
    if t == 'Attribute':
        return 'DP'
    return t or 'Nodo'


def _calcular_dimension_legacy(
    omoe: Omoe,
    terminales: list[dict],
    escenarios: list,
    valores: dict[str, str],
    debug_logs: list[str] | None = None,
) -> tuple[float, dict[str, Any]]:
    from .mcdm_utils import build_hierarchy_export

    _sim_log(debug_logs, f'Dimensión legacy «{omoe.nombre_modelo}» — {len(terminales)} terminales')
    dim_ctx = _dim_calc_context(omoe)
    leaf_traces: dict[tuple[str, int], dict] = {}
    for t in terminales:
        obj = _load_criterio(t['nivel'], t['nodo_id'])
        fields = _criterio_fields(obj)
        level_labels = {
            'grupo_afinidad': 'Grupo de afinidad',
            'mop': 'MOP',
            'dp': 'DP',
        }
        t_enriched = {**t, 'level_label': level_labels.get(t['nivel'], t['nivel'])}
        util_fn = _utility_for_criterio(
            familia=fields['familia'],
            params=fields['params'],
            tipo_criterio=fields.get('tipo_criterio', ''),
            tipo_dato=fields.get('tipo_dato', ''),
            valor_umbral=fields.get('valor_umbral'),
            valor_meta=fields.get('valor_meta'),
            sentido_mejora=fields.get('sentido_mejora', ''),
        )
        trace = _build_leaf_trace(
            t_enriched, valores, escenarios, util_fn, fields, debug_logs, dim_ctx,
        )
        if trace is not None:
            leaf_traces[(t['nivel'], t['nodo_id'])] = trace

    hierarchy = build_hierarchy_export(omoe, strip_meta=False)

    def inject_trace(node: dict) -> tuple[float, dict[str, Any]]:
        if node.get('type') == 'Attribute':
            meta = node.get('_meta') or {}
            dp_id = meta.get('dp_id')
            key = ('dp', dp_id) if dp_id else None
            if key and key in leaf_traces:
                tr = leaf_traces[key]
                return tr['valor'], tr
            return 0.0, {
                'kind': 'leaf',
                'nivel': 'dp',
                'nodo_id': dp_id,
                'nombre': node.get('name', 'DP'),
                'level_label': 'DP',
                'valor': 0.0,
                'formula': 'Sin datos',
                'hijos': [],
            }

        children = node.get('children') or []
        if not children:
            meta = node.get('_meta') or {}
            for nivel, id_key in (('grupo_afinidad', 'grupo_id'), ('mop', 'mop_id')):
                nid = meta.get(id_key)
                key = (nivel, nid) if nid else None
                if key and key in leaf_traces:
                    tr = leaf_traces[key]
                    return tr['valor'], tr
            return 0.0, {
                'kind': 'leaf',
                'nivel': 'legacy',
                'nodo_id': None,
                'nombre': node.get('name', '—'),
                'level_label': _legacy_level_label(node),
                'valor': 0.0,
                'formula': 'Sin datos',
                'hijos': [],
            }

        hijo_rows = []
        pairs: list[tuple[float, float]] = []
        for child in children:
            score, child_trace = inject_trace(child)
            w = float(child.get('local_weight', 0) or 0)
            pairs.append((score, w))
            meta = child.get('_meta') or {}
            hijo_rows.append(_rollup_child_row(
                meta.get('dp_id') or meta.get('mop_id') or meta.get('grupo_id'),
                child.get('name', '—'),
                _legacy_level_label(child),
                score,
                w,
                child_trace,
            ))

        valor = _weighted_mean(pairs)
        meta = node.get('_meta') or {}
        _sim_log(
            debug_logs,
            f'ROLLUP legacy «{node.get("name")}» Σ(u·w)/Σw = {valor:.6f}',
        )
        return valor, {
            'kind': 'rollup',
            'nivel': 'legacy',
            'nodo_id': meta.get('grupo_id') or meta.get('mop_id'),
            'nombre': node.get('name', '—'),
            'level_label': _legacy_level_label(node),
            'valor': _round6(valor),
            'formula': 'Σ(uᵢ·pesoᵢ)/Σ(pesoᵢ)',
            'suma_pesos': _round6(sum(w for _, w in pairs)),
            'hijos': hijo_rows,
        }

    dimension_val, sub_trace = inject_trace(hierarchy)
    omoe_nombre = omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.pk}'
    trace = {
        'kind': 'dimension',
        'nivel': NIVEL_OMOE,
        'nodo_id': omoe.id,
        'nombre': omoe_nombre,
        'rama': omoe.rama_evaluacion,
        'valor': _round6(dimension_val),
        'formula': 'Rollup jerárquico legacy (grupos → MOP → DP)',
        'hijos': sub_trace.get('hijos', []) if sub_trace.get('kind') == 'rollup' else [sub_trace],
    }
    if sub_trace.get('kind') == 'rollup' and sub_trace.get('nombre') == hierarchy.get('name'):
        trace['hijos'] = sub_trace.get('hijos', [])

    return dimension_val, {
        'trace': trace,
        'metodo': 'legacy',
        'valor': _round6(dimension_val),
        'hojas': [
            {'nombre': tr['nombre'], 'utilidad': tr['valor']}
            for tr in leaf_traces.values()
        ],
    }


def _mavt_calcular_dimension(
    omoe: Omoe,
    terminales: list[dict],
    escenarios: list,
    valores: dict[str, str],
    debug_logs: list[str] | None = None,
) -> tuple[float, dict[str, Any]]:
    """Cálculo jerárquico actual (MAVT): árbol flexible, legacy u hoja única."""
    has_arbol = NodoArbol.objects.filter(omoe=omoe, aplica=True).exists()
    metodo = 'legacy'
    if not has_arbol and len(terminales) == 1 and terminales[0]['nivel'] == NIVEL_OMOE:
        metodo = 'omoe_terminal'
    elif has_arbol:
        metodo = 'nodo_arbol'
    _sim_log(
        debug_logs,
        f'MAVT estructura={metodo} dimensión «{omoe.nombre_modelo}» terminales={len(terminales)} '
        f'escenarios={len(escenarios)}',
    )
    if metodo == 'omoe_terminal':
        return _calcular_dimension_omoe_terminal(omoe, terminales, escenarios, valores, debug_logs)
    if metodo == 'nodo_arbol':
        return _calcular_dimension_nodo_arbol(omoe, terminales, escenarios, valores, debug_logs)
    return _calcular_dimension_legacy(omoe, terminales, escenarios, valores, debug_logs)


def _calcular_dimension_weighted_sum(
    omoe: Omoe,
    terminales: list[dict],
    escenarios: list,
    valores: dict[str, str],
    config: dict[str, Any],
    debug_logs: list[str] | None = None,
) -> tuple[float, dict[str, Any]]:
    """Agregación plana: promedio ponderado de utilidades en hojas."""
    pairs: list[tuple[float, float]] = []
    hojas: list[dict[str, Any]] = []
    warnings: list[str] = []

    dim_ctx = _dim_calc_context(omoe)
    for t in terminales:
        obj = _load_criterio(t['nivel'], t['nodo_id'])
        fields = _criterio_fields(obj)
        util_fn = _utility_for_criterio(
            familia=fields['familia'],
            params=fields['params'],
            tipo_criterio=fields.get('tipo_criterio', ''),
            tipo_dato=fields.get('tipo_dato', ''),
            valor_umbral=fields.get('valor_umbral'),
            valor_meta=fields.get('valor_meta'),
            sentido_mejora=fields.get('sentido_mejora', ''),
        )
        u = _terminal_utility(valores, t, escenarios, util_fn, dim_ctx)
        if u is None:
            warnings.append(f'Hoja «{t.get("nombre")}» sin valor evaluable; se omite.')
            continue
        w = float(getattr(obj, 'peso', 0) or 0) if obj else 0.0
        pairs.append((u, w))
        hojas.append({
            'nombre': t.get('nombre'),
            'utilidad': _round6(u),
            'peso': w,
        })

    fallback = config.get('fallback_to_arithmetic_mean_when_zero_weights', True)
    valor = _rollup_aggregate(pairs, dim_ctx) if pairs else 0.0
    if not pairs and fallback:
        warnings.append('Sin hojas evaluables; valor=0.')

    omoe_nombre = omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.pk}'
    trace = {
        'kind': 'dimension',
        'nivel': NIVEL_OMOE,
        'nodo_id': omoe.id,
        'nombre': omoe_nombre,
        'rama': omoe.rama_evaluacion,
        'valor': _round6(valor),
        'formula': 'Σ(uᵢ·pesoᵢ)/Σ(pesoᵢ) sobre hojas',
        'hijos': hojas,
    }
    return valor, {
        'trace': trace,
        'metodo': 'weighted_sum',
        'hojas': hojas,
        'warnings': warnings,
        'valor': _round6(valor),
    }


def _calcular_dimension(
    omoe: Omoe,
    terminales: list[dict],
    escenarios: list,
    valores: dict[str, str],
    debug_logs: list[str] | None = None,
) -> tuple[float, dict[str, Any]]:
    from .dimension_calculation_service import calcular_dimension

    method = (omoe.calculation_method or 'MAVT').strip()
    _sim_log(
        debug_logs,
        f'calculation_method={method} dimensión «{omoe.nombre_modelo}» '
        f'terminales={len(terminales)} escenarios={len(escenarios)}',
    )
    return calcular_dimension(
        omoe,
        terminales,
        escenarios,
        valores,
        mavt_fn=_mavt_calcular_dimension,
        weighted_sum_fn=_calcular_dimension_weighted_sum,
        debug_logs=debug_logs,
    )


def _calcular_dimension_con_resumen_escenarios(
    omoe: Omoe,
    terminales: list[dict],
    escenarios: list,
    valores: dict[str, str],
    debug_logs: list[str] | None = None,
) -> tuple[float, dict[str, Any], dict[str, Any] | None]:
    """
    Para mínimo/máximo-mejor y peor caso evalúa el árbol completo por escenario
    y elige el más favorable (Eq. 22) o el más adverso (Eq. 23).
    En modo compensatorio mantiene la agregación ponderada habitual (Eq. 21).
    """
    from .escenario_agregacion_choices import (
        ESCENARIO_AGREG_MAXIMO_MEJOR,
        ESCENARIO_AGREG_MINIMO_MEJOR,
        ESCENARIO_AGREG_PEOR_CASO,
        ESCENARIO_AGREG_SELECCION,
        ESCENARIO_AGREG_COMPENSATORIO,
        peor_caso_selecciona_maximo,
    )

    agregacion = getattr(omoe, 'escenario_agregacion', None) or ESCENARIO_AGREG_COMPENSATORIO

    if agregacion not in ESCENARIO_AGREG_SELECCION:
        valor, detalle = _calcular_dimension(
            omoe, terminales, escenarios, valores, debug_logs,
        )
        return valor, detalle, None

    if not escenarios:
        valor, detalle = _calcular_dimension(
            omoe, terminales, escenarios, valores, debug_logs,
        )
        return valor, detalle, None

    from .evaluacion_service import filter_escenarios_con_valores

    escenarios_candidatos = filter_escenarios_con_valores(
        escenarios, terminales, valores,
    )
    omitidos = [
        esc.nombre for esc in escenarios
        if esc.id not in {c.id for c in escenarios_candidatos}
    ]
    if omitidos:
        _sim_log(
            debug_logs,
            '  omitidos sin datos de evaluación: ' + ', '.join(
                f'«{n}»' for n in omitidos if n
            ),
        )

    por_escenario: list[dict[str, Any]] = []
    for esc in escenarios_candidatos:
        valor_esc, _det = _calcular_dimension(
            omoe, terminales, [esc], valores, debug_logs,
        )
        por_escenario.append({
            'escenario_id': esc.id,
            'nombre': esc.nombre or f'Escenario {esc.id}',
            'valor': _round6(valor_esc),
            # Conserva la traza para informes científicos y auditoría. La
            # selección final sigue usando únicamente ``valor``.
            'detalle': _det,
        })
        _sim_log(
            debug_logs,
            f'  escenario «{esc.nombre}» valor dimensión={valor_esc:.6f}',
        )

    if agregacion == ESCENARIO_AGREG_MINIMO_MEJOR:
        best = min(por_escenario, key=lambda row: float(row['valor']))
        formula = 'Escenario con menor valor agregado (mínimo-mejor, Eq. 22)'
    elif agregacion == ESCENARIO_AGREG_MAXIMO_MEJOR:
        best = max(por_escenario, key=lambda row: float(row['valor']))
        formula = 'Escenario con mayor valor agregado (máximo-mejor, Eq. 22)'
    elif peor_caso_selecciona_maximo(omoe=omoe):
        best = max(por_escenario, key=lambda row: float(row['valor']))
        formula = 'Escenario más adverso — máx (peor caso costo/riesgo, Eq. 23)'
    else:
        best = min(por_escenario, key=lambda row: float(row['valor']))
        formula = 'Escenario más adverso — mín (peor caso beneficio, Eq. 23)'

    escenario_resumen = {
        'escenario_agregacion': agregacion,
        'escenario_elegido_id': best['escenario_id'],
        'escenario_elegido': best['nombre'],
        'valor_bajo_escenario': best['valor'],
        'formula': formula,
        'por_escenario': por_escenario,
        'escenarios_omitidos_sin_datos': omitidos,
    }
    _sim_log(
        debug_logs,
        f'  ⇒ escenario elegido «{best["nombre"]}» valor={best["valor"]} ({agregacion})',
    )

    best_esc = next(
        (esc for esc in escenarios_candidatos if esc.id == best['escenario_id']),
        escenarios_candidatos[0],
    )
    _, detalle = _calcular_dimension(
        omoe, terminales, [best_esc], valores, debug_logs,
    )

    if isinstance(detalle, dict):
        detalle = {**detalle, 'escenario_resumen': escenario_resumen}
        trace = detalle.get('trace')
        if isinstance(trace, dict):
            detalle['trace'] = {
                **trace,
                'escenario_elegido': best['nombre'],
                'escenario_agregacion': agregacion,
                'escenario_resumen': escenario_resumen,
            }

    return float(best['valor']), detalle, escenario_resumen


def _rollup_alternativas_simulacion(
    proyecto: Proyecto,
    *,
    debug_logs: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Utilidades por alternativa y dimensión (entrada al pipeline MADM)."""
    schema = build_evaluacion_schema(proyecto)
    alternativas = list(Alternativa.objects.filter(proyecto=proyecto).order_by('id'))
    resultados = []

    _sim_log(debug_logs, f'=== ROLLUP proyecto_id={proyecto.id} ===')

    for alt in alternativas:
        valores = load_valores_map(alt.id)
        _sim_log(debug_logs, f'--- Alternativa «{alt.nombre}» id={alt.id} ---')
        dimensiones_out = []
        dim_scores = []

        for dim in schema['dimensiones']:
            omoe = Omoe.objects.get(pk=dim['omoe_id'])
            escenarios = escenarios_for_dimension(omoe)
            terminales = collect_terminal_nodes_for_omoe(omoe)
            valor_dim, detalle, escenario_resumen = _calcular_dimension_con_resumen_escenarios(
                omoe, terminales, escenarios, valores, debug_logs,
            )
            agregacion = getattr(omoe, 'escenario_agregacion', None) or 'compensatorio'
            dim_scores.append(valor_dim)
            dimensiones_out.append({
                'omoe_id': dim['omoe_id'],
                'omoe_nombre': dim['omoe_nombre'],
                'rama_evaluacion': dim.get('rama_evaluacion'),
                'escenario_agregacion': agregacion,
                'escenario_elegido': (
                    escenario_resumen.get('escenario_elegido') if escenario_resumen else None
                ),
                'escenarios_resumen': escenario_resumen,
                'valor': round(valor_dim, 6),
                'detalle': detalle,
            })

        global_val = sum(dim_scores) / len(dim_scores) if dim_scores else 0.0
        dim_count = len(dim_scores)
        resultados.append({
            'id': alt.id,
            'nombre': alt.nombre,
            'apodo': alt.apodo or '',
            'dimensiones': dimensiones_out,
            'valor_global': _round6(global_val),
            'global_trace': {
                'kind': 'global',
                'nombre': 'Valor global',
                'valor': _round6(global_val),
                'formula': 'Promedio aritmético de los valores por dimensión',
                'hijos': [
                    {
                        'nombre': d['omoe_nombre'],
                        'valor': d['valor'],
                        'peso': _round6(1 / dim_count) if dim_count else 0,
                        'contribucion': _round6(d['valor'] / dim_count) if dim_count else 0,
                    }
                    for d in dimensiones_out
                ],
            },
        })

    dimensiones_meta = [
        {
            'omoe_id': d['omoe_id'],
            'nombre': d['omoe_nombre'],
            'rama_evaluacion': d.get('rama_evaluacion'),
        }
        for d in schema['dimensiones']
    ]
    return resultados, dimensiones_meta


def preview_simulacion(
    proyecto: Proyecto,
    opciones: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Vista previa en vivo: matrices y resultados parciales del pipeline."""
    validacion = validar_simulacion(proyecto)
    if not validacion['ok']:
        total = validacion['total_faltantes']
        return {
            'ok': False,
            'faltantes': validacion['faltantes'],
            'total_faltantes': total,
            'pasos': [{
                'id': 'entrada',
                'orden': 1,
                'estado': 'bloqueado',
                'titulo': 'Matriz de utilidades',
                'descripcion': (
                    'Agregación de utilidades por dimensión desde el árbol de criterios '
                    '(paso previo al notebook 01).'
                ),
                'notebook': 'app',
                'error': (
                    f'Complete {total} valor{"es" if total != 1 else ""} '
                    f'de evaluación pendiente{"s" if total != 1 else ""}.'
                ),
            }],
        }

    from .madm_pipeline import (
        build_matrix_from_rollups,
        filter_dimensiones_meta,
        preview_madm_pipeline,
    )

    try:
        resultados, dimensiones_meta = _rollup_alternativas_simulacion(proyecto)
        filtered_meta = filter_dimensiones_meta(dimensiones_meta, opciones)
        matrix, alt_names, dim_names, directions = build_matrix_from_rollups(
            resultados,
            dimensiones_meta,
            opciones,
        )
        preview = preview_madm_pipeline(
            matrix,
            alt_names,
            dim_names,
            directions,
            opciones,
            dimensiones_meta=filtered_meta,
        )
    except ValidationError as exc:
        detail = exc.messages[0] if getattr(exc, 'messages', None) else str(exc)
        return {'ok': False, 'detail': detail, 'pasos': []}
    except Exception as exc:
        return {'ok': False, 'detail': str(exc), 'pasos': []}

    return {
        'ok': True,
        'pasos': preview.get('pasos', []),
    }


def calcular_simulacion(
    proyecto: Proyecto,
    opciones: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Rollup por dimensión y ranking MADM (Pareto → normalización → pesos → método)."""
    validacion = validar_simulacion(proyecto)
    if not validacion['ok']:
        return {
            'ok': False,
            'faltantes': validacion['faltantes'],
            'total_faltantes': validacion['total_faltantes'],
        }

    opts = opciones or {}
    solo_matriz = bool(opts.get('solo_matriz'))

    debug_logs: list[str] = []

    _sim_log(debug_logs, f'=== INICIO SIMULACIÓN proyecto_id={proyecto.id} ===')

    resultados, dimensiones_meta = _rollup_alternativas_simulacion(
        proyecto, debug_logs=debug_logs,
    )

    if solo_matriz:
        from .madm_pipeline import filter_dimensiones_meta, filter_rollups_by_dimensions

        active_meta = filter_dimensiones_meta(dimensiones_meta, opts)
        resultados_filtrados = filter_rollups_by_dimensions(resultados, active_meta)
        _sim_log(debug_logs, 'Modo solo matriz: se omite el pipeline MADM.')
        return {
            'ok': True,
            'proyecto_id': proyecto.id,
            'alternativas': resultados_filtrados,
            'metodo': 'solo_matriz',
            'solo_matriz': True,
            'descripcion': (
                'Comparación solo con matriz de utilidades por dimensión (agregación '
                'del árbol de criterios); sin normalización, Pareto ni ranking MADM.'
            ),
            'opciones_calculo': {
                'solo_matriz': True,
                'dimensiones_normalizar': [m['nombre'] for m in active_meta],
            },
            'debug_logs': debug_logs,
        }

    from .madm_pipeline import (
        apply_madm_ranking_to_alternativas,
        build_matrix_from_rollups,
        filter_dimensiones_meta,
        preview_madm_pipeline,
        run_madm_pipeline,
    )

    filtered_meta = filter_dimensiones_meta(dimensiones_meta, opciones)
    matrix, alt_names, dim_names, directions = build_matrix_from_rollups(
        resultados,
        dimensiones_meta,
        opciones,
    )
    pipeline_result = run_madm_pipeline(
        matrix,
        alt_names,
        dim_names,
        directions,
        opciones,
        dimensiones_meta=filtered_meta,
    )
    preview = preview_madm_pipeline(
        matrix,
        alt_names,
        dim_names,
        directions,
        opciones,
        dimensiones_meta=filtered_meta,
    )
    resultados = apply_madm_ranking_to_alternativas(resultados, pipeline_result)

    return {
        'ok': True,
        'proyecto_id': proyecto.id,
        'alternativas': resultados,
        'metodo': 'madm_pipeline',
        'descripcion': (
            'Utilidad por dimensión (árbol de criterios); luego '
            'Pareto opcional, normalización, pesos y método MADM.'
        ),
        'opciones_calculo': pipeline_result.get('opciones'),
        'pareto': pipeline_result.get('pareto'),
        'normalizacion': pipeline_result.get('normalizacion'),
        'pesos': pipeline_result.get('pesos'),
        'madm': pipeline_result.get('madm'),
        'matriz_original': matrix,
        'pasos': preview.get('pasos', []),
        'debug_logs': debug_logs,
    }


def _resultado_para_guardar(resultado: dict[str, Any]) -> dict[str, Any]:
    data = dict(resultado)
    data.pop('debug_logs', None)
    return data


_MADM_LABELS = {
    'topsis': 'TOPSIS',
    'wsm': 'WSM',
    'moora': 'MOORA',
    'vikor': 'VIKOR',
    'copras': 'COPRAS',
    'aras': 'ARAS',
    'codas': 'CODAS',
    'edas': 'EDAS',
    'mabac': 'MABAC',
    'marcos': 'MARCOS',
    'waspas': 'WASPAS',
    'wpm': 'WPM',
}

_PESOS_LABELS = {
    'equal_weights': 'Pesos iguales',
    'user_defined_weights': 'Pesos usuario',
    'entropy': 'Entropía',
    'critic': 'CRITIC',
}


def resumen_opciones_calculo(opciones: dict[str, Any] | None) -> str:
    """Texto corto para identificar la configuración de un cálculo."""
    if not opciones:
        return ''
    if opciones.get('solo_matriz'):
        return 'Comparación solo con matriz de utilidades'
    madm = _MADM_LABELS.get(opciones.get('metodo_madm', ''), opciones.get('metodo_madm', 'MADM'))
    pesos = _PESOS_LABELS.get(
        opciones.get('metodo_pesos', ''),
        opciones.get('metodo_pesos', 'Pesos'),
    )
    pareto = 'Pareto' if opciones.get('aplicar_pareto') else 'Sin Pareto'
    return f'{madm} · {pesos} · {pareto}'


def save_simulacion_historial(
    proyecto: Proyecto,
    user,
    resultado: dict[str, Any],
    *,
    nombre: str = '',
) -> 'SimulacionHistorial':
    from decimal import Decimal

    from .models import SimulacionHistorial

    alts = resultado.get('alternativas') or []
    ganador = next((a for a in alts if not a.get('excluida_pareto')), alts[0] if alts else {})
    nombre_limpio = (nombre or '').strip()
    if not nombre_limpio:
        num = SimulacionHistorial.objects.filter(proyecto=proyecto).count() + 1
        nombre_limpio = f'Cálculo {num}'

    vg_raw = ganador.get('valor_global')
    return SimulacionHistorial.objects.create(
        proyecto=proyecto,
        creado_por=user if getattr(user, 'is_authenticated', False) else None,
        nombre=nombre_limpio,
        titulo=nombre_limpio,
        resultado=_resultado_para_guardar(resultado),
        ganador_nombre=ganador.get('nombre', '') or '',
        ganador_valor_global=(
            Decimal(str(vg_raw)) if vg_raw is not None else None
        ),
        num_alternativas=len(alts),
    )


def list_simulacion_historial(proyecto: Proyecto) -> list[dict[str, Any]]:
    from .models import SimulacionHistorial

    rows = list(SimulacionHistorial.objects.filter(proyecto=proyecto))
    items = []
    for row in rows:
        creador = None
        if row.creado_por:
            creador = row.creado_por.get_full_name() or row.creado_por.username
        opciones = (row.resultado or {}).get('opciones_calculo') or {}
        nombre = (row.nombre or row.titulo or '').strip() or f'Cálculo #{row.id}'
        items.append({
            'id': row.id,
            'nombre': nombre,
            'titulo': row.titulo,
            'resumen_opciones': resumen_opciones_calculo(opciones),
            'ganador_nombre': row.ganador_nombre,
            'ganador_valor_global': (
                float(row.ganador_valor_global)
                if row.ganador_valor_global is not None
                else None
            ),
            'num_alternativas': row.num_alternativas,
            'fecha_creacion': row.fecha_creacion.isoformat(),
            'creado_por': creador,
        })
    return items


def get_simulacion_historial(
    proyecto: Proyecto,
    historial_id: int,
) -> dict[str, Any]:
    from .models import SimulacionHistorial

    row = SimulacionHistorial.objects.get(pk=historial_id, proyecto=proyecto)
    nombre = (row.nombre or row.titulo or '').strip() or f'Cálculo #{row.id}'
    return {
        'id': row.id,
        'nombre': nombre,
        'titulo': row.titulo,
        'fecha_creacion': row.fecha_creacion.isoformat(),
        'resultado': row.resultado,
    }


def delete_simulacion_historial(proyecto: Proyecto, historial_id: int) -> bool:
    from .models import SimulacionHistorial

    deleted, _ = SimulacionHistorial.objects.filter(
        pk=historial_id,
        proyecto=proyecto,
    ).delete()
    return deleted > 0
