"""Serializers del catálogo TipoDimension."""
from rest_framework import serializers

from .escenario_agregacion_choices import ESCENARIO_AGREGACION_CHOICES
from .models import TipoDimension
from .modo_valor_terminal_choices import MODO_VALOR_TERMINAL_CHOICES
from .tipo_dimension_service import validar_codigo


class TipoDimensionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoDimension
        fields = [
            'id',
            'codigo',
            'nombre',
            'descripcion',
            'sentido_optimizacion',
            'escenario_agregacion_default',
            'modo_valor_terminal_default',
            'activo',
            'es_sistema',
            'orden',
            'fecha_creacion',
            'fecha_actualizacion',
        ]
        read_only_fields = ['id', 'es_sistema', 'fecha_creacion', 'fecha_actualizacion']

    def validate_codigo(self, value):
        codigo = validar_codigo(value)
        qs = TipoDimension.objects.filter(codigo=codigo)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Ya existe un tipo con ese código.')
        if self.instance and self.instance.es_sistema and codigo != self.instance.codigo:
            raise serializers.ValidationError(
                'No se puede cambiar el código de un tipo de sistema.'
            )
        return codigo

    def validate_escenario_agregacion_default(self, value):
        allowed = {c[0] for c in ESCENARIO_AGREGACION_CHOICES}
        if value and value not in allowed:
            raise serializers.ValidationError('Agregación no válida.')
        return value

    def validate_modo_valor_terminal_default(self, value):
        allowed = {c[0] for c in MODO_VALOR_TERMINAL_CHOICES}
        if value and value not in allowed:
            raise serializers.ValidationError('Modo de valor no válido.')
        return value

    def update(self, instance, validated_data):
        if instance.es_sistema:
            validated_data.pop('codigo', None)
            validated_data.pop('es_sistema', None)
        return super().update(instance, validated_data)
