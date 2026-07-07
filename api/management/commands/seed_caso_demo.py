"""
Carga un caso funcional completo para probar MCDM (OMOE, requisitos, alternativas, pesos).

Uso:
  python manage.py seed_caso_demo
  python manage.py seed_caso_demo --proyecto-id 2
  python manage.py seed_caso_demo --reset
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import (
    Alternativa,
    Caracteristica,
    CaracteristicaPlantilla,
    DpCriterio,
    Escenario,
    GrupoAfinidad,
    MopCriterio,
    Omoe,
    Proyecto,
    Requisito,
    VopResultado,
)


DEMO_NOMBRE = 'BICM — Caso demo OMOE'


class Command(BaseCommand):
    help = 'Carga datos de demostración (árbol OMOE completo y módulos relacionados).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--proyecto-id',
            type=int,
            help='ID de proyecto existente. Si no se indica, crea o reutiliza el caso demo.',
        )
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Elimina datos demo previos del proyecto antes de cargar.',
        )

    def handle(self, *args, **options):
        with transaction.atomic():
            proyecto = self._resolve_proyecto(options)
            if options['reset']:
                self._clear_demo(proyecto)
            self._seed_plantillas(proyecto)
            alternativas = self._seed_alternativas(proyecto)
            self._seed_requisitos(proyecto)
            omoe = self._seed_omoe_tree(proyecto)
            self._seed_vops(alternativas, omoe)
            self._seed_escenarios(proyecto, omoe)

        self.stdout.write(self.style.SUCCESS(
            f'Caso demo cargado en proyecto id={proyecto.id} «{proyecto.nombre}»'
        ))
        self.stdout.write(
            f'  Abre /proyecto/{proyecto.id} -> Criterios y selecciona nodos del arbol OMOE.'
        )

    def _resolve_proyecto(self, options):
        if options.get('proyecto_id'):
            return Proyecto.objects.get(pk=options['proyecto_id'])
        proyecto, _ = Proyecto.objects.get_or_create(
            nombre=DEMO_NOMBRE,
            defaults={
                'descripcion': (
                    'Buque de Investigación Científica Marina (BICM). '
                    'Caso de referencia para OMOE, alternativas y evaluación.'
                ),
                'eslora_maxima': '85',
                'desplazamiento': '3200 t',
                'velocidad_maxima': '16 kn',
                'velocidad_crucero': '12 kn',
                'tripulacion': '45 + 20 científicos',
                'autonomia': '45 días',
                'propulsion': 'Diesel-eléctrico',
            },
        )
        return proyecto

    def _clear_demo(self, proyecto):
        VopResultado.objects.filter(alternativa__proyecto=proyecto).delete()
        Omoe.objects.filter(proyecto=proyecto).delete()
        Requisito.objects.filter(proyecto=proyecto).delete()
        Escenario.objects.filter(proyecto=proyecto).delete()
        Alternativa.objects.filter(proyecto=proyecto).delete()
        CaracteristicaPlantilla.objects.filter(proyecto=proyecto).delete()

    def _seed_plantillas(self, proyecto):
        defs = [
            ('Eslora total', 'm', 1),
            ('Manga', 'm', 2),
            ('Calado diseño', 'm', 3),
            ('Desplazamiento', 't', 4),
            ('Potencia propulsión', 'kW', 5),
            ('Autonomía', 'días', 6),
        ]
        for nombre, unidad, orden in defs:
            CaracteristicaPlantilla.objects.get_or_create(
                proyecto=proyecto,
                nombre=nombre,
                defaults={'unidad': unidad, 'orden': orden, 'por_defecto': True},
            )

    def _seed_alternativas(self, proyecto):
        plantillas = list(CaracteristicaPlantilla.objects.filter(proyecto=proyecto))
        specs = [
            {
                'nombre': 'Alt. A — Diseño nacional',
                'descripcion': 'Concepto desarrollado en astillero local con transferencia tecnológica.',
                'referencia': 'PROP-A-2025',
                'costo': Decimal('185.50'),
                'costo_unidad': Alternativa.COSTO_MUSD,
                'datos': ['82.5', '15.2', '5.8', '3100', '4200', '40'],
            },
            {
                'nombre': 'Alt. B — Diseño adaptado',
                'descripcion': 'Plataforma comercial adaptada para operación científica polar.',
                'referencia': 'PROP-B-2025',
                'costo': Decimal('142.00'),
                'costo_unidad': Alternativa.COSTO_MUSD,
                'datos': ['78.0', '14.8', '5.5', '2950', '3800', '45'],
            },
            {
                'nombre': 'Alt. C — Solución modular',
                'descripcion': 'Módulos habitables y laboratorio desmontables para flexibilidad de misión.',
                'referencia': 'PROP-C-2025',
                'costo': Decimal('168.75'),
                'costo_unidad': Alternativa.COSTO_MUSD,
                'datos': ['80.0', '15.0', '5.6', '3050', '4000', '42'],
            },
        ]
        alternativas = []
        for spec in specs:
            alt, _ = Alternativa.objects.get_or_create(
                proyecto=proyecto,
                nombre=spec['nombre'],
                defaults={
                    'descripcion': spec['descripcion'],
                    'referencia': spec['referencia'],
                    'costo': spec['costo'],
                    'costo_unidad': spec['costo_unidad'],
                },
            )
            for plantilla, dato in zip(plantillas, spec['datos']):
                Caracteristica.objects.update_or_create(
                    alternativa=alt,
                    plantilla=plantilla,
                    defaults={'dato': dato},
                )
            alternativas.append(alt)
        return alternativas

    def _seed_requisitos(self, proyecto):
        items = [
            ('REQ-001', 'Eslora máxima', 'No superar 85 m en dique seco disponible.', 'm', '≤ 85', 1),
            ('REQ-002', 'Laboratorio húmedo', 'Área mínima para muestreo y análisis preliminar.', 'm²', '≥ 40', 2),
            ('REQ-003', 'Helipuerto', 'Capacidad para helicóptero medio 12 pax.', '—', 'Certificación', 3),
            ('REQ-004', 'Autonomía', 'Operación sin reaprovisionamiento mayor.', 'días', '≥ 40', 4),
            ('REQ-005', 'Ruido submarino', 'Nivel radiado para operación con sonar científico.', 'dB', '≤ umbral clase B', 5),
        ]
        for codigo, titulo, desc, unidad, criterio, orden in items:
            Requisito.objects.get_or_create(
                proyecto=proyecto,
                codigo=codigo,
                defaults={
                    'titulo': titulo,
                    'descripcion': desc,
                    'categoria': unidad,
                    'criterio_aceptacion': criterio,
                    'prioridad': Requisito.PRIORIDAD_ALTA,
                    'estado': Requisito.ESTADO_VALIDADO,
                    'orden': orden,
                },
            )

    def _seed_omoe_tree(self, proyecto):
        omoe, created = Omoe.objects.get_or_create(
            proyecto=proyecto,
            codigo='OMOE-BICM-001',
            defaults={
                'nombre_modelo': 'Efectividad operativa BICM',
                'rama_evaluacion': 'omoe',
                'descripcion_general': (
                    'Modelo de efectividad operativa para la adquisición del BICM. '
                    'Integra misiones científicas y de apoyo logístico con ponderación jerárquica.'
                ),
                'version': '1.0',
                'responsable': 'Equipo MCDM / Selección Naval',
                'estado': 'Activo',
                'rango_minimo': Decimal('0'),
                'rango_maximo': Decimal('100'),
                'observaciones': 'Caso demo generado automáticamente.',
                'orden': 1,
            },
        )
        if not created:
            return omoe

        grupo_ocean = GrupoAfinidad.objects.create(
            omoe=omoe,
            nombre_grupo='Capacidades oceanográficas',
            codigo='GA-01',
            descripcion_funcional='Sensores, cubiertas y espacios para ciencia de mar.',
            peso=Decimal('55'),
            orden_visual=1,
            aplica=True,
            justificacion_peso='Núcleo del valor operativo científico.',
            observaciones='',
        )
        grupo_lab = GrupoAfinidad.objects.create(
            omoe=omoe,
            nombre_grupo='Laboratorios y tratamiento de muestras',
            codigo='GA-02',
            descripcion_funcional='Instalaciones para análisis a bordo.',
            peso=Decimal('45'),
            orden_visual=2,
            aplica=True,
            justificacion_peso='Complementa adquisición de datos en tiempo real.',
            observaciones='',
        )
        grupo_disp = GrupoAfinidad.objects.create(
            omoe=omoe,
            nombre_grupo='Disponibilidad operativa',
            codigo='GA-03',
            descripcion_funcional='Tiempo en misión y confiabilidad de sistemas.',
            peso=Decimal('60'),
            orden_visual=1,
            aplica=True,
            justificacion_peso='Impacto directo en días efectivos de campaña.',
            observaciones='',
        )
        grupo_costo = GrupoAfinidad.objects.create(
            omoe=omoe,
            nombre_grupo='Eficiencia de costo',
            codigo='GA-04',
            descripcion_funcional='Costo ciclo de vida y sostenibilidad.',
            peso=Decimal('40'),
            orden_visual=2,
            aplica=True,
            justificacion_peso='Restricción presupuestal del programa.',
            observaciones='',
        )
        grupo_riesgo = GrupoAfinidad.objects.create(
            omoe=omoe,
            nombre_grupo='Riesgo operativo y seguridad',
            codigo='GA-05',
            descripcion_funcional='Exposición a fallas, accidentes y pérdida de misión.',
            peso=Decimal('30'),
            orden_visual=3,
            aplica=True,
            justificacion_peso='Mitigación de riesgos en operación marítima.',
            observaciones='',
        )

        mop_vel = MopCriterio.objects.create(
            grupo_afinidad=grupo_ocean,
            nombre_mop='Velocidad de crucero',
            codigo='MOP-01',
            descripcion_indicador='Velocidad sostenida en condiciones de diseño.',
            tipo_mop='mas_es_mejor',
            unidad_medida='kn',
            peso=Decimal('40'),
            valor_umbral=Decimal('10'),
            valor_meta=Decimal('14'),
            sentido_mejora='maximizar',
            metodo_evaluacion='Cálculo hidrodinámico + prueba de mar',
            familia_funciones='min_max',
            parametros_funcion={},
            valor_minimo_utilidad=Decimal('0'),
            valor_maximo_utilidad=Decimal('1'),
            fuente_dato='Memoria de diseño',
            evidencia_requerida=True,
            aplica=True,
            observaciones='',
            orden_visual=1,
        )
        mop_area = MopCriterio.objects.create(
            grupo_afinidad=grupo_ocean,
            nombre_mop='Área cubierta para operación de winches',
            codigo='MOP-02',
            descripcion_indicador='Superficie libre de obstáculos para maniobras.',
            tipo_mop='mas_es_mejor',
            unidad_medida='m²',
            peso=Decimal('60'),
            valor_umbral=Decimal('80'),
            valor_meta=Decimal('120'),
            sentido_mejora='maximizar',
            metodo_evaluacion='Plano general GA',
            familia_funciones='razon_relativa',
            parametros_funcion={},
            valor_minimo_utilidad=Decimal('0'),
            valor_maximo_utilidad=Decimal('1'),
            fuente_dato='Plano de cubiertas',
            evidencia_requerida=True,
            aplica=True,
            observaciones='',
            orden_visual=2,
        )
        mop_lab = MopCriterio.objects.create(
            grupo_afinidad=grupo_lab,
            nombre_mop='Área laboratorio húmedo',
            codigo='MOP-03',
            descripcion_indicador='Superficie útil del laboratorio húmedo.',
            tipo_mop='mas_es_mejor',
            unidad_medida='m²',
            peso=Decimal('100'),
            valor_umbral=Decimal('35'),
            valor_meta=Decimal('50'),
            sentido_mejora='maximizar',
            metodo_evaluacion='Plano de distribución',
            familia_funciones='min_max',
            parametros_funcion={},
            fuente_dato='GA distribución',
            evidencia_requerida=False,
            aplica=True,
            observaciones='',
            orden_visual=1,
        )
        mop_disp = MopCriterio.objects.create(
            grupo_afinidad=grupo_disp,
            nombre_mop='Disponibilidad anual estimada',
            codigo='MOP-04',
            descripcion_indicador='Porcentaje de tiempo operativo disponible.',
            tipo_mop='mas_es_mejor',
            unidad_medida='%',
            peso=Decimal('70'),
            valor_umbral=Decimal('75'),
            valor_meta=Decimal('90'),
            sentido_mejora='maximizar',
            metodo_evaluacion='Análisis RAM',
            familia_funciones='meta_saturada',
            parametros_funcion={'T': 90},
            fuente_dato='Estudio RAM ofertante',
            evidencia_requerida=True,
            aplica=True,
            observaciones='',
            orden_visual=1,
        )
        mop_costo = MopCriterio.objects.create(
            grupo_afinidad=grupo_costo,
            nombre_mop='Costo de adquisición',
            codigo='MOP-05',
            descripcion_indicador='Costo total de adquisición (CAPEX).',
            tipo_mop='menos_es_mejor',
            unidad_medida='MUSD',
            peso=Decimal('100'),
            valor_umbral=Decimal('200'),
            valor_meta=Decimal('150'),
            sentido_mejora='minimizar',
            metodo_evaluacion='Oferta económica',
            familia_funciones='razon_inversa',
            parametros_funcion={},
            fuente_dato='Propuesta comercial',
            evidencia_requerida=True,
            aplica=True,
            observaciones='',
            orden_visual=1,
        )
        mop_riesgo = MopCriterio.objects.create(
            grupo_afinidad=grupo_riesgo,
            nombre_mop='Índice de riesgo operativo',
            codigo='MOP-06',
            descripcion_indicador='Puntuación agregada de riesgo (0=bajo, 1=alto).',
            tipo_mop='menos_es_mejor_penalizacion',
            unidad_medida='índice',
            peso=Decimal('100'),
            valor_umbral=Decimal('0.35'),
            valor_meta=Decimal('0.15'),
            sentido_mejora='minimizar',
            metodo_evaluacion='Matriz de riesgos del ofertante',
            familia_funciones='exponencial_decreciente',
            parametros_funcion={},
            fuente_dato='Estudio de riesgos',
            evidencia_requerida=True,
            aplica=True,
            observaciones='',
            orden_visual=1,
        )

        dps = [
            (mop_vel, 'DP-VCRU', 'Velocidad en ensayo de aceptación', 'kn', '12', '14', Decimal('100')),
            (mop_vel, 'DP-POT', 'Potencia efectiva en crucero', 'kW', '2800', '3500', Decimal('0')),
            (mop_area, 'DP-CUB', 'Área cubierta de operación', 'm²', '90', '125', Decimal('100')),
            (mop_lab, 'DP-LH', 'Superficie laboratorio húmedo', 'm²', '38', '52', Decimal('100')),
            (mop_disp, 'DP-DISP', 'Disponibilidad calculada', '%', '78', '92', Decimal('100')),
            (mop_costo, 'DP-CAPEX', 'CAPEX ofertado', 'MUSD', '210', '155', Decimal('100')),
            (mop_riesgo, 'DP-RISK', 'Índice de riesgo agregado', 'índice', '0.40', '0.18', Decimal('100')),
        ]
        dp_objs = []
        for mop, codigo, nombre, unidad, umbral, meta, peso in dps:
            dp = DpCriterio.objects.create(
                mop=mop,
                nombre_dp=nombre,
                codigo=codigo,
                descripcion_tecnica=f'Atributo técnico medible para {mop.nombre_mop}.',
                tipo_dato='numerico',
                unidad=unidad,
                valor_umbral=Decimal(umbral),
                valor_meta=Decimal(meta),
                sentido_mejora=mop.sentido_mejora,
                peso=peso,
                fuente_informacion='Oferta técnica',
                requiere_evidencia=True,
                tipo_evidencia='Informe / plano',
                familia_funciones=mop.familia_funciones,
                parametros_funcion=mop.parametros_funcion or {},
                observaciones='Demo',
                orden_visual=len(dp_objs) + 1,
            )
            dp_objs.append(dp)

        return omoe

    def _seed_vops(self, alternativas, omoe):
        dps = DpCriterio.objects.filter(mop__grupo_afinidad__omoe=omoe)
        ofertas = {
            'Alt. A — Diseño nacional': {
                'DP-VCRU': ('13.2', '0.85'),
                'DP-CUB': ('115', '0.92'),
                'DP-LH': ('48', '0.96'),
                'DP-DISP': ('88', '0.88'),
                'DP-CAPEX': ('185.5', '0.90'),
                'DP-RISK': ('0.22', '0.82'),
            },
            'Alt. B — Diseño adaptado': {
                'DP-VCRU': ('12.8', '0.78'),
                'DP-CUB': ('105', '0.84'),
                'DP-LH': ('42', '0.82'),
                'DP-DISP': ('91', '0.91'),
                'DP-CAPEX': ('142', '0.95'),
                'DP-RISK': ('0.28', '0.74'),
            },
            'Alt. C — Solución modular': {
                'DP-VCRU': ('13.0', '0.82'),
                'DP-CUB': ('110', '0.88'),
                'DP-LH': ('45', '0.88'),
                'DP-DISP': ('85', '0.85'),
                'DP-CAPEX': ('168.75', '0.87'),
                'DP-RISK': ('0.31', '0.68'),
            },
        }
        for alt in alternativas:
            datos = ofertas.get(alt.nombre, {})
            for dp in dps:
                if dp.codigo not in datos:
                    continue
                valor, vop = datos[dp.codigo]
                VopResultado.objects.update_or_create(
                    alternativa=alt,
                    dp=dp,
                    defaults={
                        'valor_real_ofertado': Decimal(valor),
                        'unidad': dp.unidad,
                        'funcion_utilidad_aplicada': dp.familia_funciones,
                        'valor_umbral': dp.valor_umbral,
                        'valor_meta': dp.valor_meta,
                        'vop_calculado': Decimal(vop),
                        'cumplimiento_minimo': True,
                        'evidencia': f'Oferta {alt.referencia}',
                        'observaciones': 'VOP demo',
                    },
                )

    def _seed_escenarios(self, proyecto, omoe=None):
        from api.escenario_service import ensure_escenario_estandar

        omoe = omoe or Omoe.objects.filter(proyecto=proyecto).order_by('orden', 'id').first()
        if not omoe:
            return

        ensure_escenario_estandar(omoe)

        Escenario.objects.get_or_create(
            omoe=omoe,
            nombre='Misión científica oceanográfica',
            defaults={
                'proyecto': proyecto,
                'descripcion': 'Prioridad a capacidades científicas y laboratorio.',
                'orden': 1,
                'peso': Decimal('40'),
                'rama_evaluacion': 'omoe',
            },
        )
        Escenario.objects.get_or_create(
            omoe=omoe,
            nombre='Escenario equilibrado',
            defaults={
                'proyecto': proyecto,
                'descripcion': 'Ponderación equilibrada entre efectividad, costo y riesgo.',
                'orden': 2,
                'peso': Decimal('35'),
                'rama_evaluacion': 'omoc',
            },
        )
        Escenario.objects.get_or_create(
            omoe=omoe,
            nombre='Escenario conservador',
            defaults={
                'proyecto': proyecto,
                'descripcion': 'Mayor peso a riesgo operativo y disponibilidad.',
                'orden': 3,
                'peso': Decimal('25'),
                'rama_evaluacion': 'omor',
            },
        )
