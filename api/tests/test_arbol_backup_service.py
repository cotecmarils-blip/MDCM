"""Tests for serialize/rebuild of dimension trees (backups + JSON import/export)."""
from decimal import Decimal

from django.test import TestCase

from api.arbol_nivel_service import ensure_all_ramas_niveles
from api.dimension_clone_service import (
    rebuild_dimension_from_data,
    serialize_dimension,
)
from api.models import NodoArbol, Omoe, Proyecto, ProyectoNivelArbol


class ArbolBackupServiceTests(TestCase):
    def setUp(self):
        self.proj = Proyecto.objects.create(nombre='Origen')
        self.dst = Proyecto.objects.create(nombre='Destino')
        ensure_all_ramas_niveles(self.proj)
        ensure_all_ramas_niveles(self.dst)

        self.omoe = Omoe.objects.create(
            proyecto=self.proj,
            nombre_modelo='Efectividad',
            codigo='OMOE-1',
            rama_evaluacion='omoe',
            escenario_agregacion='promedio',
            modo_valor_terminal='utilidad',
        )
        nivel1 = ProyectoNivelArbol.objects.get(
            proyecto=self.proj, rama_evaluacion='omoe', orden=1,
        )
        nivel2 = ProyectoNivelArbol.objects.get(
            proyecto=self.proj, rama_evaluacion='omoe', orden=2,
        )
        self.root = NodoArbol.objects.create(
            omoe=self.omoe,
            parent=None,
            tipo_nivel=nivel1,
            nombre='Grupo A',
            peso=Decimal('60'),
            orden_visual=1,
        )
        self.leaf = NodoArbol.objects.create(
            omoe=self.omoe,
            parent=self.root,
            tipo_nivel=nivel2,
            nombre='Criterio X',
            peso=Decimal('100'),
            orden_visual=1,
            familia_funciones='razon_relativa',
            parametros_funcion={'U': 10},
            valor_umbral=Decimal('0.5000'),
            valor_meta=Decimal('9.5000'),
        )

    def test_serialize_shape(self):
        data = serialize_dimension(self.omoe)
        self.assertEqual(data['formato'], 'mdcm-arbol')
        self.assertEqual(data['omoe']['nombre_modelo'], 'Efectividad')
        self.assertEqual(data['omoe']['rama_evaluacion'], 'omoe')
        self.assertEqual(len(data['nodos']), 2)
        leaf = next(n for n in data['nodos'] if n['nombre'] == 'Criterio X')
        self.assertEqual(leaf['familia_funciones'], 'razon_relativa')
        self.assertEqual(leaf['parametros_funcion']['U'], 10)
        # Decimales serializados como str (JSON-safe).
        self.assertIsInstance(leaf['valor_umbral'], str)

    def test_roundtrip_rebuild_same_project(self):
        data = serialize_dimension(self.omoe)
        result = rebuild_dimension_from_data(data, self.proj)
        dest = Omoe.objects.get(pk=result['omoe_id'])
        self.assertEqual(result['nodos_copiados'], 2)
        self.assertEqual(dest.rama_evaluacion, 'omoe')
        self.assertEqual(dest.escenario_agregacion, 'promedio')
        leaf = NodoArbol.objects.get(omoe=dest, nombre='Criterio X')
        self.assertEqual(leaf.parent.nombre, 'Grupo A')
        self.assertEqual(leaf.familia_funciones, 'razon_relativa')
        self.assertEqual(leaf.parametros_funcion.get('U'), 10)
        self.assertEqual(leaf.valor_umbral, Decimal('0.5000'))

    def test_rebuild_into_other_project(self):
        data = serialize_dimension(self.omoe)
        result = rebuild_dimension_from_data(data, self.dst, nombre_modelo='Copia ENAP')
        dest = Omoe.objects.get(pk=result['omoe_id'])
        self.assertEqual(dest.proyecto_id, self.dst.id)
        self.assertEqual(dest.nombre_modelo, 'Copia ENAP')
        self.assertEqual(NodoArbol.objects.filter(omoe=dest).count(), 2)

    def test_rebuild_rejects_bad_payload(self):
        from django.core.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            rebuild_dimension_from_data({'formato': 'otro'}, self.proj)
        with self.assertRaises(ValidationError):
            rebuild_dimension_from_data({'omoe': {}}, self.proj)
