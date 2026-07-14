"""Categorías de agregación de escenarios por dimensión (metodología MDCM)."""

ESCENARIO_AGREG_COMPENSATORIO = 'compensatorio'
ESCENARIO_AGREG_MINIMO_MEJOR = 'minimo_mejor'
ESCENARIO_AGREG_MAXIMO_MEJOR = 'maximo_mejor'
ESCENARIO_AGREG_PEOR_CASO = 'peor_caso'
ESCENARIO_AGREG_INDEPENDIENTE = 'independiente'

ESCENARIO_AGREGACION_CHOICES = [
    (ESCENARIO_AGREG_COMPENSATORIO, 'Compensatorio (suma ponderada)'),
    (ESCENARIO_AGREG_MINIMO_MEJOR, 'Mínimo-mejor (escenario más favorable)'),
    (ESCENARIO_AGREG_MAXIMO_MEJOR, 'Máximo-mejor (escenario más favorable)'),
    (ESCENARIO_AGREG_PEOR_CASO, 'Peor caso (resolución robusta)'),
    (ESCENARIO_AGREG_INDEPENDIENTE, 'Independiente (sin agregación global)'),
]

ESCENARIO_AGREGACION_DEFAULT = ESCENARIO_AGREG_COMPENSATORIO

# Modos que evalúan cada escenario por separado y eligen uno (Eq. 22 / 23).
ESCENARIO_AGREG_SELECCION = frozenset({
    ESCENARIO_AGREG_MINIMO_MEJOR,
    ESCENARIO_AGREG_MAXIMO_MEJOR,
    ESCENARIO_AGREG_PEOR_CASO,
})


def peor_caso_selecciona_maximo(*, omoe=None, dim_ctx: dict | None = None) -> bool:
    """
    Eq. (23): peor caso = max para costo (y magnitudes adversas); min para beneficio.

    Usa el sentido del tipo de dimensión del catálogo cuando existe; si no,
    OMOC / valor bruto / OMOR → max; OMOE → min.
    """
    from .tipo_dimension_service import SENTIDO_MIN, sentido_optimizacion

    rama = None
    modo = None
    if dim_ctx:
        rama = dim_ctx.get('rama_evaluacion')
        modo = dim_ctx.get('modo_valor_terminal')
    if omoe is not None:
        rama = rama or getattr(omoe, 'rama_evaluacion', None)
        modo = modo or getattr(omoe, 'modo_valor_terminal', None)
    if modo == 'valor_bruto':
        return True
    if sentido_optimizacion(rama or 'omoe') == SENTIDO_MIN:
        return True
    return False
