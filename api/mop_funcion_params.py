"""Parámetros de usuario por familia de función (MOP / Atributo).

Cada clave de ``FAMILIA_PARAM_SPECS`` coincide con el valor interno del selector
«Familias de funciones aplicadas». La etiqueta visible y la fórmula están en
``api/familia_funciones_doc.py`` (p. ej. ``exponencial_creciente`` → «Exponencial creciente»).
"""

from decimal import Decimal, InvalidOperation

# Especificación: key, label, type (number|text|textarea|option_pool|paired_list), required
FAMILIA_PARAM_SPECS = {
    'razon_relativa': [
        {'key': 'U', 'label': 'U (referencia / máximo)', 'type': 'number', 'required': True},
    ],
    'min_max': [
        {'key': 'L', 'label': 'L (límite inferior)', 'type': 'number', 'required': True},
        {'key': 'U', 'label': 'U (límite superior)', 'type': 'number', 'required': True},
    ],
    'meta_saturada': [
        {'key': 'T', 'label': 'T (meta)', 'type': 'number', 'required': True},
    ],
    'umbral_creciente': [
        {'key': 'L', 'label': 'L (límite inferior)', 'type': 'number', 'required': True},
        {'key': 'U', 'label': 'U (límite superior)', 'type': 'number', 'required': True},
    ],
    'exponencial_creciente': [
        {'key': 'L', 'label': 'L (límite inferior)', 'type': 'number', 'required': True},
        {'key': 'U', 'label': 'U (límite superior)', 'type': 'number', 'required': True},
        {'key': 'k', 'label': 'k (pendiente)', 'type': 'number', 'required': True},
    ],
    'razon_inversa': [
        {'key': 'L', 'label': 'L (referencia / mínimo)', 'type': 'number', 'required': True},
    ],
    'min_max_decreciente': [
        {'key': 'L', 'label': 'L (límite inferior)', 'type': 'number', 'required': True},
        {'key': 'U', 'label': 'U (límite superior)', 'type': 'number', 'required': True},
    ],
    'umbral_decreciente': [
        {'key': 'L', 'label': 'L (límite inferior)', 'type': 'number', 'required': True},
        {'key': 'U', 'label': 'U (límite superior)', 'type': 'number', 'required': True},
    ],
    'exponencial_decreciente': [
        {'key': 'k', 'label': 'k (pendiente)', 'type': 'number', 'required': True},
        {'key': 'L', 'label': 'L (opcional)', 'type': 'number', 'required': False},
        {'key': 'U', 'label': 'U (opcional)', 'type': 'number', 'required': False},
    ],
    'logistica_decreciente': [
        {'key': 'x0', 'label': 'x0 (punto de inflexión)', 'type': 'number', 'required': True},
        {'key': 'k', 'label': 'k (pendiente)', 'type': 'number', 'required': True},
    ],
    'umbral_veto': [
        {'key': 'V', 'label': 'V (umbral de veto)', 'type': 'number', 'required': True},
    ],
    'funcion_saturada': [
        {'key': 'L', 'label': 'L (límite inferior)', 'type': 'number', 'required': True},
        {'key': 'S', 'label': 'S (saturación)', 'type': 'number', 'required': True},
    ],
    'distancia_meta': [
        {'key': 'T', 'label': 'T (meta)', 'type': 'number', 'required': True},
        {'key': 'R', 'label': 'R (radio / tolerancia)', 'type': 'number', 'required': True},
    ],
    'triangular': [
        {'key': 'L', 'label': 'L (límite inferior)', 'type': 'number', 'required': True},
        {'key': 'M', 'label': 'M (óptimo)', 'type': 'number', 'required': True},
        {'key': 'U', 'label': 'U (límite superior)', 'type': 'number', 'required': True},
    ],
    'trapezoidal': [
        {'key': 'L', 'label': 'L (límite inferior)', 'type': 'number', 'required': True},
        {'key': 'M1', 'label': 'M1 (inicio meseta)', 'type': 'number', 'required': True},
        {'key': 'M2', 'label': 'M2 (fin meseta)', 'type': 'number', 'required': True},
        {'key': 'U', 'label': 'U (límite superior)', 'type': 'number', 'required': True},
    ],
    'distancia_ideal': [
        {'key': 'I', 'label': 'I (valor ideal)', 'type': 'number', 'required': True},
        {'key': 'dmax', 'label': 'dmax (distancia máxima, opcional)', 'type': 'number', 'required': False},
    ],
    'escalas_discretas': [
        {
            'key': 'categorias_opciones',
            'label': 'Categorías posibles',
            'type': 'option_pool',
            'required': True,
        },
        {
            'key': 'categorias_utilidad',
            'label': 'Utilidad por categoría',
            'type': 'paired_list',
            'left_key': 'categoria',
            'right_key': 'utilidad',
            'options_from': 'categorias_opciones',
            'required': True,
        },
    ],
    'funciones_tramos': [
        {
            'key': 'puntos_corte',
            'label': 'Puntos de corte (separados por coma)',
            'type': 'text',
            'required': True,
        },
        {
            'key': 'regla_por_tramo',
            'label': 'Regla por tramo',
            'type': 'textarea',
            'required': True,
        },
    ],
    'tablas_equivalencia': [
        {
            'key': 'estados_opciones',
            'label': 'Valores o estados posibles',
            'type': 'option_pool',
            'required': True,
        },
        {
            'key': 'equivalencias',
            'label': 'Tabla de equivalencias',
            'type': 'paired_list',
            'left_key': 'estado',
            'right_key': 'utilidad',
            'options_from': 'estados_opciones',
            'required': True,
        },
    ],
}


def default_parametros_for_familia(familia):
    params = {}
    for spec in FAMILIA_PARAM_SPECS.get(familia, []):
        t = spec['type']
        if t == 'option_pool':
            params[spec['key']] = []
        elif t == 'paired_list':
            params[spec['key']] = []
        else:
            params[spec['key']] = ''
    return params


def _is_number(val):
    if val is None or val == '':
        return False
    try:
        Decimal(str(val))
        return True
    except (InvalidOperation, ValueError):
        return False


def validate_parametros_funcion(familia, parametros):
    if not familia:
        return {}
    specs = FAMILIA_PARAM_SPECS.get(familia, [])
    if not specs:
        return {}
    data = parametros if isinstance(parametros, dict) else {}
    errors = {}

    for spec in specs:
        key = spec['key']
        val = data.get(key)
        t = spec['type']

        if t == 'option_pool':
            if spec.get('required') and (not val or not isinstance(val, list) or len(val) == 0):
                errors[key] = f'Defina al menos una opción en «{spec["label"]}».'
            continue

        if t == 'paired_list':
            options_key = spec.get('options_from')
            options = data.get(options_key) or []
            rows = val if isinstance(val, list) else []
            if spec.get('required') and len(rows) == 0:
                errors[key] = f'Agregue al menos una fila en «{spec["label"]}».'
                continue
            left_key = spec.get('left_key', 'estado')
            right_key = spec.get('right_key', 'utilidad')
            for i, row in enumerate(rows):
                if not isinstance(row, dict):
                    errors[key] = 'Formato de filas inválido.'
                    break
                left = (row.get(left_key) or '').strip()
                right = row.get(right_key)
                if not left:
                    errors[key] = f'Fila {i + 1}: seleccione {left_key}.'
                    break
                if options and left not in options:
                    errors[key] = f'Fila {i + 1}: {left_key} no está en las opciones definidas.'
                    break
                if right is None or right == '':
                    errors[key] = f'Fila {i + 1}: ingrese {right_key}.'
                    break
                if not _is_number(right):
                    errors[key] = f'Fila {i + 1}: {right_key} debe ser numérico.'
                    break
            continue

        if spec.get('required') and (val is None or val == ''):
            errors[key] = f'«{spec["label"]}» es obligatorio.'
        elif val not in (None, '') and t == 'number' and not _is_number(val):
            errors[key] = f'«{spec["label"]}» debe ser numérico.'

    if errors:
        from rest_framework import serializers
        raise serializers.ValidationError({'parametros_funcion': errors})

    result = default_parametros_for_familia(familia)
    for key in result:
        if key in data:
            result[key] = data[key]
    return result
