"""Tests for meso escenario aggregation (Eq. 21–23)."""
from django.test import SimpleTestCase

from api.escenario_agregacion_choices import (
    ESCENARIO_AGREG_MAXIMO_MEJOR,
    ESCENARIO_AGREG_MINIMO_MEJOR,
    ESCENARIO_AGREG_PEOR_CASO,
    peor_caso_selecciona_maximo,
)
from api.simulacion_service import _aggregate_escenario_values


class PeorCasoSentidoTests(SimpleTestCase):
    def test_omoc_and_valor_bruto_use_max(self):
        self.assertTrue(peor_caso_selecciona_maximo(dim_ctx={
            'rama_evaluacion': 'omoc',
            'modo_valor_terminal': 'valor_bruto',
        }))

    def test_omor_uses_max(self):
        self.assertTrue(peor_caso_selecciona_maximo(dim_ctx={
            'rama_evaluacion': 'omor',
            'modo_valor_terminal': 'utilidad',
        }))

    def test_omoe_utilidad_uses_min(self):
        self.assertFalse(peor_caso_selecciona_maximo(dim_ctx={
            'rama_evaluacion': 'omoe',
            'modo_valor_terminal': 'utilidad',
        }))


class AggregateEscenarioValuesTests(SimpleTestCase):
    def setUp(self):
        self.rows = [
            {'nombre': 'A', 'u': 10.0},
            {'nombre': 'B', 'u': 30.0},
            {'nombre': 'C', 'u': 20.0},
        ]
        self.pairs = [(10.0, 50.0), (30.0, 30.0), (20.0, 20.0)]

    def test_minimo_mejor_picks_lowest(self):
        valor, formula, chosen = _aggregate_escenario_values(
            self.rows, self.pairs, ESCENARIO_AGREG_MINIMO_MEJOR,
        )
        self.assertEqual(valor, 10.0)
        self.assertEqual(chosen['nombre'], 'A')
        self.assertIn('mín', formula)

    def test_maximo_mejor_picks_highest(self):
        valor, _formula, chosen = _aggregate_escenario_values(
            self.rows, self.pairs, ESCENARIO_AGREG_MAXIMO_MEJOR,
        )
        self.assertEqual(valor, 30.0)
        self.assertEqual(chosen['nombre'], 'B')

    def test_peor_caso_cost_picks_max(self):
        valor, formula, chosen = _aggregate_escenario_values(
            self.rows,
            self.pairs,
            ESCENARIO_AGREG_PEOR_CASO,
            dim_ctx={'rama_evaluacion': 'omoc', 'modo_valor_terminal': 'valor_bruto'},
        )
        self.assertEqual(valor, 30.0)
        self.assertEqual(chosen['nombre'], 'B')
        self.assertIn('peor caso', formula)

    def test_peor_caso_benefit_picks_min(self):
        valor, formula, chosen = _aggregate_escenario_values(
            self.rows,
            self.pairs,
            ESCENARIO_AGREG_PEOR_CASO,
            dim_ctx={'rama_evaluacion': 'omoe', 'modo_valor_terminal': 'utilidad'},
        )
        self.assertEqual(valor, 10.0)
        self.assertEqual(chosen['nombre'], 'A')
        self.assertIn('peor caso', formula)
