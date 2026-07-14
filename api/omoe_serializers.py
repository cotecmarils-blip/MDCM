from rest_framework import serializers

from .calculation_method_choices import (
    CALCULATION_METHOD_VALUES,
    DEFAULT_CALCULATION_METHOD,
    merge_calculation_config,
)
from .arbol_nivel_service import next_orden_visual
from .nodo_arbol_serializers import serialize_nodo_roots
from .mop_criterio_choices import TIPO_CRITERIO_VALUES, is_familia_valid_for_tipo
from .mop_funcion_params import validate_parametros_funcion
from .riesgo_nodo_utils import (
    MODO_CERTEZA,
    MODO_INCERTIDUMBRE,
    clean_consecuencia_descripciones,
)
from .models import Omoe, Mision, GrupoAfinidad, MopCriterio, DpCriterio, VopResultado


def _nombre_nodo(obj, attr):
    return getattr(obj, attr, None) or ''


class DpCriterioSerializer(serializers.ModelSerializer):
    parent_id = serializers.IntegerField(source='mop_id', read_only=True)
    nivel = serializers.SerializerMethodField()
    nombre = serializers.SerializerMethodField()

    class Meta:
        model = DpCriterio
        fields = [
            'id', 'nivel', 'nombre', 'parent_id', 'mop',
            'nombre_dp', 'codigo', 'descripcion_tecnica', 'tipo_dato', 'unidad',
            'valor_umbral', 'valor_meta', 'sentido_mejora', 'peso',
            'fuente_informacion', 'requiere_evidencia', 'tipo_evidencia',
            'familia_funciones', 'parametros_funcion', 'observaciones', 'orden_visual',
            'fecha_creacion', 'fecha_actualizacion',
        ]
        read_only_fields = ['id', 'orden_visual', 'fecha_creacion', 'fecha_actualizacion']
        extra_kwargs = {'mop': {'write_only': True}}

    def get_nivel(self, obj):
        return 'dp'

    def get_nombre(self, obj):
        return _nombre_nodo(obj, 'nombre_dp')

    def validate(self, attrs):
        familia = attrs.get(
            'familia_funciones',
            getattr(self.instance, 'familia_funciones', '') or '',
        )
        params_in = attrs.get('parametros_funcion')
        if params_in is not None or familia:
            merged = params_in
            if merged is None and self.instance:
                merged = self.instance.parametros_funcion or {}
            if merged is None:
                merged = {}
            attrs['parametros_funcion'] = validate_parametros_funcion(familia, merged)
        if self.instance is None:
            mop = attrs.get('mop')
            mop_id = getattr(mop, 'id', None)
            if mop_id is None:
                parent_id = self.initial_data.get('parent_id')
                if parent_id is not None:
                    try:
                        mop_id = int(parent_id)
                    except (TypeError, ValueError):
                        mop_id = None
            if mop_id is not None:
                attrs['orden_visual'] = next_orden_visual(
                    DpCriterio.objects.filter(mop_id=mop_id),
                )
        if self.instance is not None and 'peso' in attrs:
            from .peso_service import siblings_qs_dp, validate_peso_with_siblings

            validate_peso_with_siblings(
                siblings_qs_dp(self.instance),
                instance_pk=self.instance.pk,
                new_peso=attrs.get('peso'),
            )
        return attrs


class MopCriterioSerializer(serializers.ModelSerializer):
    parent_id = serializers.IntegerField(source='grupo_afinidad_id', read_only=True)
    nivel = serializers.SerializerMethodField()
    nombre = serializers.SerializerMethodField()
    dps = DpCriterioSerializer(many=True, read_only=True)

    class Meta:
        model = MopCriterio
        fields = [
            'id', 'nivel', 'nombre', 'parent_id', 'grupo_afinidad', 'dps',
            'nombre_mop', 'codigo', 'descripcion_indicador', 'tipo_mop', 'unidad_medida',
            'peso', 'valor_umbral', 'valor_meta', 'sentido_mejora', 'metodo_evaluacion',
            'familia_funciones', 'parametros_funcion',
            'valor_minimo_utilidad', 'valor_maximo_utilidad',
            'fuente_dato', 'evidencia_requerida', 'aplica', 'observaciones', 'orden_visual',
            'fecha_creacion', 'fecha_actualizacion',
        ]
        read_only_fields = ['id', 'orden_visual', 'fecha_creacion', 'fecha_actualizacion']
        extra_kwargs = {'grupo_afinidad': {'write_only': True}}

    def get_nivel(self, obj):
        return 'mop'

    def get_nombre(self, obj):
        return _nombre_nodo(obj, 'nombre_mop')

    def validate(self, attrs):
        tipo = attrs.get('tipo_mop', getattr(self.instance, 'tipo_mop', '') or '')
        familia = attrs.get(
            'familia_funciones',
            getattr(self.instance, 'familia_funciones', '') or '',
        )
        if tipo and tipo not in TIPO_CRITERIO_VALUES:
            raise serializers.ValidationError({'tipo_mop': 'Tipo de MOP no válido.'})
        if familia and tipo and not is_familia_valid_for_tipo(tipo, familia):
            raise serializers.ValidationError(
                {'familia_funciones': 'La función no corresponde al tipo de MOP.'}
            )
        params_in = attrs.get('parametros_funcion')
        if params_in is not None or familia:
            merged = params_in
            if merged is None and self.instance:
                merged = self.instance.parametros_funcion or {}
            if merged is None:
                merged = {}
            attrs['parametros_funcion'] = validate_parametros_funcion(familia, merged)
        if self.instance is None:
            grupo = attrs.get('grupo_afinidad')
            grupo_id = getattr(grupo, 'id', None)
            if grupo_id is None:
                parent_id = self.initial_data.get('parent_id')
                if parent_id is not None:
                    try:
                        grupo_id = int(parent_id)
                    except (TypeError, ValueError):
                        grupo_id = None
            if grupo_id is not None:
                attrs['orden_visual'] = next_orden_visual(
                    MopCriterio.objects.filter(grupo_afinidad_id=grupo_id),
                )
        if self.instance is not None and 'peso' in attrs:
            from .peso_service import siblings_qs_mop, validate_peso_with_siblings

            if attrs.get('aplica', self.instance.aplica) is not False:
                validate_peso_with_siblings(
                    siblings_qs_mop(self.instance),
                    instance_pk=self.instance.pk,
                    new_peso=attrs.get('peso'),
                )
        return attrs


class GrupoAfinidadSerializer(serializers.ModelSerializer):
    parent_id = serializers.SerializerMethodField()
    nivel = serializers.SerializerMethodField()
    nombre = serializers.SerializerMethodField()
    mops = MopCriterioSerializer(many=True, read_only=True)

    class Meta:
        model = GrupoAfinidad
        fields = [
            'id', 'nivel', 'nombre', 'parent_id', 'omoe', 'mision', 'mops',
            'nombre_grupo', 'codigo', 'descripcion_funcional',
            'tipo_mop', 'familia_funciones', 'parametros_funcion',
            'rama_evaluacion',
            'peso', 'orden_visual',
            'aplica', 'justificacion_peso', 'observaciones',
            'fecha_creacion', 'fecha_actualizacion',
        ]
        read_only_fields = ['id', 'orden_visual', 'fecha_creacion', 'fecha_actualizacion']
        extra_kwargs = {
            'omoe': {'write_only': True},
            'mision': {'write_only': True},
        }

    def get_parent_id(self, obj):
        return obj.omoe_id or obj.mision_id

    def get_nivel(self, obj):
        return 'grupo_afinidad'

    def get_nombre(self, obj):
        return _nombre_nodo(obj, 'nombre_grupo')

    def validate(self, attrs):
        familia = attrs.get(
            'familia_funciones',
            getattr(self.instance, 'familia_funciones', '') or '',
        )
        tipo = attrs.get('tipo_mop', getattr(self.instance, 'tipo_mop', '') or '')
        params_in = attrs.get('parametros_funcion')
        if params_in is not None or familia:
            merged = params_in
            if merged is None and self.instance:
                merged = self.instance.parametros_funcion or {}
            if merged is None:
                merged = {}
            attrs['parametros_funcion'] = validate_parametros_funcion(familia, merged)
        if tipo and familia:
            if not is_familia_valid_for_tipo(tipo, familia):
                raise serializers.ValidationError({
                    'familia_funciones': 'Familia no válida para el tipo de criterio.',
                })
        if self.instance is None:
            omoe_id = getattr(attrs.get('omoe'), 'id', None)
            mision_id = getattr(attrs.get('mision'), 'id', None)
            if omoe_id is None and mision_id is None:
                parent_id = self.initial_data.get('parent_id')
                if parent_id is not None:
                    try:
                        parent_id = int(parent_id)
                    except (TypeError, ValueError):
                        parent_id = None
                    if parent_id is not None:
                        if Omoe.objects.filter(pk=parent_id).exists():
                            omoe_id = parent_id
                        elif Mision.objects.filter(pk=parent_id).exists():
                            mision_id = parent_id
            if omoe_id is not None:
                attrs['orden_visual'] = next_orden_visual(
                    GrupoAfinidad.objects.filter(omoe_id=omoe_id),
                )
            elif mision_id is not None:
                attrs['orden_visual'] = next_orden_visual(
                    GrupoAfinidad.objects.filter(mision_id=mision_id),
                )
        if self.instance is not None and 'peso' in attrs:
            from .peso_service import siblings_qs_grupo_afinidad, validate_peso_with_siblings

            if attrs.get('aplica', self.instance.aplica) is not False:
                validate_peso_with_siblings(
                    siblings_qs_grupo_afinidad(self.instance),
                    instance_pk=self.instance.pk,
                    new_peso=attrs.get('peso'),
                )
        return attrs


class MisionSerializer(serializers.ModelSerializer):
    parent_id = serializers.IntegerField(source='omoe_id', read_only=True)
    nivel = serializers.SerializerMethodField()
    nombre = serializers.SerializerMethodField()
    grupos = GrupoAfinidadSerializer(many=True, read_only=True)

    class Meta:
        model = Mision
        fields = [
            'id', 'nivel', 'nombre', 'parent_id', 'omoe', 'grupos',
            'nombre_mision', 'codigo', 'descripcion_operacional', 'peso', 'orden_visual',
            'aplica', 'responsable_validacion', 'justificacion_peso', 'observaciones',
            'fecha_creacion', 'fecha_actualizacion',
        ]
        read_only_fields = ['id', 'orden_visual', 'fecha_creacion', 'fecha_actualizacion']
        extra_kwargs = {'omoe': {'write_only': True}}

    def get_nivel(self, obj):
        return 'mision'

    def get_nombre(self, obj):
        return _nombre_nodo(obj, 'nombre_mision')

    def validate(self, attrs):
        if self.instance is None:
            omoe = attrs.get('omoe')
            omoe_id = getattr(omoe, 'id', None)
            if omoe_id is None:
                parent_id = self.initial_data.get('parent_id')
                if parent_id is not None:
                    try:
                        parent_id = int(parent_id)
                    except (TypeError, ValueError):
                        parent_id = None
                    if parent_id is not None and Omoe.objects.filter(pk=parent_id).exists():
                        omoe_id = parent_id
            if omoe_id is not None:
                attrs['orden_visual'] = next_orden_visual(
                    Mision.objects.filter(omoe_id=omoe_id),
                )
        if self.instance is not None and 'peso' in attrs:
            from .peso_service import siblings_qs_mision, validate_peso_with_siblings

            if attrs.get('aplica', self.instance.aplica) is not False:
                validate_peso_with_siblings(
                    siblings_qs_mision(self.instance),
                    instance_pk=self.instance.pk,
                    new_peso=attrs.get('peso'),
                )
        return attrs


class OmoeSerializer(serializers.ModelSerializer):
    parent_id = serializers.SerializerMethodField()
    nivel = serializers.SerializerMethodField()
    nombre = serializers.SerializerMethodField()
    nodos = serializers.SerializerMethodField()
    grupos = GrupoAfinidadSerializer(many=True, read_only=True)
    misiones = MisionSerializer(many=True, read_only=True)

    class Meta:
        model = Omoe
        fields = [
            'id', 'nivel', 'nombre', 'parent_id', 'proyecto', 'nodos', 'grupos', 'misiones',
            'nombre_modelo', 'codigo', 'descripcion_general', 'rama_evaluacion',
            'version', 'responsable',
            'estado', 'rango_minimo', 'rango_maximo', 'observaciones', 'orden',
            'tipo_criterio', 'familia_funciones', 'parametros_funcion',
            'modo_evaluacion', 'consecuencia_descripciones',
            'unidad', 'tipo_dato', 'valor_umbral', 'valor_meta', 'sentido_mejora',
            'calculation_method', 'calculation_config', 'enable_sensitivity_analysis',
            'escenario_agregacion', 'modo_valor_terminal',
            'fecha_creacion', 'fecha_actualizacion',
        ]
        read_only_fields = ['id', 'orden', 'fecha_creacion', 'fecha_actualizacion']

    def validate(self, attrs):
        tipo_criterio = attrs.get(
            'tipo_criterio',
            getattr(self.instance, 'tipo_criterio', '') or '',
        )
        familia = attrs.get(
            'familia_funciones',
            getattr(self.instance, 'familia_funciones', '') or '',
        )
        modo = attrs.get(
            'modo_evaluacion',
            getattr(self.instance, 'modo_evaluacion', '') or MODO_CERTEZA,
        )
        if modo and modo not in (MODO_CERTEZA, MODO_INCERTIDUMBRE):
            raise serializers.ValidationError({'modo_evaluacion': 'Modo de evaluación no válido.'})
        if 'consecuencia_descripciones' in attrs:
            attrs['consecuencia_descripciones'] = clean_consecuencia_descripciones(
                attrs.get('consecuencia_descripciones'),
            )

        if modo != MODO_INCERTIDUMBRE:
            if tipo_criterio and tipo_criterio not in TIPO_CRITERIO_VALUES:
                raise serializers.ValidationError({'tipo_criterio': 'Tipo de criterio no válido.'})
            if familia and tipo_criterio and not is_familia_valid_for_tipo(tipo_criterio, familia):
                raise serializers.ValidationError({
                    'familia_funciones': 'La función no corresponde al tipo de criterio.',
                })
        params_in = attrs.get('parametros_funcion')
        if modo != MODO_INCERTIDUMBRE and familia and (params_in is not None or self.instance):
            merged = params_in
            if merged is None and self.instance:
                merged = self.instance.parametros_funcion or {}
            if merged is None:
                merged = {}
            attrs['parametros_funcion'] = validate_parametros_funcion(familia, merged)
        elif 'parametros_funcion' not in attrs and not familia:
            attrs.setdefault('parametros_funcion', {})

        method = attrs.get(
            'calculation_method',
            getattr(self.instance, 'calculation_method', DEFAULT_CALCULATION_METHOD),
        )
        if method and method not in CALCULATION_METHOD_VALUES:
            raise serializers.ValidationError({
                'calculation_method': 'Método de cálculo no válido.',
            })
        attrs['calculation_method'] = method or DEFAULT_CALCULATION_METHOD

        raw_config = attrs.get('calculation_config')
        if raw_config is None and self.instance:
            raw_config = self.instance.calculation_config
        attrs['calculation_config'] = merge_calculation_config(
            attrs['calculation_method'],
            raw_config or {},
        )

        if attrs['calculation_method'] == 'UTA':
            prefs = (attrs['calculation_config'].get('preferences') or {})
            if not (prefs.get('ranking') or prefs.get('preferred_pairs') or prefs.get('indifference_pairs')):
                if self.context.get('require_uta_preferences'):
                    raise serializers.ValidationError({
                        'calculation_config': 'UTA: configure preferencias antes de evaluar.',
                    })

        from .escenario_agregacion_choices import (
            ESCENARIO_AGREG_COMPENSATORIO,
            ESCENARIO_AGREG_MINIMO_MEJOR,
        )
        from .modo_valor_terminal_choices import MODO_VALOR_BRUTO, MODO_VALOR_UTILIDAD
        from .tipo_dimension_service import assert_codigo_activo, defaults_for_codigo

        rama = attrs.get(
            'rama_evaluacion',
            getattr(self.instance, 'rama_evaluacion', '') or 'omoe',
        )
        if 'rama_evaluacion' in attrs or not self.instance:
            try:
                rama = assert_codigo_activo(rama)
            except Exception as exc:
                from django.core.exceptions import ValidationError as DjangoValidationError
                if isinstance(exc, DjangoValidationError):
                    msg = exc.messages[0] if getattr(exc, 'messages', None) else str(exc)
                    raise serializers.ValidationError({'rama_evaluacion': msg}) from exc
                raise
            attrs['rama_evaluacion'] = rama

        defs = defaults_for_codigo(rama)
        if 'escenario_agregacion' not in attrs:
            attrs['escenario_agregacion'] = defs.get(
                'escenario_agregacion', ESCENARIO_AGREG_COMPENSATORIO,
            )
        if 'modo_valor_terminal' not in attrs:
            attrs['modo_valor_terminal'] = defs.get(
                'modo_valor_terminal', MODO_VALOR_UTILIDAD,
            )

        return attrs

    def get_parent_id(self, obj):
        return None

    def get_nivel(self, obj):
        return 'omoe'

    def get_nombre(self, obj):
        return _nombre_nodo(obj, 'nombre_modelo')

    def get_nodos(self, obj):
        return serialize_nodo_roots(obj)


class VopResultadoSerializer(serializers.ModelSerializer):
    nodo_evaluado_id = serializers.IntegerField(source='dp_id', read_only=True)
    nodo_evaluado_nombre = serializers.CharField(source='dp.nombre_dp', read_only=True)

    class Meta:
        model = VopResultado
        fields = [
            'id', 'alternativa', 'dp', 'nodo_evaluado_id', 'nodo_evaluado_nombre',
            'valor_real_ofertado', 'unidad', 'funcion_utilidad_aplicada',
            'valor_umbral', 'valor_meta', 'vop_calculado', 'cumplimiento_minimo',
            'evidencia', 'observaciones',
            'fecha_creacion', 'fecha_actualizacion',
        ]
        read_only_fields = ['id', 'fecha_creacion', 'fecha_actualizacion']
