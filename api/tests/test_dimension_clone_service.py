"""Tests for cloning / importing dimensions between projects."""
from decimal import Decimal

from django.test import TestCase

from api.arbol_nivel_service import ensure_all_ramas_niveles
from api.dimension_clone_service import (
    clonar_dimension_en_proyecto,
    listar_catalogo_dimensiones,
)
from api.models import NodoArbol, Omoe, Proyecto, ProyectoNivelArbol


class DimensionCloneServiceTests(TestCase):
    def setUp(self):
        self.src_proj = Proyecto.objects.create(nombre='Origen')
        self.dst_proj = Proyecto.objects.create(nombre='Destino')
        ensure_all_ramas_niveles(self.src_proj)
        ensure_all_ramas_niveles(self.dst_proj)

        self.src_omoe = Omoe.objects.create(
            proyecto=self.src_proj,
            nombre_modelo='Riesgos plantilla',
            codigo='OMOR-SRC',
            rama_evaluacion='omor',
            escenario_agregacion='minimo_mejor',
            modo_valor_terminal='utilidad',
        )
        nivel1 = ProyectoNivelArbol.objects.get(
            proyecto=self.src_proj, rama_evaluacion='omor', orden=1,
        )
        nivel2 = ProyectoNivelArbol.objects.get(
            proyecto=self.src_proj, rama_evaluacion='omor', orden=2,
        )
        self.root = NodoArbol.objects.create(
            omoe=self.src_omoe,
            parent=None,
            tipo_nivel=nivel1,
            nombre='Categoría A',
            peso=Decimal('100'),
            orden_visual=1,
        )
        self.leaf = NodoArbol.objects.create(
            omoe=self.src_omoe,
            parent=self.root,
            tipo_nivel=nivel2,
            nombre='Riesgo X',
            peso=Decimal('100'),
            orden_visual=1,
            familia_funciones='lineal',
            parametros_funcion={'L': 0, 'U': 1},
        )

    def test_clone_copies_tree_and_settings(self):
        result = clonar_dimension_en_proyecto(self.src_omoe, self.dst_proj)
        dest = Omoe.objects.get(pk=result['omoe_id'])
        self.assertEqual(dest.proyecto_id, self.dst_proj.id)
        self.assertEqual(dest.rama_evaluacion, 'omor')
        self.assertEqual(dest.escenario_agregacion, 'minimo_mejor')
        self.assertEqual(result['nodos_copiados'], 2)
        self.assertEqual(NodoArbol.objects.filter(omoe=dest).count(), 2)
        leaf = NodoArbol.objects.get(omoe=dest, nombre='Riesgo X')
        self.assertEqual(leaf.parent.nombre, 'Categoría A')
        self.assertEqual(leaf.familia_funciones, 'lineal')
        self.assertEqual(leaf.parametros_funcion.get('L'), 0)

    def test_clone_same_project_gets_copia_suffix(self):
        result = clonar_dimension_en_proyecto(self.src_omoe, self.src_proj)
        dest = Omoe.objects.get(pk=result['omoe_id'])
        self.assertIn('(copia)', dest.nombre_modelo)
        self.assertEqual(NodoArbol.objects.filter(omoe=dest).count(), 2)

    def test_catalog_lists_accessible(self):
        items = listar_catalogo_dimensiones(
            proyecto_ids=[self.src_proj.id, self.dst_proj.id],
            excluir_proyecto_id=self.dst_proj.id,
            incluir_proyecto_actual=True,
        )
        ids = {i['omoe_id'] for i in items}
        self.assertIn(self.src_omoe.id, ids)
