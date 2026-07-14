"""Validaciones del serializer del árbol flexible."""
from django.test import TestCase

from api.arbol_nivel_service import ensure_all_ramas_niveles
from api.models import Omoe, Proyecto, ProyectoNivelArbol
from api.nodo_arbol_serializers import NodoArbolSerializer


class NodoArbolSerializerTests(TestCase):
    def setUp(self):
        self.proyecto = Proyecto.objects.create(nombre='Proyecto')
        ensure_all_ramas_niveles(self.proyecto)
        self.omoc = Omoe.objects.create(
            proyecto=self.proyecto,
            nombre_modelo='Costos',
            rama_evaluacion='omoc',
        )

    def test_traduce_nivel_omoe_al_equivalente_omoc(self):
        nivel_omoe = ProyectoNivelArbol.objects.get(
            proyecto=self.proyecto,
            rama_evaluacion='omoe',
            orden=1,
        )
        nivel_omoc = ProyectoNivelArbol.objects.get(
            proyecto=self.proyecto,
            rama_evaluacion='omoc',
            orden=1,
        )

        serializer = NodoArbolSerializer(data={
            'omoe': self.omoc.id,
            'tipo_nivel': nivel_omoe.id,
            'nombre': 'Costo de adquisición',
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        nodo = serializer.save()
        self.assertEqual(nodo.tipo_nivel_id, nivel_omoc.id)
        self.assertEqual(nodo.tipo_nivel.rama_evaluacion, 'omoc')
