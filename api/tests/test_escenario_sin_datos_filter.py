from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from api.evaluacion_service import (
    filter_escenarios_con_valores,
    valor_key,
)
from api.informe_word_service import _escenario_informe_costos_for_omoe


class FilterEscenariosSinDatosTests(SimpleTestCase):
    def test_omite_escenarios_sin_valores(self):
        estandar = SimpleNamespace(id=1, nombre='Estandar')
        base = SimpleNamespace(id=2, nombre='Escenario base')
        terminales = [{'nivel': 'nodo_arbol', 'nodo_id': 10}]
        valores = {
            valor_key('nodo_arbol', 10, 2): '42.5',
        }
        filtrados = filter_escenarios_con_valores(
            [estandar, base], terminales, valores,
        )
        self.assertEqual([e.id for e in filtrados], [2])

    def test_si_todos_vacios_conserva_lista(self):
        a = SimpleNamespace(id=1, nombre='A')
        b = SimpleNamespace(id=2, nombre='B')
        terminales = [{'nivel': 'nodo_arbol', 'nodo_id': 10}]
        filtrados = filter_escenarios_con_valores([a, b], terminales, {})
        self.assertEqual([e.id for e in filtrados], [1, 2])


class EscenarioInformeCostosTests(SimpleTestCase):
    @patch('api.informe_word_service.Escenario')
    @patch('api.informe_word_service.ensure_escenario_estandar')
    def test_no_crea_estandar_si_ya_hay_escenario(self, mock_ensure, mock_esc_model):
        omoe = MagicMock()
        hermano = SimpleNamespace(id=9, nombre='Escenario base')
        qs = MagicMock()
        # Primer filter (nombre Estandar) → vacío
        # Segundo filter (todos) → hermano
        qs.filter.return_value = qs
        qs.first.side_effect = [None, hermano]
        qs.order_by.return_value = qs
        mock_esc_model.objects = qs

        result = _escenario_informe_costos_for_omoe(omoe)
        self.assertIs(result, hermano)
        mock_ensure.assert_not_called()
