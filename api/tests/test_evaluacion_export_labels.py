from django.test import SimpleTestCase

from api.evaluacion_service import build_import_label_map, export_label_for_column


class EvaluacionExportLabelTests(SimpleTestCase):
    def setUp(self):
        self.columna = {
            'key': 'nodo_arbol:1:10',
            'terminal_nombre': 'Velocidad',
            'escenario_nombre': 'Operación oceánica',
            'escenario_label': 'M2',
        }

    def test_export_usa_nombre_completo_del_escenario(self):
        self.assertEqual(
            export_label_for_column(self.columna),
            'Velocidad (Operación oceánica)',
        )

    def test_import_mantiene_compatibilidad_con_abreviatura_anterior(self):
        labels = build_import_label_map({'columnas': [self.columna]})
        self.assertEqual(
            labels['Velocidad (Operación oceánica)'],
            self.columna['key'],
        )
        self.assertEqual(labels['Velocidad (M2)'], self.columna['key'])
