"""Opciones expuestas al frontend para el pipeline MADM."""

from .pareto_solver import DEFAULT_PARETO_EPSILON

NORMALIZATION_METHODS = [
    {
        'value': 'directional_minmax',
        'label': 'Min-max direccional',
        'description': 'Escala [0,1] según dirección del criterio (costo/beneficio).',
    },
    {
        'value': 'vector',
        'label': 'Vectorial',
        'description': 'Divide por la norma euclídea de cada columna.',
    },
    {
        'value': 'directional_vector',
        'label': 'Vectorial direccional',
        'description': 'Vectorial orientada: mayor valor = mejor en todos los criterios.',
    },
    {
        'value': 'sum',
        'label': 'Por suma',
        'description': 'Proporción respecto a la suma (costos vía inverso).',
    },
]

WEIGHT_METHODS = [
    {
        'value': 'equal_weights',
        'label': 'Pesos iguales',
        'description': '1/m en cada dimensión.',
    },
    {
        'value': 'user_defined_weights',
        'label': 'Pesos definidos por el usuario',
        'description': 'Porcentaje por dimensión; deben sumar 100 %.',
    },
    {
        'value': 'entropy',
        'label': 'Entropía',
        'description': 'Peso por diversidad de información (matriz no negativa).',
    },
    {
        'value': 'critic',
        'label': 'CRITIC',
        'description': 'Desviación estándar y conflicto entre criterios.',
    },
]

MADM_METHODS = [
    {'value': 'topsis', 'label': 'TOPSIS'},
    {'value': 'wsm', 'label': 'WSM (suma ponderada)'},
    {'value': 'moora', 'label': 'MOORA'},
    {'value': 'vikor', 'label': 'VIKOR'},
    {'value': 'copras', 'label': 'COPRAS'},
    {'value': 'aras', 'label': 'ARAS'},
    {'value': 'codas', 'label': 'CODAS'},
    {'value': 'edas', 'label': 'EDAS'},
    {'value': 'mabac', 'label': 'MABAC'},
    {'value': 'marcos', 'label': 'MARCOS'},
    {'value': 'waspas', 'label': 'WASPAS'},
    {'value': 'wpm', 'label': 'WPM'},
]


def rama_to_direction(rama: str) -> str:
    """Sentido MADM según catálogo de tipos (fallback: omoc/omor → min)."""
    from .tipo_dimension_service import sentido_optimizacion
    return sentido_optimizacion(rama)


def simulacion_opciones_payload(proyecto) -> dict:
    from .models import Alternativa, Omoe

    dimensiones = []
    for omoe in Omoe.objects.filter(proyecto=proyecto).order_by('orden', 'id'):
        nombre = omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.pk}'
        rama = getattr(omoe, 'rama_evaluacion', None) or 'omoe'
        dimensiones.append({
            'omoe_id': omoe.id,
            'nombre': nombre,
            'rama_evaluacion': rama,
            'direction': rama_to_direction(rama),
        })
    total_alternativas = Alternativa.objects.filter(proyecto=proyecto).count()
    return {
        'dimensiones': dimensiones,
        'total_alternativas': total_alternativas,
        'normalization_methods': NORMALIZATION_METHODS,
        'weight_methods': WEIGHT_METHODS,
        'madm_methods': MADM_METHODS,
        'defaults': {
            'aplicar_pareto': False,
            'pareto_epsilon': DEFAULT_PARETO_EPSILON,
            'normalizacion_metodo': 'directional_vector',
            'dimensiones_normalizar': [d['nombre'] for d in dimensiones],
            'metodo_pesos': 'equal_weights',
            'metodo_madm': 'topsis',
        },
    }
