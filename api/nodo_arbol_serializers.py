"""Serializers del árbol flexible de 7 niveles."""
from __future__ import annotations

from rest_framework import serializers

from .arbol_nivel_service import (
    MAX_NIVELES_ARBOL,
    effective_rama_for_omoe,
    get_max_nivel_orden,
    next_orden_visual_nodo,
)
from .mop_criterio_choices import TIPO_CRITERIO_VALUES, is_familia_valid_for_tipo
from .mop_funcion_params import validate_parametros_funcion
from .riesgo_nodo_utils import (
    MODO_CERTEZA,
    MODO_INCERTIDUMBRE,
    clean_consecuencia_descripciones,
)
from .models import NodoArbol, Omoe, ProyectoNivelArbol


class ProyectoNivelArbolSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProyectoNivelArbol
        fields = [
            'id', 'proyecto', 'rama_evaluacion', 'orden', 'codigo', 'nombre', 'activo',
            'fecha_creacion', 'fecha_actualizacion',
        ]
        read_only_fields = ['id', 'codigo', 'fecha_creacion', 'fecha_actualizacion']


class NodoArbolSerializer(serializers.ModelSerializer):
    parent_id = serializers.IntegerField(source='parent_id_prop', read_only=True)
    nivel = serializers.SerializerMethodField()
    nombre_display = serializers.SerializerMethodField()
    tipo_nivel_nombre = serializers.CharField(source='tipo_nivel.nombre', read_only=True)
    tipo_nivel_orden = serializers.IntegerField(source='tipo_nivel.orden', read_only=True)
    tipo_nivel_codigo = serializers.CharField(source='tipo_nivel.codigo', read_only=True)
    hijos = serializers.SerializerMethodField()

    class Meta:
        model = NodoArbol
        fields = [
            'id', 'nivel', 'nombre', 'nombre_display', 'parent_id', 'omoe', 'omoe_id', 'parent',
            'tipo_nivel', 'tipo_nivel_nombre', 'tipo_nivel_orden', 'tipo_nivel_codigo',
            'codigo', 'descripcion', 'peso', 'orden_visual', 'aplica',
            'justificacion_peso', 'observaciones',
            'tipo_criterio', 'familia_funciones', 'parametros_funcion',
            'modo_evaluacion', 'consecuencia_descripciones',
            'unidad', 'tipo_dato', 'valor_umbral', 'valor_meta', 'sentido_mejora',
            'metodo_evaluacion', 'valor_minimo_utilidad', 'valor_maximo_utilidad',
            'fuente_dato', 'evidencia_requerida', 'tipo_evidencia',
            'hijos', 'fecha_creacion', 'fecha_actualizacion',
        ]
        read_only_fields = ['id', 'omoe_id', 'orden_visual', 'fecha_creacion', 'fecha_actualizacion']
        extra_kwargs = {
            'omoe': {'write_only': True},
            'parent': {'write_only': True, 'required': False, 'allow_null': True},
            'peso': {'required': False, 'allow_null': True},
        }

    def get_nivel(self, obj):
        return 'nodo_arbol'

    def get_nombre_display(self, obj):
        return obj.nombre

    def get_hijos(self, obj):
        cache = self.context.get('hijos_by_parent')
        if cache is not None:
            children = cache.get(obj.id, [])
            return NodoArbolSerializer(children, many=True, context=self.context).data
        children = obj.hijos.filter(aplica=True).select_related('tipo_nivel').order_by(
            'orden_visual', 'id'
        )
        return NodoArbolSerializer(children, many=True, context=self.context).data

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

        if attrs.get('peso') is None:
            from .peso_service import default_peso_for_new_sibling
            omoe = attrs.get('omoe') or getattr(self.instance, 'omoe', None)
            parent = attrs.get('parent')
            parent_id = getattr(parent, 'id', None) if parent else getattr(
                self.instance, 'parent_id', None
            )
            omoe_id = getattr(omoe, 'id', None) if omoe else getattr(
                self.instance, 'omoe_id', None
            )
            if omoe_id is not None:
                attrs['peso'] = default_peso_for_new_sibling(omoe_id, parent_id)
            else:
                from decimal import Decimal
                attrs['peso'] = Decimal('100')

        if self.instance is not None and 'peso' in attrs:
            aplica = attrs.get('aplica', self.instance.aplica)
            if aplica is not False:
                from .peso_service import validate_peso_with_siblings

                validate_peso_with_siblings(
                    NodoArbol.objects.filter(
                        omoe_id=self.instance.omoe_id,
                        parent_id=self.instance.parent_id,
                        aplica=True,
                    ),
                    instance_pk=self.instance.pk,
                    new_peso=attrs.get('peso'),
                )

        tipo_nivel = attrs.get('tipo_nivel') or getattr(self.instance, 'tipo_nivel', None)
        omoe = attrs.get('omoe') or getattr(self.instance, 'omoe', None)
        if tipo_nivel and omoe and tipo_nivel.proyecto_id != omoe.proyecto_id:
            raise serializers.ValidationError({
                'tipo_nivel': 'El tipo de nivel no pertenece al proyecto de la dimensión.',
            })

        if tipo_nivel and omoe:
            omoe_rama = effective_rama_for_omoe(omoe)
            if tipo_nivel.rama_evaluacion != omoe_rama:
                # Las ramas suelen compartir nombres/órdenes, pero cada una tiene IDs
                # propios. Si el cliente conserva un ID de otra pestaña/rama, traducirlo
                # al nivel equivalente de la dimensión en vez de rechazar la creación.
                equivalente = ProyectoNivelArbol.objects.filter(
                    proyecto_id=omoe.proyecto_id,
                    rama_evaluacion=omoe_rama,
                    orden=tipo_nivel.orden,
                    activo=True,
                ).first()
                if equivalente is None:
                    raise serializers.ValidationError({
                        'tipo_nivel': (
                            'No existe un nivel equivalente activo para '
                            f'{omoe_rama.upper()} en el orden {tipo_nivel.orden}.'
                        ),
                    })
                tipo_nivel = equivalente
                attrs['tipo_nivel'] = equivalente

        if tipo_nivel:
            parent = attrs.get('parent')
            if 'parent' not in attrs and self.instance is not None:
                parent = self.instance.parent

            if parent is None and self.instance is None:
                parent_id = self.initial_data.get('parent_id')
                if parent_id is not None:
                    try:
                        parent_id = int(parent_id)
                    except (TypeError, ValueError):
                        parent_id = None
                    if parent_id is not None and not Omoe.objects.filter(pk=parent_id).exists():
                        parent = (
                            NodoArbol.objects.filter(pk=parent_id)
                            .select_related('tipo_nivel')
                            .first()
                        )

            proyecto_id = omoe.proyecto_id if omoe else getattr(self.instance, 'omoe_id', None)
            omoe_rama = effective_rama_for_omoe(omoe) if omoe else None
            if proyecto_id and omoe_rama:
                max_orden = get_max_nivel_orden(proyecto_id, omoe_rama) or MAX_NIVELES_ARBOL
            else:
                max_orden = MAX_NIVELES_ARBOL

            if parent is not None:
                if parent.tipo_nivel.orden >= max_orden:
                    raise serializers.ValidationError({
                        'parent': 'Este nodo no puede tener hijos (nivel máximo del árbol).',
                    })
                if tipo_nivel.orden <= parent.tipo_nivel.orden:
                    raise serializers.ValidationError({
                        'tipo_nivel': (
                            f'El hijo debe ser de un nivel inferior al padre '
                            f'(padre nivel {parent.tipo_nivel.orden}, '
                            f'recibido nivel {tipo_nivel.orden}).'
                        ),
                    })
            elif tipo_nivel.orden < 1 or tipo_nivel.orden > max_orden:
                raise serializers.ValidationError({
                    'tipo_nivel': f'El nivel debe estar entre 1 y {max_orden}.',
                })

        if self.instance is None:
            omoe_id = None
            parent_id = None
            omoe = attrs.get('omoe')
            if omoe:
                omoe_id = omoe.id
            parent = attrs.get('parent')
            if parent is not None:
                parent_id = parent.id
                omoe_id = omoe_id or parent.omoe_id
            if omoe_id is None:
                raw_parent_id = self.initial_data.get('parent_id')
                if raw_parent_id is not None:
                    try:
                        raw_parent_id = int(raw_parent_id)
                    except (TypeError, ValueError):
                        raw_parent_id = None
                    if raw_parent_id is not None:
                        if Omoe.objects.filter(pk=raw_parent_id).exists():
                            omoe_id = raw_parent_id
                            parent_id = None
                        else:
                            nodo_padre = (
                                NodoArbol.objects.filter(pk=raw_parent_id)
                                .select_related('omoe')
                                .first()
                            )
                            if nodo_padre:
                                parent_id = nodo_padre.id
                                omoe_id = nodo_padre.omoe_id

        return attrs

    def create(self, validated_data):
        omoe = validated_data.get('omoe')
        parent = validated_data.get('parent')
        tipo_nivel = validated_data.get('tipo_nivel')
        omoe_id = omoe.id if omoe else None
        parent_id = parent.id if parent else None
        if omoe_id is None and parent is not None:
            omoe_id = parent.omoe_id
        if omoe_id is not None:
            validated_data['orden_visual'] = next_orden_visual_nodo(
                omoe_id=omoe_id,
                parent_id=parent_id,
                tipo_nivel_id=tipo_nivel.id if tipo_nivel else None,
            )
        return super().create(validated_data)


def build_hijos_cache(omoe_id: int) -> dict[int, list[NodoArbol]]:
    nodos = list(
        NodoArbol.objects.filter(omoe_id=omoe_id, aplica=True)
        .select_related('tipo_nivel')
    )
    by_parent: dict[int | None, list[NodoArbol]] = {}
    for nodo in nodos:
        by_parent.setdefault(nodo.parent_id, []).append(nodo)

    def _sort_key(n: NodoArbol) -> tuple:
        tipo_orden = n.tipo_nivel.orden if n.tipo_nivel_id else 0
        return (tipo_orden, n.orden_visual, n.id)

    for parent_id, nodes in by_parent.items():
        # Autocorregir empates / ceros: orden de creación (id) como desempate estable.
        orders = [n.orden_visual for n in nodes]
        needs_renumber = (
            len(nodes) > 1
            and (len(set(orders)) != len(orders) or orders.count(0) > 1)
        )
        if needs_renumber:
            sorted_nodes = sorted(nodes, key=lambda n: (n.orden_visual, n.id))
            updates = []
            for i, n in enumerate(sorted_nodes, start=1):
                if n.orden_visual != i:
                    n.orden_visual = i
                    updates.append(n)
            if updates:
                NodoArbol.objects.bulk_update(updates, ['orden_visual'])
            nodes[:] = sorted_nodes
        else:
            nodes.sort(key=_sort_key)

    return by_parent


def serialize_nodo_roots(omoe: Omoe) -> list[dict]:
    cache = build_hijos_cache(omoe.id)
    all_roots = cache.get(None, [])
    ctx = {'hijos_by_parent': {k: v for k, v in cache.items() if k is not None}}
    return NodoArbolSerializer(all_roots, many=True, context=ctx).data
