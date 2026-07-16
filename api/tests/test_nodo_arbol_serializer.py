"""Validaciones del serializer del árbol flexible."""
from django.test import TestCase

from api.arbol_nivel_service import ensure_all_ramas_niveles, reordenar_nodos_arbol
from api.models import NodoArbol, Omoe, Proyecto, ProyectoNivelArbol
from api.nodo_arbol_serializers import NodoArbolSerializer, build_hijos_cache, serialize_nodo_roots


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

    def test_nuevo_nodo_queda_al_final_por_orden_creacion(self):
        nivel = ProyectoNivelArbol.objects.get(
            proyecto=self.proyecto,
            rama_evaluacion='omoc',
            orden=1,
        )
        names = ['Zebra', 'Alpha', 'Mike']
        created = []
        for name in names:
            ser = NodoArbolSerializer(data={
                'omoe': self.omoc.id,
                'tipo_nivel': nivel.id,
                'nombre': name,
            })
            self.assertTrue(ser.is_valid(), ser.errors)
            created.append(ser.save())

        # Orden de creación, no alfabético: Zebra, Alpha, Mike
        self.assertEqual([n.orden_visual for n in created], [1, 2, 3])
        roots = serialize_nodo_roots(self.omoc)
        self.assertEqual([r['nombre'] for r in roots], names)

    def test_reordenar_hermanos_y_autocorregir_empates(self):
        nivel = ProyectoNivelArbol.objects.get(
            proyecto=self.proyecto,
            rama_evaluacion='omoc',
            orden=1,
        )
        a = NodoArbol.objects.create(
            omoe=self.omoc, tipo_nivel=nivel, nombre='A', orden_visual=0,
        )
        b = NodoArbol.objects.create(
            omoe=self.omoc, tipo_nivel=nivel, nombre='B', orden_visual=0,
        )
        c = NodoArbol.objects.create(
            omoe=self.omoc, tipo_nivel=nivel, nombre='C', orden_visual=0,
        )
        # Empates en 0 → al cargar se renumeran por id (creación).
        cache = build_hijos_cache(self.omoc.id)
        roots = cache[None]
        self.assertEqual([n.id for n in roots], [a.id, b.id, c.id])
        self.assertEqual([n.orden_visual for n in roots], [1, 2, 3])

        reordenar_nodos_arbol(roots, [c.id, a.id, b.id])
        roots2 = serialize_nodo_roots(self.omoc)
        self.assertEqual([r['nombre'] for r in roots2], ['C', 'A', 'B'])
