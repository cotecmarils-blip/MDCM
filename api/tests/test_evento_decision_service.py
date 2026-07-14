from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from api.evento_decision_service import (
    activar_evento,
    cerrar_evento,
    consultar_auditoria,
    crear_evento,
    get_evento_activo,
    registrar_cambio,
)
from api.models import (
    EventoDecision,
    EventoDecisionRegistro,
    NodoArbol,
    Omoe,
    Proyecto,
    ProyectoNivelArbol,
)

User = get_user_model()


class EventoDecisionServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='mediador', password='test')
        self.proyecto = Proyecto.objects.create(nombre='Proyecto test')
        self.omoe = Omoe.objects.create(
            proyecto=self.proyecto,
            codigo='D1',
            nombre_modelo='Dimensión 1',
        )
        self.nivel = ProyectoNivelArbol.objects.create(
            proyecto=self.proyecto,
            nombre='Criterio',
            orden=1,
        )
        self.nodo = NodoArbol.objects.create(
            omoe=self.omoe,
            tipo_nivel=self.nivel,
            nombre='Velocidad',
            peso=Decimal('50'),
        )

    def test_crear_y_activar_evento_unico(self):
        evento = crear_evento(self.proyecto, self.user, {
            'nombre': 'Mesa de pesos',
            'omoe_id': self.omoe.id,
            'participantes': [{'nombre': 'Experto A', 'cargo': 'Analista'}],
        })
        self.assertEqual(evento.estado, EventoDecision.ESTADO_BORRADOR)
        activar_evento(evento)
        evento.refresh_from_db()
        self.assertEqual(evento.estado, EventoDecision.ESTADO_ACTIVO)
        self.assertIsNotNone(evento.fecha_inicio)
        self.assertEqual(get_evento_activo(self.proyecto.id).id, evento.id)

        evento2 = crear_evento(self.proyecto, self.user, {'nombre': 'Otra mesa'})
        activar_evento(evento2)
        evento.refresh_from_db()
        self.assertEqual(evento.estado, EventoDecision.ESTADO_BORRADOR)
        self.assertEqual(get_evento_activo(self.proyecto.id).id, evento2.id)

    def test_registrar_cambio_solo_con_evento_activo(self):
        evento = crear_evento(self.proyecto, self.user, {'nombre': 'Mesa'})
        reg = registrar_cambio(
            self.proyecto.id,
            self.user,
            tipo_cambio=EventoDecisionRegistro.TIPO_PESO,
            entidad_tipo='nodo_arbol',
            entidad_id=self.nodo.id,
            entidad_nombre=self.nodo.nombre,
            campo='peso',
            valor_anterior=50,
            valor_nuevo=60,
            omoe_id=self.omoe.id,
        )
        self.assertIsNone(reg)

        activar_evento(evento)
        reg = registrar_cambio(
            self.proyecto.id,
            self.user,
            tipo_cambio=EventoDecisionRegistro.TIPO_PESO,
            entidad_tipo='nodo_arbol',
            entidad_id=self.nodo.id,
            entidad_nombre=self.nodo.nombre,
            campo='peso',
            valor_anterior=50,
            valor_nuevo=60,
            omoe_id=self.omoe.id,
        )
        self.assertIsNotNone(reg)
        self.assertEqual(reg.evento_id, evento.id)

    def test_cerrar_evento_y_consultar_auditoria(self):
        evento = crear_evento(self.proyecto, self.user, {
            'nombre': 'Mesa cierre',
            'omoe_id': self.omoe.id,
        })
        activar_evento(evento)
        registrar_cambio(
            self.proyecto.id,
            self.user,
            tipo_cambio=EventoDecisionRegistro.TIPO_PESO,
            entidad_tipo='nodo_arbol',
            entidad_id=self.nodo.id,
            entidad_nombre=self.nodo.nombre,
            campo='peso',
            valor_anterior=50,
            valor_nuevo=70,
            omoe_id=self.omoe.id,
        )
        cerrar_evento(evento, justificacion='Consenso del grupo')
        evento.refresh_from_db()
        self.assertEqual(evento.estado, EventoDecision.ESTADO_CERRADO)
        self.assertIsNone(get_evento_activo(self.proyecto.id))

        payload = consultar_auditoria(self.proyecto, evento_id=evento.id)
        self.assertEqual(payload['total'], 1)
        self.assertEqual(payload['items'][0]['valor_nuevo'], 70)

    def test_historial_entidad_nodo(self):
        from api.evento_decision_service import historial_entidad, listar_nodos_auditoria

        nodos = listar_nodos_auditoria(self.proyecto, omoe_id=self.omoe.id)
        self.assertEqual(len(nodos), 1)
        self.assertEqual(nodos[0]['entidad_id'], self.nodo.id)

        evento = crear_evento(self.proyecto, self.user, {
            'nombre': 'Mesa historial',
            'omoe_id': self.omoe.id,
        })
        activar_evento(evento)
        registrar_cambio(
            self.proyecto.id,
            self.user,
            tipo_cambio=EventoDecisionRegistro.TIPO_PESO,
            entidad_tipo='nodo_arbol',
            entidad_id=self.nodo.id,
            entidad_nombre=self.nodo.nombre,
            campo='peso',
            valor_anterior=50,
            valor_nuevo=80,
            omoe_id=self.omoe.id,
        )
        cerrar_evento(evento)

        payload = historial_entidad(
            self.proyecto,
            entidad_tipo='nodo_arbol',
            entidad_id=self.nodo.id,
        )
        self.assertEqual(payload['entidad']['nombre'], 'Velocidad')
        self.assertEqual(payload['total'], 2)
        self.assertEqual(len(payload['sesiones']), 1)
        registros = [t for t in payload['timeline'] if t.get('kind') == 'registro']
        self.assertEqual(len(registros), 1)
        self.assertEqual(registros[0]['valor_nuevo'], 80)

    def test_registrar_cambio_respeta_alcance_nodos(self):
        nodo2 = NodoArbol.objects.create(
            omoe=self.omoe,
            tipo_nivel=self.nivel,
            nombre='Alcance',
            peso=Decimal('30'),
        )
        evento = crear_evento(self.proyecto, self.user, {
            'nombre': 'Mesa nodos',
            'omoe_id': self.omoe.id,
            'alcance_modo': EventoDecision.ALCANCE_NODOS_SELECCIONADOS,
            'nodos_auditoria': [self.nodo.id],
        })
        activar_evento(evento)

        reg_ok = registrar_cambio(
            self.proyecto.id,
            self.user,
            tipo_cambio=EventoDecisionRegistro.TIPO_PESO,
            entidad_tipo='nodo_arbol',
            entidad_id=self.nodo.id,
            entidad_nombre=self.nodo.nombre,
            campo='peso',
            valor_anterior=50,
            valor_nuevo=55,
            omoe_id=self.omoe.id,
        )
        reg_skip = registrar_cambio(
            self.proyecto.id,
            self.user,
            tipo_cambio=EventoDecisionRegistro.TIPO_PESO,
            entidad_tipo='nodo_arbol',
            entidad_id=nodo2.id,
            entidad_nombre=nodo2.nombre,
            campo='peso',
            valor_anterior=30,
            valor_nuevo=35,
            omoe_id=self.omoe.id,
        )
        self.assertIsNotNone(reg_ok)
        self.assertIsNone(reg_skip)

    def test_agrupar_items_auditoria_colapsa_lote(self):
        from api.evento_decision_service import agrupar_items_auditoria

        items = [
            {
                'id': 1, 'campo': 'peso', 'tipo_cambio': 'peso',
                'entidad_nombre': 'A',
                'metadata': {'lote_id': 'L1', 'rol': 'efecto'},
            },
            {
                'id': 2, 'campo': 'juicios', 'tipo_cambio': 'matriz',
                'entidad_nombre': 'Cost',
                'metadata': {
                    'lote_id': 'L1', 'rol': 'accion',
                    'accion_resumen': 'Comparaciones AHP',
                },
            },
            {
                'id': 3, 'campo': 'consistency_ratio', 'tipo_cambio': 'matriz',
                'entidad_nombre': 'Cost',
                'metadata': {'lote_id': 'L1', 'rol': 'efecto'},
            },
            {
                'id': 4, 'campo': 'peso', 'tipo_cambio': 'peso',
                'entidad_nombre': 'Solo', 'metadata': {},
            },
        ]
        grouped = agrupar_items_auditoria(items)
        self.assertEqual(len(grouped), 2)
        self.assertEqual(grouped[0]['campo'], 'juicios')
        self.assertEqual(grouped[0]['n_efectos'], 2)
        self.assertEqual(grouped[0]['accion_resumen'], 'Comparaciones AHP')
        self.assertEqual(grouped[1]['id'], 4)
        self.assertEqual(grouped[1]['n_efectos'], 0)
