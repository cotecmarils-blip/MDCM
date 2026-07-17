"""
Catálogo de «Familias de funciones aplicadas» (etiquetas de la UI).

Cada entrada usa el **nombre visible** del selector en el árbol de criterios
(`FAMILIA_FUNCIONES_POR_TIPO` en `mop_criterio_choices.py`).

Implementación:
  - `api/mcdm_utils.py` → `build_utility_function()` traduce familia + parámetros.
  - `pyDecisionMaking/src/utility_functions.py` → evalúa u(x).

Leyenda de estado:
  - ``implementada`` — mapeo explícito en `build_utility_function`.
  - ``lineal`` — usa `LinearUtilityFunction` (normalización L–U).
  - ``discreta`` — usa `DiscreteUtilityFunction`.
  - ``pendiente`` — parámetros en UI; ecuación específica aún no implementada.
"""

from __future__ import annotations

from typing import Any

# Etiquetas UI (segundo elemento de cada tupla en mop_criterio_choices).
FAMILIA_ETIQUETAS_UI: dict[str, str] = {
    'razon_relativa': 'Razón relativa',
    'min_max': 'Min-max',
    'meta_saturada': 'Meta saturada',
    'umbral_creciente': 'Umbral creciente',
    'exponencial_creciente': 'Exponencial creciente',
    'razon_inversa': 'Razón inversa',
    'min_max_decreciente': 'Min-max decreciente',
    'umbral_decreciente': 'Umbral decreciente',
    'exponencial_decreciente': 'Exponencial decreciente',
    'logistica_decreciente': 'Logística decreciente',
    'umbral_veto': 'Umbral de veto',
    'funcion_saturada': 'Función saturada',
    'distancia_meta': 'Distancia a meta',
    'triangular': 'Triangular',
    'trapezoidal': 'Trapezoidal',
    'distancia_ideal': 'Distancia al ideal',
    'escalas_discretas': 'Escalas discretas',
    'funciones_tramos': 'Funciones por tramos',
    'tablas_equivalencia': 'Tablas de equivalencia',
}

FAMILIA_FUNCIONES_DOC: dict[str, dict[str, Any]] = {
    'razon_relativa': {
        'etiqueta_ui': 'Razón relativa',
        'tipo_criterio': 'Más es mejor',
        'parametros': ['U'],
        'formula': (
            'Razón (ratio) respecto a la referencia U: u(x) = x/U, recortada a [0, 1]. '
            'Preserva proporciones (no resta L); distinta de min–max.'
        ),
        'clase_pydecision': 'RatioUtilityFunction',
        'estado': 'implementada',
    },
    'min_max': {
        'etiqueta_ui': 'Min-max',
        'tipo_criterio': 'Más es mejor',
        'parametros': ['L', 'U'],
        'formula': (
            'Normalización min–max: u(x) = (x−L)/(U−L) entre umbral L y meta U.'
        ),
        'clase_pydecision': 'LinearUtilityFunction',
        'estado': 'lineal',
    },
    'meta_saturada': {
        'etiqueta_ui': 'Meta saturada',
        'tipo_criterio': 'Más es mejor',
        'parametros': ['T'],
        'formula': (
            'Curva logarítmica saturada hacia la meta T (parámetro de forma k←T o S). '
            'u(x) = log(1 + k·n(x)) / log(1 + k), con n(x) posición normalizada en [L, U].'
        ),
        'clase_pydecision': 'LogarithmicUtilityFunction',
        'estado': 'implementada',
        'notas': 'L y U se toman de valor_umbral / valor_meta si no están en parámetros.',
    },
    'umbral_creciente': {
        'etiqueta_ui': 'Umbral creciente',
        'tipo_criterio': 'Más es mejor',
        'parametros': ['L', 'U'],
        'formula': 'Lineal creciente: u=0 en L, u=1 en U.',
        'clase_pydecision': 'LinearUtilityFunction',
        'estado': 'lineal',
    },
    'exponencial_creciente': {
        'etiqueta_ui': 'Exponencial creciente',
        'tipo_criterio': 'Más es mejor',
        'parametros': ['L', 'U', 'k'],
        'formula': (
            'u(x) = (e^(k·n(x)) − 1) / (e^k − 1), con n(x)=(x−L)/(U−L) y k pendiente.'
        ),
        'clase_pydecision': 'ExponentialUtilityFunction',
        'estado': 'implementada',
    },
    'razon_inversa': {
        'etiqueta_ui': 'Razón inversa',
        'tipo_criterio': 'Menos es mejor',
        'parametros': ['L'],
        'formula': (
            'Razón inversa respecto a L (mejor = menor): u(x) = L/x, recortada a [0, 1]. '
            'Preserva proporciones; distinta de min–max decreciente.'
        ),
        'clase_pydecision': 'RatioUtilityFunction',
        'estado': 'implementada',
    },
    'min_max_decreciente': {
        'etiqueta_ui': 'Min-max decreciente',
        'tipo_criterio': 'Menos es mejor',
        'parametros': ['L', 'U'],
        'formula': 'Min–max invertido (decreciente) entre L y U.',
        'clase_pydecision': 'LinearUtilityFunction',
        'estado': 'lineal',
    },
    'umbral_decreciente': {
        'etiqueta_ui': 'Umbral decreciente',
        'tipo_criterio': 'Menos es mejor',
        'parametros': ['L', 'U'],
        'formula': 'Lineal decreciente: u=1 en L, u=0 en U.',
        'clase_pydecision': 'LinearUtilityFunction',
        'estado': 'lineal',
    },
    'exponencial_decreciente': {
        'etiqueta_ui': 'Exponencial decreciente',
        'tipo_criterio': 'Menos es mejor / penalización',
        'parametros': ['k', 'L (opc.)', 'U (opc.)'],
        'formula': (
            'Exponencial con sentido decreciente: misma forma que Exponencial creciente '
            'con is_increasing=False.'
        ),
        'clase_pydecision': 'ExponentialUtilityFunction',
        'estado': 'implementada',
    },
    'logistica_decreciente': {
        'etiqueta_ui': 'Logística decreciente',
        'tipo_criterio': 'Menos es mejor, con penalización potencialmente no lineal',
        'parametros': ['x0', 'k'],
        'formula': (
            'Sigmoide (logística) en espacio normalizado: '
            'u(x) = σ(n(x)) reescalada, con punto de inflexión x0 y pendiente k.'
        ),
        'clase_pydecision': 'SigmoidalUtilityFunction',
        'estado': 'implementada',
    },
    'umbral_veto': {
        'etiqueta_ui': 'Umbral de veto',
        'tipo_criterio': 'Menos es mejor, con penalización potencialmente no lineal',
        'parametros': ['V'],
        'formula': (
            'Decreciente con veto duro: u=1 en L, baja linealmente a 0 en V; '
            'u=0 para x ≥ V (veto absoluto).'
        ),
        'clase_pydecision': 'VetoUtilityFunction',
        'estado': 'implementada',
    },
    'funcion_saturada': {
        'etiqueta_ui': 'Función saturada',
        'tipo_criterio': 'Existe un valor objetivo',
        'parametros': ['L', 'S'],
        'formula': (
            'Logarítmica saturada con saturación S como parámetro de forma k.'
        ),
        'clase_pydecision': 'LogarithmicUtilityFunction',
        'estado': 'implementada',
    },
    'distancia_meta': {
        'etiqueta_ui': 'Distancia a meta',
        'tipo_criterio': 'Existe un valor objetivo',
        'parametros': ['T', 'R'],
        'formula': (
            'Cercanía a la meta T: u(x) = 1 − |x−T|/R, recortada a [0, 1]. '
            'Máxima en T; decrece con la distancia dentro del radio R.'
        ),
        'clase_pydecision': 'DistanceUtilityFunction',
        'estado': 'implementada',
    },
    'triangular': {
        'etiqueta_ui': 'Triangular',
        'tipo_criterio': 'Existe un intervalo o punto óptimo',
        'parametros': ['L', 'M', 'U'],
        'formula': (
            'Pico triangular: u=0 en L y U, u=1 en el óptimo M; rampas lineales a cada lado.'
        ),
        'clase_pydecision': 'TriangularUtilityFunction',
        'estado': 'implementada',
    },
    'trapezoidal': {
        'etiqueta_ui': 'Trapezoidal',
        'tipo_criterio': 'Existe un intervalo o punto óptimo',
        'parametros': ['L', 'M1', 'M2', 'U'],
        'formula': (
            'Meseta óptima: u=0 en L y U, sube a 1 en M1, meseta u=1 en [M1, M2], baja a 0 en U.'
        ),
        'clase_pydecision': 'TrapezoidalUtilityFunction',
        'estado': 'implementada',
    },
    'distancia_ideal': {
        'etiqueta_ui': 'Distancia al ideal',
        'tipo_criterio': 'Existe un intervalo o punto óptimo',
        'parametros': ['I', 'dmax (opc.)'],
        'formula': (
            'Cercanía al ideal I: u(x) = 1 − |x−I|/dmax, recortada a [0, 1]. '
            'Máxima en I; decrece con la distancia.'
        ),
        'clase_pydecision': 'DistanceUtilityFunction',
        'estado': 'implementada',
    },
    'escalas_discretas': {
        'etiqueta_ui': 'Escalas discretas',
        'tipo_criterio': 'Preferencia por categorías',
        'parametros': ['categorias_opciones', 'categorias_utilidad'],
        'formula': 'u(x) = utilidad asignada a la categoría x (tabla categoría → u).',
        'clase_pydecision': 'DiscreteUtilityFunction',
        'estado': 'discreta',
    },
    'funciones_tramos': {
        'etiqueta_ui': 'Funciones por tramos',
        'tipo_criterio': 'Preferencia por categorías',
        'parametros': ['puntos_corte', 'regla_por_tramo'],
        'formula': (
            'Pendiente: utilidad definida por tramos entre puntos de corte. '
            'Parámetros en UI; evaluación por tramos no implementada aún.'
        ),
        'clase_pydecision': None,
        'estado': 'pendiente',
    },
    'tablas_equivalencia': {
        'etiqueta_ui': 'Tablas de equivalencia',
        'tipo_criterio': 'Preferencia por categorías',
        'parametros': ['estados_opciones', 'equivalencias'],
        'formula': (
            'u(x) desde tabla estado → utilidad (mapa discreto), igual que Escalas discretas.'
        ),
        'clase_pydecision': 'DiscreteUtilityFunction',
        'estado': 'discreta',
    },
}


def etiqueta_familia(codigo: str) -> str:
    """Nombre visible en el selector «Familias de funciones aplicadas»."""
    return FAMILIA_ETIQUETAS_UI.get(codigo, codigo)


def doc_familia(codigo: str) -> dict[str, Any] | None:
    return FAMILIA_FUNCIONES_DOC.get(codigo)


def resumen_familia(codigo: str) -> str:
    """Texto corto para logs o mensajes de error."""
    doc = doc_familia(codigo)
    if not doc:
        return codigo
    return f"{doc['etiqueta_ui']} — {doc.get('formula', '')}"
