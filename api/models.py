from decimal import Decimal
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from .upload_utils import (
    FILE_FIELD_MAX_LENGTH,
    alternativa_anexo_upload,
    alternativa_foto_upload,
    documento_criterio_upload,
    documento_upload,
    proyecto_foto_upload,
    usuario_foto_upload,
)
from .evaluacion_rama_choices import (
    RAMA_AUTO,
    RAMA_EVALUACION_CHOICES,
    RAMA_OMOC,
    RAMA_OMOE,
    RAMA_OMOR,
)


class TipoDimension(models.Model):
    """Catálogo global de tipos de dimensión (extensible más allá de OMOE/OMOC/OMOR)."""
    SENTIDO_MAX = 'max'
    SENTIDO_MIN = 'min'
    SENTIDO_CHOICES = [
        (SENTIDO_MAX, 'Maximizar (beneficio)'),
        (SENTIDO_MIN, 'Minimizar (costo / riesgo)'),
    ]

    codigo = models.CharField(
        max_length=32,
        unique=True,
        help_text='Código estable (p. ej. omoe, omoc, sostenibilidad).',
    )
    nombre = models.CharField(max_length=128)
    descripcion = models.TextField(blank=True)
    sentido_optimizacion = models.CharField(
        max_length=8,
        choices=SENTIDO_CHOICES,
        default=SENTIDO_MAX,
        help_text='Dirección MADM/Pareto: max o min.',
    )
    escenario_agregacion_default = models.CharField(max_length=24, default='compensatorio')
    modo_valor_terminal_default = models.CharField(max_length=16, default='utilidad')
    activo = models.BooleanField(default=True)
    es_sistema = models.BooleanField(
        default=False,
        help_text='Tipos semilla (omoe/omoc/omor); no se elimina el código.',
    )
    orden = models.PositiveIntegerField(default=0)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Tipo de dimensión'
        verbose_name_plural = 'Tipos de dimensión'
        ordering = ['orden', 'codigo', 'id']

    def __str__(self):
        return f'{self.codigo} — {self.nombre}'


class Proyecto(models.Model):
    nombre = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    eslora_maxima = models.CharField(max_length=128, blank=True)
    desplazamiento = models.CharField(max_length=128, blank=True)
    velocidad_maxima = models.CharField(max_length=128, blank=True)
    velocidad_crucero = models.CharField(max_length=128, blank=True)
    tripulacion = models.CharField(max_length=128, blank=True)
    autonomia = models.CharField(max_length=128, blank=True)
    propulsion = models.CharField(max_length=255, blank=True)
    posicionamiento_dinamico = models.CharField(max_length=128, blank=True)
    laboratorios = models.TextField(blank=True)
    otras_caracteristicas = models.TextField(blank=True)
    foto = models.ImageField(
        upload_to=proyecto_foto_upload,
        max_length=FILE_FIELD_MAX_LENGTH,
        null=True,
        blank=True,
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Proyecto"
        verbose_name_plural = "Proyectos"
        ordering = ['-fecha_creacion']

    def __str__(self):
        return self.nombre


class Requisito(models.Model):
    PRIORIDAD_BAJA = 'baja'
    PRIORIDAD_MEDIA = 'media'
    PRIORIDAD_ALTA = 'alta'
    PRIORIDAD_CRITICA = 'critica'

    PRIORIDAD_CHOICES = [
        (PRIORIDAD_BAJA, 'Baja'),
        (PRIORIDAD_MEDIA, 'Media'),
        (PRIORIDAD_ALTA, 'Alta'),
        (PRIORIDAD_CRITICA, 'Crítica'),
    ]

    ESTADO_PENDIENTE = 'pendiente'
    ESTADO_REVISION = 'revision'
    ESTADO_VALIDADO = 'validado'
    ESTADO_IMPLANTADO = 'implantado'

    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, 'Pendiente'),
        (ESTADO_REVISION, 'En revisión'),
        (ESTADO_VALIDADO, 'Validado'),
        (ESTADO_IMPLANTADO, 'Implantado'),
    ]

    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name='requisitos')
    codigo = models.CharField(max_length=64, blank=True)
    titulo = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    categoria = models.CharField(max_length=128, blank=True)
    prioridad = models.CharField(max_length=16, choices=PRIORIDAD_CHOICES, default=PRIORIDAD_MEDIA)
    estado = models.CharField(max_length=16, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE)
    criterio_aceptacion = models.TextField(blank=True)
    observaciones = models.TextField(blank=True)
    orden = models.PositiveIntegerField(default=0)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Requisito'
        verbose_name_plural = 'Requisitos'
        ordering = ['orden', 'id']

    def __str__(self):
        return self.codigo or self.titulo


class Alternativa(models.Model):
    COSTO_MUSD = 'MUSD'
    COSTO_USD = 'USD'
    COSTO_COP = 'COP'
    COSTO_MEUR = 'MEUR'
    COSTO_EUR = 'EUR'
    COSTO_MGBP = 'MGBP'
    COSTO_GBP = 'GBP'

    COSTO_UNIDAD_CHOICES = [
        (COSTO_MUSD, 'MUSD (millones USD)'),
        (COSTO_USD, 'USD'),
        (COSTO_COP, 'COP'),
        (COSTO_MEUR, 'MEUR (millones EUR)'),
        (COSTO_EUR, 'EUR'),
        (COSTO_MGBP, 'MGBP (millones GBP)'),
        (COSTO_GBP, 'GBP'),
    ]

    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name='alternativas')
    nombre = models.CharField(max_length=255)
    apodo = models.CharField(
        max_length=8,
        blank=True,
        help_text='Nombre corto opcional para gráficos (máx. 8 caracteres).',
    )
    descripcion = models.TextField(blank=True)
    referencia = models.TextField(blank=True)
    costo = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    costo_unidad = models.CharField(
        max_length=8,
        choices=COSTO_UNIDAD_CHOICES,
        default=COSTO_MUSD,
    )
    foto = models.ImageField(
        upload_to=alternativa_foto_upload,
        max_length=FILE_FIELD_MAX_LENGTH,
        null=True,
        blank=True,
    )
    anexo = models.FileField(
        upload_to=alternativa_anexo_upload,
        max_length=FILE_FIELD_MAX_LENGTH,
        null=True,
        blank=True,
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Alternativa"
        verbose_name_plural = "Alternativas"
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f"{self.nombre} - {self.proyecto.nombre}"


class Capacidad(models.Model):
    alternativa = models.ForeignKey(Alternativa, on_delete=models.CASCADE, related_name='capacidades')
    nombre = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)

    class Meta:
        verbose_name = "Capacidad"
        verbose_name_plural = "Capacidades"
        ordering = ['id']

    def __str__(self):
        return self.nombre


class CaracteristicaPlantilla(models.Model):
    """Catálogo de características del proyecto (ej. Eslora, Manga)."""
    proyecto = models.ForeignKey(
        Proyecto, on_delete=models.CASCADE, related_name='caracteristicas_plantilla'
    )
    nombre = models.CharField(max_length=255)
    unidad = models.CharField(max_length=64, blank=True)
    orden = models.PositiveIntegerField(default=0)
    por_defecto = models.BooleanField(
        default=True,
        help_text='Si está activa, se incluye al crear una nueva alternativa.',
    )

    class Meta:
        verbose_name = "Plantilla de característica"
        verbose_name_plural = "Plantillas de características"
        ordering = ['orden', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['proyecto', 'nombre'],
                name='uniq_caracteristica_plantilla_proyecto_nombre',
            ),
        ]

    def __str__(self):
        if self.unidad:
            return f"{self.nombre} [{self.unidad}]"
        return self.nombre


class Caracteristica(models.Model):
    """Valor de una plantilla para una alternativa concreta."""
    alternativa = models.ForeignKey(Alternativa, on_delete=models.CASCADE, related_name='caracteristicas')
    plantilla = models.ForeignKey(
        CaracteristicaPlantilla, on_delete=models.CASCADE, related_name='valores'
    )
    dato = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name = "Característica"
        verbose_name_plural = "Características"
        ordering = ['plantilla__orden', 'plantilla__id']
        constraints = [
            models.UniqueConstraint(
                fields=['alternativa', 'plantilla'],
                name='uniq_caracteristica_alternativa_plantilla',
            ),
        ]

    def __str__(self):
        return f"{self.plantilla} = {self.dato or '—'}"


class Documento(models.Model):
    alternativa = models.ForeignKey(Alternativa, on_delete=models.CASCADE, related_name='documentos')
    nombre = models.CharField(max_length=255)
    archivo = models.FileField(
        upload_to=documento_upload,
        max_length=FILE_FIELD_MAX_LENGTH,
    )
    fecha_carga = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Documento"
        verbose_name_plural = "Documentos"
        ordering = ['-fecha_carga']

    def __str__(self):
        return f"{self.nombre} - {self.alternativa.nombre}"


class Dimension(models.Model):
    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name='dimensiones')
    nombre = models.CharField(max_length=255)
    referencia = models.TextField(blank=True)
    descripcion = models.TextField(blank=True)
    peso = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Grupo de afinidad"
        verbose_name_plural = "Grupos de afinidad"
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Atributo(models.Model):
    dimension = models.ForeignKey(Dimension, on_delete=models.CASCADE, related_name='atributos')
    nombre = models.CharField(max_length=255)
    referencia = models.TextField(blank=True)
    descripcion = models.TextField(blank=True)
    tipo_criterio = models.CharField(max_length=64, blank=True, default='')
    familia_funciones = models.CharField(max_length=64, blank=True, default='')
    parametros_funcion = models.JSONField(blank=True, default=dict)
    peso = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "MOP"
        verbose_name_plural = "MOP"
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Subatributo(models.Model):
    atributo = models.ForeignKey(Atributo, on_delete=models.CASCADE, related_name='subatributos')
    nombre = models.CharField(max_length=255)
    referencia = models.TextField(blank=True)
    descripcion = models.TextField(blank=True)
    peso = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Atributo"
        verbose_name_plural = "Atributos"
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Escenario(models.Model):
    """Escenario de ponderación asociado a una dimensión (Omoe)."""
    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name='escenarios')
    omoe = models.ForeignKey(
        'Omoe',
        on_delete=models.CASCADE,
        related_name='escenarios',
        null=True,
        blank=True,
        help_text='Dimensión a la que pertenece el escenario.',
    )
    nombre = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    peso = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0'))
    rama_evaluacion = models.CharField(
        max_length=32,
        default=RAMA_OMOE,
        help_text='Rama / tipo de dimensión (código del catálogo TipoDimension).',
    )
    orden = models.PositiveIntegerField(default=0)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Escenario'
        verbose_name_plural = 'Escenarios'
        ordering = ['orden', 'nombre', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['proyecto', 'nombre'],
                condition=models.Q(omoe__isnull=True),
                name='uniq_escenario_proyecto_nombre_sin_omoe',
            ),
            models.UniqueConstraint(
                fields=['omoe', 'nombre'],
                condition=models.Q(omoe__isnull=False),
                name='uniq_escenario_omoe_nombre',
            ),
        ]

    def __str__(self):
        return self.nombre


class PesoEscenario(models.Model):
    """Peso (%) de un nodo del árbol para un escenario concreto."""
    escenario = models.ForeignKey(Escenario, on_delete=models.CASCADE, related_name='pesos')
    dimension = models.ForeignKey(
        Dimension, on_delete=models.CASCADE, null=True, blank=True, related_name='pesos_escenario'
    )
    atributo = models.ForeignKey(
        Atributo, on_delete=models.CASCADE, null=True, blank=True, related_name='pesos_escenario'
    )
    subatributo = models.ForeignKey(
        Subatributo, on_delete=models.CASCADE, null=True, blank=True, related_name='pesos_escenario'
    )
    peso = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))

    class Meta:
        verbose_name = 'Peso por escenario'
        verbose_name_plural = 'Pesos por escenario'
        constraints = [
            models.UniqueConstraint(
                fields=['escenario', 'dimension'],
                condition=models.Q(dimension__isnull=False),
                name='uniq_peso_escenario_dimension',
            ),
            models.UniqueConstraint(
                fields=['escenario', 'atributo'],
                condition=models.Q(atributo__isnull=False),
                name='uniq_peso_escenario_atributo',
            ),
            models.UniqueConstraint(
                fields=['escenario', 'subatributo'],
                condition=models.Q(subatributo__isnull=False),
                name='uniq_peso_escenario_subatributo',
            ),
        ]

    def clean(self):
        parents = sum([
            bool(self.dimension_id),
            bool(self.atributo_id),
            bool(self.subatributo_id),
        ])
        if parents != 1:
            raise ValidationError(
                'El peso debe asociarse a exactamente un nodo: grupo de afinidad, MOP o atributo.'
            )

    def __str__(self):
        if self.dimension_id:
            return f'{self.escenario} → {self.dimension} ({self.peso}%)'
        if self.atributo_id:
            return f'{self.escenario} → {self.atributo} ({self.peso}%)'
        return f'{self.escenario} → {self.subatributo} ({self.peso}%)'


class DocumentoCriterio(models.Model):
    dimension = models.ForeignKey(
        Dimension, on_delete=models.CASCADE, null=True, blank=True, related_name='documentos'
    )
    atributo = models.ForeignKey(
        Atributo, on_delete=models.CASCADE, null=True, blank=True, related_name='documentos'
    )
    subatributo = models.ForeignKey(
        Subatributo, on_delete=models.CASCADE, null=True, blank=True, related_name='documentos'
    )
    nombre = models.CharField(max_length=255)
    archivo = models.FileField(
        upload_to=documento_criterio_upload,
        max_length=FILE_FIELD_MAX_LENGTH,
    )
    fecha_carga = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Documento de criterio"
        verbose_name_plural = "Documentos de criterios"
        ordering = ['-fecha_carga']

    def clean(self):
        parents = sum([
            bool(self.dimension_id),
            bool(self.atributo_id),
            bool(self.subatributo_id),
        ])
        if parents != 1:
            raise ValidationError('El documento debe pertenecer a exactamente un nivel del árbol.')

    def __str__(self):
        return self.nombre


# --- Árbol OMOE (Árbol de dimensiones) ---


MODO_CERTEZA = 'certeza'
MODO_INCERTIDUMBRE = 'incertidumbre'
MODO_EVALUACION_CHOICES = [
    (MODO_CERTEZA, 'Certeza'),
    (MODO_INCERTIDUMBRE, 'Incertidumbre'),
]


class Omoe(models.Model):
    """Raíz del árbol OMOE por proyecto."""
    proyecto = models.ForeignKey(Proyecto, on_delete=models.CASCADE, related_name='omoes')
    nombre_modelo = models.CharField(max_length=255)
    codigo = models.CharField(max_length=64, blank=True)
    descripcion_general = models.TextField(blank=True)
    version = models.CharField(max_length=32, blank=True)
    responsable = models.CharField(max_length=255, blank=True)
    estado = models.CharField(max_length=64, blank=True)
    rango_minimo = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    rango_maximo = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    observaciones = models.TextField(blank=True)
    rama_evaluacion = models.CharField(
        max_length=32,
        default=RAMA_OMOE,
        help_text='Código del tipo de dimensión (catálogo global).',
    )
    orden = models.PositiveIntegerField(default=0)
    tipo_criterio = models.CharField(max_length=64, blank=True, default='')
    familia_funciones = models.CharField(max_length=64, blank=True, default='')
    parametros_funcion = models.JSONField(blank=True, default=dict)
    unidad = models.CharField(max_length=64, blank=True)
    tipo_dato = models.CharField(max_length=64, blank=True)
    valor_umbral = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    valor_meta = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    sentido_mejora = models.CharField(max_length=64, blank=True)
    modo_evaluacion = models.CharField(
        max_length=16,
        choices=MODO_EVALUACION_CHOICES,
        default=MODO_CERTEZA,
        blank=True,
        help_text='Certeza: función de utilidad. Incertidumbre: riesgo (probabilidad × consecuencia).',
    )
    consecuencia_descripciones = models.JSONField(
        blank=True,
        default=dict,
        help_text='Descripción de consecuencia por nivel (0.1, 0.3, …) cuando el modo es incertidumbre.',
    )
    calculation_method = models.CharField(
        max_length=32,
        default='MAVT',
        help_text='Método principal de cálculo: MAVT, MAUT, UTA o WEIGHTED_SUM.',
    )
    calculation_config = models.JSONField(
        blank=True,
        default=dict,
        help_text='Configuración específica del método de cálculo (escenarios, preferencias, etc.).',
    )
    escenario_agregacion = models.CharField(
        max_length=24,
        default='compensatorio',
        help_text='Cómo se combinan los escenarios al calcular la dimensión.',
    )
    modo_valor_terminal = models.CharField(
        max_length=16,
        default='utilidad',
        help_text='Utilidad normalizada o valor x tal cual (típico en costos).',
    )
    enable_sensitivity_analysis = models.BooleanField(
        default=False,
        help_text='Habilita análisis de sensibilidad complementario sobre el método principal.',
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Dimensión'
        verbose_name_plural = 'Dimensiones'
        ordering = ['orden', 'nombre_modelo', 'id']

    def __str__(self):
        return self.nombre_modelo or self.codigo or f'OMOE #{self.pk}'


class Mision(models.Model):
    omoe = models.ForeignKey(Omoe, on_delete=models.CASCADE, related_name='misiones')
    nombre_mision = models.CharField(max_length=255)
    codigo = models.CharField(max_length=64, blank=True)
    descripcion_operacional = models.TextField(blank=True)
    peso = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0'))
    orden_visual = models.PositiveIntegerField(default=0)
    aplica = models.BooleanField(default=True)
    responsable_validacion = models.CharField(max_length=255, blank=True)
    justificacion_peso = models.TextField(blank=True)
    observaciones = models.TextField(blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Misión'
        verbose_name_plural = 'Misiones'
        ordering = ['orden_visual', 'nombre_mision', 'id']

    @property
    def parent_id(self):
        return self.omoe_id

    def __str__(self):
        return self.nombre_mision


class GrupoAfinidad(models.Model):
    omoe = models.ForeignKey(
        Omoe, on_delete=models.CASCADE, related_name='grupos', null=True, blank=True
    )
    mision = models.ForeignKey(
        Mision, on_delete=models.CASCADE, related_name='grupos', null=True, blank=True
    )
    nombre_grupo = models.CharField(max_length=255)
    codigo = models.CharField(max_length=64, blank=True)
    descripcion_funcional = models.TextField(blank=True)
    tipo_mop = models.CharField(max_length=64, blank=True, default='')
    familia_funciones = models.CharField(max_length=64, blank=True, default='')
    parametros_funcion = models.JSONField(blank=True, default=dict)
    rama_evaluacion = models.CharField(
        max_length=32,
        default=RAMA_AUTO,
        blank=True,
        help_text='Código de tipo de dimensión o «auto».',
    )
    peso = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0'))
    orden_visual = models.PositiveIntegerField(default=0)
    aplica = models.BooleanField(default=True)
    justificacion_peso = models.TextField(blank=True)
    observaciones = models.TextField(blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Grupo de afinidad'
        verbose_name_plural = 'Grupos de afinidad'
        ordering = ['orden_visual', 'nombre_grupo', 'id']

    @property
    def parent_id(self):
        return self.omoe_id or self.mision_id

    def __str__(self):
        return self.nombre_grupo


class MopCriterio(models.Model):
    grupo_afinidad = models.ForeignKey(
        GrupoAfinidad, on_delete=models.CASCADE, related_name='mops'
    )
    nombre_mop = models.CharField(max_length=255)
    codigo = models.CharField(max_length=64, blank=True)
    descripcion_indicador = models.TextField(blank=True)
    tipo_mop = models.CharField(max_length=64, blank=True)
    unidad_medida = models.CharField(max_length=64, blank=True)
    peso = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0'))
    valor_umbral = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    valor_meta = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    sentido_mejora = models.CharField(max_length=64, blank=True)
    metodo_evaluacion = models.CharField(max_length=128, blank=True)
    familia_funciones = models.CharField(max_length=64, blank=True, default='')
    parametros_funcion = models.JSONField(blank=True, default=dict)
    valor_minimo_utilidad = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    valor_maximo_utilidad = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    fuente_dato = models.CharField(max_length=255, blank=True)
    evidencia_requerida = models.BooleanField(default=False)
    aplica = models.BooleanField(default=True)
    observaciones = models.TextField(blank=True)
    orden_visual = models.PositiveIntegerField(default=0)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'MOP'
        verbose_name_plural = 'MOP'
        ordering = ['orden_visual', 'nombre_mop', 'id']

    @property
    def parent_id(self):
        return self.grupo_afinidad_id

    def __str__(self):
        return self.nombre_mop


class DpCriterio(models.Model):
    mop = models.ForeignKey(MopCriterio, on_delete=models.CASCADE, related_name='dps')
    nombre_dp = models.CharField(max_length=255)
    codigo = models.CharField(max_length=64, blank=True)
    descripcion_tecnica = models.TextField(blank=True)
    tipo_dato = models.CharField(max_length=64, blank=True)
    unidad = models.CharField(max_length=64, blank=True)
    valor_umbral = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    valor_meta = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    sentido_mejora = models.CharField(max_length=64, blank=True)
    peso = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0'))
    fuente_informacion = models.CharField(max_length=255, blank=True)
    requiere_evidencia = models.BooleanField(default=False)
    tipo_evidencia = models.CharField(max_length=128, blank=True)
    familia_funciones = models.CharField(max_length=64, blank=True, default='')
    parametros_funcion = models.JSONField(blank=True, default=dict)
    observaciones = models.TextField(blank=True)
    orden_visual = models.PositiveIntegerField(default=0)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'DP / atributo técnico'
        verbose_name_plural = 'DPs / atributos técnicos'
        ordering = ['orden_visual', 'nombre_dp', 'id']

    @property
    def parent_id(self):
        return self.mop_id

    def __str__(self):
        return self.nombre_dp


class ProyectoNivelArbol(models.Model):
    """Etiqueta configurable de un nivel bajo la dimensión, por rama (OMOE/OMOC/OMOR)."""
    proyecto = models.ForeignKey(
        Proyecto, on_delete=models.CASCADE, related_name='niveles_arbol'
    )
    rama_evaluacion = models.CharField(
        max_length=32,
        default='omoe',
        help_text='Código de tipo de dimensión a la que aplica este nivel (por proyecto).',
    )
    orden = models.PositiveSmallIntegerField(
        help_text='Posición del nivel (1–9) bajo la dimensión.',
    )
    codigo = models.CharField(
        max_length=32,
        help_text='Identificador interno estable (p. ej. mop_1, dp_2).',
    )
    nombre = models.CharField(
        max_length=128,
        help_text='Nombre visible que define el administrador del proyecto.',
    )
    activo = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Nivel del árbol'
        verbose_name_plural = 'Niveles del árbol'
        ordering = ['proyecto_id', 'rama_evaluacion', 'orden']
        constraints = [
            models.UniqueConstraint(
                fields=['proyecto', 'rama_evaluacion', 'orden'],
                name='uniq_proyecto_rama_nivel_arbol_orden',
            ),
            models.UniqueConstraint(
                fields=['proyecto', 'rama_evaluacion', 'codigo'],
                name='uniq_proyecto_rama_nivel_arbol_codigo',
            ),
        ]

    def __str__(self):
        return f'{self.proyecto_id} · {self.orden} · {self.nombre}'


class NivelProbabilidad(models.Model):
    """Tabla 29 — niveles de probabilidad del riesgo (por proyecto)."""
    proyecto = models.ForeignKey(
        Proyecto, on_delete=models.CASCADE, related_name='niveles_probabilidad',
    )
    valor = models.DecimalField(
        max_digits=4, decimal_places=2,
        help_text='Nivel numérico (p. ej. 0.1, 0.3, 0.5).',
    )
    descripcion = models.CharField(max_length=255)
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Nivel de probabilidad'
        verbose_name_plural = 'Niveles de probabilidad'
        ordering = ['proyecto_id', 'orden', 'valor']
        constraints = [
            models.UniqueConstraint(
                fields=['proyecto', 'valor'],
                name='uniq_proyecto_nivel_probabilidad_valor',
            ),
        ]

    def __str__(self):
        return f'{self.valor} — {self.descripcion}'


class NivelImpacto(models.Model):
    """Tabla 30 — niveles de impacto / consecuencia del riesgo (por proyecto)."""
    TIPO_DESEMPENO = 'desempeno'
    TIPO_CRONOGRAMA = 'cronograma'
    TIPO_COSTO = 'costo'
    TIPO_CONSECUENCIA_CHOICES = [
        (TIPO_DESEMPENO, 'Desempeño'),
        (TIPO_CRONOGRAMA, 'Cronograma'),
        (TIPO_COSTO, 'Costo'),
    ]

    proyecto = models.ForeignKey(
        Proyecto, on_delete=models.CASCADE, related_name='niveles_impacto',
    )
    valor = models.DecimalField(max_digits=4, decimal_places=2)
    descripcion_desempeno = models.TextField(blank=True)
    descripcion_cronograma = models.TextField(blank=True)
    descripcion_costo = models.TextField(blank=True)
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Nivel de impacto'
        verbose_name_plural = 'Niveles de impacto'
        ordering = ['proyecto_id', 'orden', 'valor']
        constraints = [
            models.UniqueConstraint(
                fields=['proyecto', 'valor'],
                name='uniq_proyecto_nivel_impacto_valor',
            ),
        ]

    def descripcion_para(self, tipo: str) -> str:
        if tipo == self.TIPO_CRONOGRAMA:
            return self.descripcion_cronograma
        if tipo == self.TIPO_COSTO:
            return self.descripcion_costo
        return self.descripcion_desempeno

    def __str__(self):
        return f'{self.valor} — {self.descripcion_desempeno[:40]}'


class NodoArbol(models.Model):
    """Nodo del árbol de criterios (7 tipos configurables bajo cada dimensión)."""
    omoe = models.ForeignKey(Omoe, on_delete=models.CASCADE, related_name='nodos')
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='hijos',
    )
    tipo_nivel = models.ForeignKey(
        ProyectoNivelArbol,
        on_delete=models.PROTECT,
        related_name='nodos',
    )
    nombre = models.CharField(max_length=255)
    codigo = models.CharField(max_length=64, blank=True)
    descripcion = models.TextField(blank=True)
    peso = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0'))
    orden_visual = models.PositiveIntegerField(default=0)
    aplica = models.BooleanField(default=True)
    justificacion_peso = models.TextField(blank=True)
    observaciones = models.TextField(blank=True)
    tipo_criterio = models.CharField(max_length=64, blank=True, default='')
    familia_funciones = models.CharField(max_length=64, blank=True, default='')
    parametros_funcion = models.JSONField(blank=True, default=dict)
    unidad = models.CharField(max_length=64, blank=True)
    tipo_dato = models.CharField(max_length=64, blank=True)
    valor_umbral = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    valor_meta = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    sentido_mejora = models.CharField(max_length=64, blank=True)
    metodo_evaluacion = models.CharField(max_length=128, blank=True)
    valor_minimo_utilidad = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    valor_maximo_utilidad = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    fuente_dato = models.CharField(max_length=255, blank=True)
    evidencia_requerida = models.BooleanField(default=False)
    tipo_evidencia = models.CharField(max_length=128, blank=True)
    nivel_probabilidad = models.ForeignKey(
        NivelProbabilidad,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='nodos_arbol',
    )
    nivel_impacto = models.ForeignKey(
        NivelImpacto,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='nodos_arbol',
    )
    tipo_consecuencia = models.CharField(
        max_length=16,
        choices=NivelImpacto.TIPO_CONSECUENCIA_CHOICES,
        default=NivelImpacto.TIPO_DESEMPENO,
        blank=True,
    )
    modo_evaluacion = models.CharField(
        max_length=16,
        choices=MODO_EVALUACION_CHOICES,
        default=MODO_CERTEZA,
        blank=True,
        help_text='Certeza: función de utilidad. Incertidumbre: riesgo (probabilidad × consecuencia).',
    )
    consecuencia_descripciones = models.JSONField(
        blank=True,
        default=dict,
        help_text='Descripción de consecuencia por nivel (0.1, 0.3, …) cuando el modo es incertidumbre.',
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Nodo del árbol'
        verbose_name_plural = 'Nodos del árbol'
        ordering = ['orden_visual', 'id']

    @property
    def parent_id_prop(self):
        return self.parent_id

    def __str__(self):
        return self.nombre


class NodoArbolEscenario(models.Model):
    """Pesos, activación y utilidad por nodo del árbol para un escenario de dimensión."""
    escenario = models.ForeignKey(
        Escenario,
        on_delete=models.CASCADE,
        related_name='configs_nodo_arbol',
    )
    nodo_arbol = models.ForeignKey(
        NodoArbol,
        on_delete=models.CASCADE,
        related_name='configs_escenario',
    )
    peso = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0'))
    aplica = models.BooleanField(default=True)
    tipo_criterio = models.CharField(max_length=64, blank=True, default='')
    familia_funciones = models.CharField(max_length=64, blank=True, default='')
    parametros_funcion = models.JSONField(blank=True, default=dict)
    nivel_probabilidad = models.ForeignKey(
        NivelProbabilidad,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='configs_nodo_escenario',
    )
    nivel_impacto = models.ForeignKey(
        NivelImpacto,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='configs_nodo_escenario',
    )
    tipo_consecuencia = models.CharField(
        max_length=16,
        choices=NivelImpacto.TIPO_CONSECUENCIA_CHOICES,
        default=NivelImpacto.TIPO_DESEMPENO,
        blank=True,
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuración nodo por escenario'
        verbose_name_plural = 'Configuraciones nodo por escenario'
        constraints = [
            models.UniqueConstraint(
                fields=['escenario', 'nodo_arbol'],
                name='uniq_nodo_arbol_escenario',
            ),
        ]

    def __str__(self):
        return f'{self.nodo_arbol.nombre} @ {self.escenario.nombre}'


class PesoGrupoAhp(models.Model):
    """Pesos entre hermanos del árbol por escenario: manual o AHP (Saaty)."""
    MODO_MANUAL = 'manual'
    MODO_AHP = 'ahp'
    MODO_CHOICES = [
        (MODO_MANUAL, 'Manual'),
        (MODO_AHP, 'AHP'),
    ]

    escenario = models.ForeignKey(
        Escenario,
        on_delete=models.CASCADE,
        related_name='peso_grupos_ahp',
    )
    parent = models.ForeignKey(
        NodoArbol,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='peso_grupos_ahp_hijos',
    )
    modo = models.CharField(max_length=8, choices=MODO_CHOICES, default=MODO_MANUAL)
    juicios = models.JSONField(blank=True, default=dict)
    pesos_calculados = models.JSONField(blank=True, default=dict)
    consistency_ratio = models.DecimalField(
        max_digits=6, decimal_places=4, null=True, blank=True,
    )
    lambda_max = models.DecimalField(
        max_digits=8, decimal_places=4, null=True, blank=True,
    )
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Peso grupo AHP'
        verbose_name_plural = 'Pesos grupo AHP'
        constraints = [
            models.UniqueConstraint(
                fields=['escenario', 'parent'],
                name='uniq_peso_grupo_ahp_esc_parent',
            ),
        ]

    def __str__(self):
        parent = self.parent.nombre if self.parent_id else 'raíz'
        return f'{parent} @ {self.escenario.nombre} ({self.modo})'


class VopResultado(models.Model):
    """Valor ofertado por alternativa; no es nodo del árbol."""
    alternativa = models.ForeignKey(
        Alternativa, on_delete=models.CASCADE, related_name='vops'
    )
    dp = models.ForeignKey(
        DpCriterio, on_delete=models.CASCADE, related_name='vop_resultados'
    )
    valor_real_ofertado = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    unidad = models.CharField(max_length=64, blank=True)
    funcion_utilidad_aplicada = models.CharField(max_length=128, blank=True)
    valor_umbral = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    valor_meta = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    vop_calculado = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True
    )
    cumplimiento_minimo = models.BooleanField(default=True)
    evidencia = models.TextField(blank=True)
    observaciones = models.TextField(blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'VOP (resultado)'
        verbose_name_plural = 'VOPs (resultados)'
        ordering = ['-fecha_creacion']
        constraints = [
            models.UniqueConstraint(
                fields=['alternativa', 'dp'],
                name='uniq_vop_alternativa_dp',
            ),
        ]

    def __str__(self):
        return f'VOP {self.alternativa_id} → DP {self.dp_id}'


class ValorEvaluacion(models.Model):
    """Variable x ofertada por alternativa, escenario y nodo terminal del árbol OMOE."""

    NIVEL_CHOICES = [
        ('grupo_afinidad', 'Grupo de afinidad'),
        ('mop', 'MOP'),
        ('dp', 'DP'),
        ('nodo_arbol', 'Nodo del árbol'),
        ('omoe', 'Dimensión'),
    ]

    alternativa = models.ForeignKey(
        Alternativa, on_delete=models.CASCADE, related_name='valores_evaluacion'
    )
    escenario = models.ForeignKey(
        Escenario,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='valores_evaluacion',
        help_text='Null = valor global (p. ej. costo/riesgo sin misión).',
    )
    nodo_arbol = models.ForeignKey(
        NodoArbol,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='valores_evaluacion',
    )
    nivel = models.CharField(max_length=16, choices=NIVEL_CHOICES, blank=True, default='')
    nodo_id = models.PositiveIntegerField(null=True, blank=True)
    valor = models.TextField(blank=True, default='')
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Valor de evaluación'
        verbose_name_plural = 'Valores de evaluación'
        constraints = [
            models.UniqueConstraint(
                fields=['alternativa', 'escenario', 'nivel', 'nodo_id'],
                name='uniq_valor_eval_alternativa_esc_nodo',
            ),
        ]
        indexes = [
            models.Index(fields=['alternativa', 'nivel', 'nodo_id']),
        ]

    def __str__(self):
        esc = self.escenario_id or 'global'
        return f'Alt {self.alternativa_id} / {esc} / {self.nivel}:{self.nodo_id}'


class SimulacionHistorial(models.Model):
    """Resultado guardado de una ejecución de simulación (historial tipo calculadora)."""

    proyecto = models.ForeignKey(
        Proyecto,
        on_delete=models.CASCADE,
        related_name='simulaciones_historial',
    )
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='simulaciones_historial',
    )
    titulo = models.CharField(max_length=200, blank=True, default='')
    nombre = models.CharField(
        max_length=200,
        blank=True,
        default='',
        verbose_name='Nombre del cálculo',
    )
    resultado = models.JSONField()
    ganador_nombre = models.CharField(max_length=200, blank=True, default='')
    ganador_valor_global = models.DecimalField(
        max_digits=12, decimal_places=6, null=True, blank=True,
    )
    num_alternativas = models.PositiveSmallIntegerField(default=0)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Historial de simulación'
        verbose_name_plural = 'Historial de simulaciones'
        ordering = ['-fecha_creacion', '-id']

    def __str__(self):
        return self.nombre or self.titulo or f'Cálculo #{self.pk} — proyecto {self.proyecto_id}'


class ProyectoMembership(models.Model):
    """Rol de un usuario dentro de un proyecto de selección."""

    ROL_JEFE = 'jefe'
    ROL_ANALISTA = 'analista'
    ROL_EVALUADOR = 'evaluador'
    ROL_OFERTANTE = 'ofertante'
    ROL_AUDITOR = 'auditor'

    ROL_CHOICES = [
        (ROL_JEFE, 'Gerente'),
        (ROL_ANALISTA, 'Ingeniero'),
        (ROL_EVALUADOR, 'Evaluador / experto'),
        (ROL_OFERTANTE, 'Proveedor'),
        (ROL_AUDITOR, 'Auditor (solo lectura)'),
    ]

    proyecto = models.ForeignKey(
        Proyecto, on_delete=models.CASCADE, related_name='memberships'
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='proyecto_memberships',
    )
    rol = models.CharField(max_length=16, choices=ROL_CHOICES)
    activo = models.BooleanField(default=True)
    fecha_acceso_hasta = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Si se define, el acceso al proyecto vence en esta fecha/hora.',
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Membresía de proyecto'
        verbose_name_plural = 'Membresías de proyecto'
        constraints = [
            models.UniqueConstraint(
                fields=['proyecto', 'usuario'],
                name='uniq_proyecto_usuario_membership',
            ),
        ]
        ordering = ['proyecto_id', 'usuario_id']

    def __str__(self):
        return f'{self.usuario_id} → {self.proyecto_id} ({self.rol})'


class EvaluadorMision(models.Model):
    """Ámbito de edición del evaluador: una o más misiones del OMOE."""

    membership = models.ForeignKey(
        ProyectoMembership,
        on_delete=models.CASCADE,
        related_name='misiones_asignadas',
    )
    mision = models.ForeignKey(
        Mision, on_delete=models.CASCADE, related_name='evaluadores_asignados'
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Asignación evaluador → misión'
        verbose_name_plural = 'Asignaciones evaluador → misión'
        constraints = [
            models.UniqueConstraint(
                fields=['membership', 'mision'],
                name='uniq_evaluador_mision',
            ),
        ]

    def __str__(self):
        return f'Evaluador {self.membership_id} → misión {self.mision_id}'


class OfertanteAlternativa(models.Model):
    """Vincula un ofertante a la alternativa que puede editar."""

    membership = models.ForeignKey(
        ProyectoMembership,
        on_delete=models.CASCADE,
        related_name='alternativas_asignadas',
    )
    alternativa = models.ForeignKey(
        Alternativa, on_delete=models.CASCADE, related_name='ofertantes_asignados'
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Asignación ofertante → alternativa'
        verbose_name_plural = 'Asignaciones ofertante → alternativa'
        constraints = [
            models.UniqueConstraint(
                fields=['membership', 'alternativa'],
                name='uniq_ofertante_alternativa',
            ),
        ]

    def __str__(self):
        return f'Ofertante {self.membership_id} → alternativa {self.alternativa_id}'


class UserProfile(models.Model):
    """Datos extendidos del usuario (foto de perfil, etc.)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    foto = models.ImageField(
        upload_to=usuario_foto_upload,
        blank=True,
        null=True,
        max_length=FILE_FIELD_MAX_LENGTH,
    )
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Perfil de usuario'
        verbose_name_plural = 'Perfiles de usuario'

    def __str__(self):
        return f'Perfil de {self.user_id}'


class ConfigArbolHistorial(models.Model):
    """Registro de sesiones de trabajo expertas sobre la configuración del árbol."""

    MOMENTO_ESTRUCTURA = 'estructura'
    MOMENTO_UTILIDAD = 'utilidad'
    MOMENTO_PESOS = 'pesos'
    MOMENTO_EVALUACION = 'evaluacion'

    MOMENTO_CHOICES = [
        (MOMENTO_ESTRUCTURA, 'Estructura del árbol'),
        (MOMENTO_UTILIDAD, 'Funciones de utilidad'),
        (MOMENTO_PESOS, 'Pesos y escenarios'),
        (MOMENTO_EVALUACION, 'Matriz de evaluación'),
    ]

    proyecto = models.ForeignKey(
        Proyecto, on_delete=models.CASCADE, related_name='config_historial',
    )
    omoe = models.ForeignKey(
        Omoe, on_delete=models.CASCADE, null=True, blank=True,
        related_name='config_historial',
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='config_historial_registros',
    )
    momento = models.CharField(max_length=16, choices=MOMENTO_CHOICES)
    notas = models.TextField(blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Historial de configuración del árbol'
        verbose_name_plural = 'Historial de configuración del árbol'
        ordering = ['-fecha_creacion', '-id']

    def __str__(self):
        return f'{self.proyecto_id} · {self.momento} · {self.fecha_creacion:%Y-%m-%d}'


class EventoDecision(models.Model):
    """Mesa de trabajo / reunión de expertos para alimentar el árbol."""

    ESTADO_BORRADOR = 'borrador'
    ESTADO_ACTIVO = 'activo'
    ESTADO_CERRADO = 'cerrado'

    ESTADO_CHOICES = [
        (ESTADO_BORRADOR, 'Borrador'),
        (ESTADO_ACTIVO, 'Activo'),
        (ESTADO_CERRADO, 'Cerrado'),
    ]

    TIPO_CONSENSO = 'consenso'
    TIPO_AGREGACION = 'agregacion'

    TIPO_PROCESO_CHOICES = [
        (TIPO_CONSENSO, 'Consenso directo'),
        (TIPO_AGREGACION, 'Agregación individual (futuro)'),
    ]

    proyecto = models.ForeignKey(
        Proyecto, on_delete=models.CASCADE, related_name='eventos_decision',
    )
    omoe = models.ForeignKey(
        Omoe, on_delete=models.CASCADE, null=True, blank=True,
        related_name='eventos_decision',
    )
    nombre = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    estado = models.CharField(
        max_length=16, choices=ESTADO_CHOICES, default=ESTADO_BORRADOR,
    )
    tipo_proceso = models.CharField(
        max_length=16, choices=TIPO_PROCESO_CHOICES, default=TIPO_CONSENSO,
    )
    mediador_usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='eventos_decision_mediados',
    )
    mediador_nombre = models.CharField(max_length=255, blank=True)
    mediador_cargo = models.CharField(max_length=255, blank=True)
    mediador_dependencia = models.CharField(max_length=255, blank=True)
    fecha_inicio = models.DateTimeField(null=True, blank=True)
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    justificacion_cierre = models.TextField(blank=True)
    ALCANCE_DIMENSION_COMPLETA = 'dimension_completa'
    ALCANCE_NODOS_SELECCIONADOS = 'nodos_seleccionados'
    ALCANCE_MODO_CHOICES = [
        (ALCANCE_DIMENSION_COMPLETA, 'Dimensión completa'),
        (ALCANCE_NODOS_SELECCIONADOS, 'Nodos seleccionados'),
    ]
    alcance_modo = models.CharField(
        max_length=24,
        choices=ALCANCE_MODO_CHOICES,
        default=ALCANCE_DIMENSION_COMPLETA,
    )
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='eventos_decision_creados',
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Evento de decisión'
        verbose_name_plural = 'Eventos de decisión'
        ordering = ['-fecha_creacion', '-id']

    def __str__(self):
        return f'{self.proyecto_id} · {self.nombre} ({self.estado})'


class EventoDecisionParticipante(models.Model):
    evento = models.ForeignKey(
        EventoDecision, on_delete=models.CASCADE, related_name='participantes',
    )
    nombre = models.CharField(max_length=255)
    cargo = models.CharField(max_length=255, blank=True)
    rol = models.CharField(max_length=128, blank=True)
    dependencia = models.CharField(max_length=255, blank=True)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='participaciones_evento_decision',
    )

    class Meta:
        verbose_name = 'Participante de evento'
        verbose_name_plural = 'Participantes de evento'
        ordering = ['nombre', 'id']

    def __str__(self):
        return self.nombre


class EventoDecisionNodo(models.Model):
    """Nodo del árbol incluido en el alcance de auditoría de una sesión."""

    evento = models.ForeignKey(
        EventoDecision, on_delete=models.CASCADE, related_name='nodos_auditoria',
    )
    nodo = models.ForeignKey(
        'NodoArbol', on_delete=models.CASCADE, related_name='sesiones_auditoria',
    )

    class Meta:
        verbose_name = 'Nodo en alcance de sesión'
        verbose_name_plural = 'Nodos en alcance de sesión'
        constraints = [
            models.UniqueConstraint(
                fields=['evento', 'nodo'],
                name='uniq_evento_nodo_auditoria',
            ),
        ]
        ordering = ['nodo__orden_visual', 'nodo__id']

    def __str__(self):
        return f'{self.evento_id} · {self.nodo_id}'


class EventoDecisionRegistro(models.Model):
    """Cambio registrado automáticamente durante un evento activo."""

    TIPO_PESO = 'peso'
    TIPO_UTILIDAD = 'utilidad'
    TIPO_ESTRUCTURA = 'estructura'
    TIPO_MATRIZ = 'matriz'
    TIPO_CONFIG_ESCENARIO = 'config_escenario'
    TIPO_OTRO = 'otro'

    TIPO_CAMBIO_CHOICES = [
        (TIPO_PESO, 'Peso'),
        (TIPO_UTILIDAD, 'Función de utilidad'),
        (TIPO_ESTRUCTURA, 'Estructura del árbol'),
        (TIPO_MATRIZ, 'Matriz de comparación'),
        (TIPO_CONFIG_ESCENARIO, 'Configuración por escenario'),
        (TIPO_OTRO, 'Otro'),
    ]

    evento = models.ForeignKey(
        EventoDecision, on_delete=models.CASCADE, related_name='registros',
    )
    proyecto = models.ForeignKey(
        Proyecto, on_delete=models.CASCADE, related_name='registros_auditoria',
    )
    omoe = models.ForeignKey(
        Omoe, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='registros_auditoria',
    )
    escenario_id = models.IntegerField(null=True, blank=True)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='registros_auditoria',
    )
    tipo_cambio = models.CharField(max_length=24, choices=TIPO_CAMBIO_CHOICES)
    entidad_tipo = models.CharField(max_length=64)
    entidad_id = models.IntegerField(null=True, blank=True)
    entidad_nombre = models.CharField(max_length=255, blank=True)
    campo = models.CharField(max_length=64, blank=True)
    valor_anterior = models.JSONField(null=True, blank=True)
    valor_nuevo = models.JSONField(null=True, blank=True)
    notas = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Registro de auditoría'
        verbose_name_plural = 'Registros de auditoría'
        ordering = ['-fecha_creacion', '-id']

    def __str__(self):
        return f'{self.evento_id} · {self.tipo_cambio} · {self.entidad_nombre}'


class InformeProyectoJob(models.Model):
    """Estado persistente de una generación asíncrona del informe Word."""

    ESTADO_PENDIENTE = 'pending'
    ESTADO_PROCESANDO = 'processing'
    ESTADO_COMPLETADO = 'completed'
    ESTADO_ERROR = 'error'
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, 'Pendiente'),
        (ESTADO_PROCESANDO, 'Procesando'),
        (ESTADO_COMPLETADO, 'Completado'),
        (ESTADO_ERROR, 'Error'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    proyecto = models.ForeignKey(
        Proyecto, on_delete=models.CASCADE, related_name='informe_proyecto_jobs',
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='informe_proyecto_jobs',
    )
    estado = models.CharField(
        max_length=16, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE,
    )
    progreso = models.PositiveSmallIntegerField(default=0)
    etapa = models.CharField(max_length=160, default='Preparando generación')
    incluir_pesos_mapas = models.BooleanField(default=False)
    archivo = models.FileField(
        upload_to='informes_proyecto/%Y/%m/%d/',
        max_length=255,
        null=True,
        blank=True,
    )
    error = models.TextField(blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f'{self.proyecto_id} · {self.estado} · {self.progreso}%'
