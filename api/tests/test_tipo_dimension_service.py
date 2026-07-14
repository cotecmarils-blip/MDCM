"""Tests for dynamic TipoDimension catalog."""
from django.core.exceptions import ValidationError
from django.test import TestCase

from api.models import TipoDimension
from api.tipo_dimension_service import (
    assert_codigo_activo,
    defaults_for_codigo,
    ensure_tipos_sistema,
    validar_codigo,
)


class TipoDimensionServiceTests(TestCase):
    def test_seed_sistema(self):
        ensure_tipos_sistema()
        codes = set(TipoDimension.objects.values_list('codigo', flat=True))
        self.assertTrue({'omoe', 'omoc', 'omor'}.issubset(codes))

    def test_defaults_omoc(self):
        ensure_tipos_sistema()
        d = defaults_for_codigo('omoc')
        self.assertEqual(d['modo_valor_terminal'], 'valor_bruto')
        self.assertEqual(d['sentido_optimizacion'], 'min')

    def test_custom_tipo_defaults(self):
        ensure_tipos_sistema()
        TipoDimension.objects.create(
            codigo='sostenibilidad',
            nombre='Sostenibilidad',
            sentido_optimizacion='max',
            escenario_agregacion_default='compensatorio',
            modo_valor_terminal_default='utilidad',
            orden=20,
            activo=True,
        )
        self.assertEqual(assert_codigo_activo('sostenibilidad'), 'sostenibilidad')
        d = defaults_for_codigo('sostenibilidad')
        self.assertEqual(d['sentido_optimizacion'], 'max')

    def test_invalid_codigo(self):
        with self.assertRaises(ValidationError):
            validar_codigo('1bad')
        with self.assertRaises(ValidationError):
            assert_codigo_activo('no_existe_xyz')
