"""Exportación de curvas de utilidad finales por nodo terminal y escenario."""
from __future__ import annotations

from typing import Any

from django.utils import timezone

from .evaluacion_service import build_evaluacion_schema
from .models import Proyecto


def build_curvas_utilidad_export(proyecto: Proyecto) -> dict[str, Any]:
    schema = build_evaluacion_schema(proyecto)
    dimensiones_out: list[dict[str, Any]] = []

    for dim in schema.get('dimensiones') or []:
        curvas: list[dict[str, Any]] = []
        for col in dim.get('columnas') or []:
            if (col.get('modo_evaluacion') or 'certeza') == 'incertidumbre':
                continue
            if not (col.get('familia_funciones') or '').strip():
                continue
            curvas.append({
                'key': col.get('key'),
                'nivel': col.get('nivel'),
                'nodo_id': col.get('nodo_id'),
                'terminal_nombre': col.get('terminal_nombre') or col.get('label'),
                'escenario_id': col.get('escenario_id'),
                'escenario_nombre': col.get('escenario_nombre'),
                'escenario_label': col.get('escenario_label'),
                'familia_funciones': col.get('familia_funciones'),
                'tipo_criterio': col.get('tipo_criterio') or '',
                'constantes': col.get('constantes') or {},
                'constantes_display': col.get('constantes_display') or '',
                'unidad': col.get('unidad') or '',
            })
        dimensiones_out.append({
            'omoe_id': dim.get('omoe_id'),
            'omoe_nombre': dim.get('omoe_nombre'),
            'rama_evaluacion': dim.get('rama_evaluacion'),
            'escenario_agregacion': dim.get('escenario_agregacion'),
            'modo_valor_terminal': dim.get('modo_valor_terminal'),
            'curvas': curvas,
        })

    return {
        'proyecto_id': proyecto.id,
        'proyecto_nombre': proyecto.nombre,
        'generado_en': timezone.now().isoformat(),
        'tipo': 'curvas_utilidad_finales',
        'dimensiones': dimensiones_out,
    }
