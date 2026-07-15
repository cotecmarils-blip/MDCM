"""Permisos al crear recursos hijos de una alternativa."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from api.access import can_create_resource, resolve_create_stub, resolve_proyecto_id
from api.models import Alternativa, Caracteristica, Proyecto, ProyectoMembership

User = get_user_model()


class AlternativaStubAccessTests(TestCase):
    def setUp(self):
        self.proyecto = Proyecto.objects.create(nombre='Proyecto demo')
        self.alternativa = Alternativa.objects.create(
            proyecto=self.proyecto,
            nombre='Alt A',
        )
        self.gerente = User.objects.create_user(
            username='gerente',
            password='test-pass',
        )
        ProyectoMembership.objects.create(
            usuario=self.gerente,
            proyecto=self.proyecto,
            rol=ProyectoMembership.ROL_JEFE,
            activo=True,
        )

    def test_resolve_proyecto_id_desde_stub_alternativa(self):
        stub = Alternativa(id=self.alternativa.id)
        self.assertEqual(resolve_proyecto_id(stub), self.proyecto.id)

    def test_gerente_puede_crear_caracteristica(self):
        stub = resolve_create_stub(
            Caracteristica,
            {'alternativa': self.alternativa.id, 'plantilla': 1, 'dato': 'x'},
        )
        self.assertIsInstance(stub, Alternativa)
        self.assertTrue(can_create_resource(self.gerente, stub, 'caracteristica'))
