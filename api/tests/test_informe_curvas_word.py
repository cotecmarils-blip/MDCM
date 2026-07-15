from io import BytesIO
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from docx import Document

from api.informe_word_service import build_informe_curvas_docx


class InformeCurvasWordTests(SimpleTestCase):
    @patch('api.curvas_utilidad_service.build_curvas_utilidad_export')
    def test_docx_bytes_without_curvas(self, mock_export):
        mock_export.return_value = {
            'proyecto_id': 1,
            'proyecto_nombre': 'Demo',
            'generado_en': '2026-07-13T12:00:00+00:00',
            'tipo': 'curvas_utilidad_finales',
            'dimensiones': [],
        }
        proyecto = MagicMock()
        proyecto.id = 1
        proyecto.nombre = 'Demo'
        content = build_informe_curvas_docx(proyecto)
        self.assertIsInstance(content, (bytes, bytearray))
        self.assertGreater(len(content), 1000)
        self.assertTrue(content[:2] == b'PK')

    @patch('api.curvas_utilidad_service.build_curvas_utilidad_export')
    def test_docx_with_curvas_table(self, mock_export):
        mock_export.return_value = {
            'proyecto_id': 1,
            'proyecto_nombre': 'Demo',
            'generado_en': '2026-07-13T12:00:00+00:00',
            'tipo': 'curvas_utilidad_finales',
            'dimensiones': [
                {
                    'omoe_id': 10,
                    'omoe_nombre': 'Efectividad',
                    'rama_evaluacion': 'omoe',
                    'modo_valor_terminal': 'utilidad',
                    'escenario_agregacion': 'compensatorio',
                    'curvas': [
                        {
                            'terminal_nombre': 'Velocidad',
                            'escenario_nombre': 'Misión 1',
                            'escenario_label': 'M1',
                            'familia_funciones': 'min_max',
                            'constantes_display': 'L=0, U=30',
                            'unidad': 'kn',
                        },
                    ],
                },
            ],
        }
        proyecto = MagicMock()
        proyecto.id = 1
        proyecto.nombre = 'Demo'
        content = build_informe_curvas_docx(proyecto)
        self.assertTrue(content[:2] == b'PK')
        document = Document(BytesIO(content))
        table_text = [
            cell.text
            for table in document.tables
            for row in table.rows
            for cell in row.cells
        ]
        self.assertIn('Misión 1', table_text)
        self.assertNotIn('M1', table_text)
