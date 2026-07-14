"""Catálogo global de tipos de dimensión (dinámico; no fijo a OMOE/OMOC/OMOR)."""
from __future__ import annotations

import re

from django.core.exceptions import ValidationError

from .escenario_agregacion_choices import (
    ESCENARIO_AGREG_COMPENSATORIO,
    ESCENARIO_AGREG_MINIMO_MEJOR,
)
from .evaluacion_rama_choices import RAMA_OMOC, RAMA_OMOE, RAMA_OMOR
from .modo_valor_terminal_choices import MODO_VALOR_BRUTO, MODO_VALOR_UTILIDAD

CODIGO_RE = re.compile(r'^[a-z][a-z0-9_]{1,31}$')

SENTIDO_MAX = 'max'
SENTIDO_MIN = 'min'

TIPOS_SISTEMA_SEED = (
    {
        'codigo': RAMA_OMOE,
        'nombre': 'OMOE — Efectividad / desempeño',
        'descripcion': 'Dimensión de efectividad operativa (beneficio: mayor es mejor).',
        'sentido_optimizacion': SENTIDO_MAX,
        'escenario_agregacion_default': ESCENARIO_AGREG_COMPENSATORIO,
        'modo_valor_terminal_default': MODO_VALOR_UTILIDAD,
        'orden': 1,
        'es_sistema': True,
    },
    {
        'codigo': RAMA_OMOC,
        'nombre': 'OMOC — Costo',
        'descripcion': 'Dimensión de costos (menor es mejor; valor bruto típico).',
        'sentido_optimizacion': SENTIDO_MIN,
        'escenario_agregacion_default': ESCENARIO_AGREG_MINIMO_MEJOR,
        'modo_valor_terminal_default': MODO_VALOR_BRUTO,
        'orden': 2,
        'es_sistema': True,
    },
    {
        'codigo': RAMA_OMOR,
        'nombre': 'OMOR — Riesgo',
        'descripcion': 'Dimensión de riesgos (menor exposición es mejor).',
        'sentido_optimizacion': SENTIDO_MIN,
        'escenario_agregacion_default': ESCENARIO_AGREG_MINIMO_MEJOR,
        'modo_valor_terminal_default': MODO_VALOR_UTILIDAD,
        'orden': 3,
        'es_sistema': True,
    },
)


def normalizar_codigo(raw: str) -> str:
    return (raw or '').strip().lower().replace(' ', '_').replace('-', '_')


def validar_codigo(codigo: str) -> str:
    codigo = normalizar_codigo(codigo)
    if codigo == 'auto':
        raise ValidationError('El código «auto» está reservado.')
    if not CODIGO_RE.match(codigo):
        raise ValidationError(
            'Código inválido: use 2–32 caracteres, empiece con letra '
            '(solo a-z, 0-9 y _).'
        )
    return codigo


def ensure_tipos_sistema():
    from .models import TipoDimension

    for row in TIPOS_SISTEMA_SEED:
        TipoDimension.objects.update_or_create(
            codigo=row['codigo'],
            defaults={
                'nombre': row['nombre'],
                'descripcion': row['descripcion'],
                'sentido_optimizacion': row['sentido_optimizacion'],
                'escenario_agregacion_default': row['escenario_agregacion_default'],
                'modo_valor_terminal_default': row['modo_valor_terminal_default'],
                'orden': row['orden'],
                'activo': True,
                'es_sistema': True,
            },
        )


def listar_tipos_activos():
    from .models import TipoDimension

    ensure_tipos_sistema()
    return list(TipoDimension.objects.filter(activo=True).order_by('orden', 'codigo', 'id'))


def codigos_tipos_activos() -> list[str]:
    try:
        return [t.codigo for t in listar_tipos_activos()]
    except Exception:
        return [row['codigo'] for row in TIPOS_SISTEMA_SEED]


def get_tipo_by_codigo(codigo: str, *, ensure: bool = False):
    from .models import TipoDimension

    codigo = normalizar_codigo(codigo)
    if not codigo or codigo == 'auto':
        return None
    if ensure:
        ensure_tipos_sistema()
    try:
        return TipoDimension.objects.filter(codigo=codigo).first()
    except Exception:
        return None


def defaults_for_codigo(codigo: str) -> dict[str, str]:
    tipo = get_tipo_by_codigo(codigo)
    if tipo:
        return {
            'escenario_agregacion': tipo.escenario_agregacion_default or ESCENARIO_AGREG_COMPENSATORIO,
            'modo_valor_terminal': tipo.modo_valor_terminal_default or MODO_VALOR_UTILIDAD,
            'sentido_optimizacion': tipo.sentido_optimizacion or SENTIDO_MAX,
        }
    r = normalizar_codigo(codigo) or RAMA_OMOE
    for row in TIPOS_SISTEMA_SEED:
        if row['codigo'] == r:
            return {
                'escenario_agregacion': row['escenario_agregacion_default'],
                'modo_valor_terminal': row['modo_valor_terminal_default'],
                'sentido_optimizacion': row['sentido_optimizacion'],
            }
    return {
        'escenario_agregacion': ESCENARIO_AGREG_COMPENSATORIO,
        'modo_valor_terminal': MODO_VALOR_UTILIDAD,
        'sentido_optimizacion': SENTIDO_MAX,
    }


def sentido_optimizacion(codigo: str) -> str:
    return defaults_for_codigo(codigo)['sentido_optimizacion']


def assert_codigo_activo(codigo: str) -> str:
    codigo = validar_codigo(codigo)
    tipo = get_tipo_by_codigo(codigo, ensure=True)
    if tipo is None or not tipo.activo:
        raise ValidationError(
            f'El tipo de dimensión «{codigo}» no existe o está inactivo. '
            'Créelo en el catálogo global de tipos.'
        )
    return codigo
