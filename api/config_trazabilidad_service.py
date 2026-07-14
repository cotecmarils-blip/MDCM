"""Consulta y trazabilidad de la configuración del árbol por momentos de trabajo."""

from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model

from .models import ConfigArbolHistorial, NodoArbol, Omoe, Proyecto
from .simulacion_service import validar_simulacion

User = get_user_model()

MOMENTOS = (
    {
        'id': 'estructura',
        'label': 'Estructura del árbol',
        'descripcion': (
            'Definir dimensiones, niveles y nodos (nombres, jerarquía). '
            'No requiere funciones de utilidad ni pesos.'
        ),
        'modulo': 'Árbol de dimensiones',
        'tipos_faltante': {'configuracion'},
    },
    {
        'id': 'utilidad',
        'label': 'Funciones de valor marginal',
        'descripcion': (
            'Sesión con expertos: tipo de criterio, familia de funciones y parámetros (L, U, k…). '
            'Solo en nodos terminales evaluables.'
        ),
        'modulo': 'Árbol de dimensiones',
        'tipos_faltante': {'constante'},
    },
    {
        'id': 'pesos',
        'label': 'Pesos y escenarios',
        'descripcion': (
            'Sesión con expertos: pesos entre hermanos, escenarios y calibración AHP.'
        ),
        'modulo': 'Definición de escenarios',
        'tipos_faltante': {'peso'},
    },
    {
        'id': 'evaluacion',
        'label': 'Matriz de evaluación',
        'descripcion': 'Valores x por alternativa y criterio terminal.',
        'modulo': 'Evaluación',
        'tipos_faltante': {'valor_evaluacion'},
    },
)

MOMENTO_ORDER = [m['id'] for m in MOMENTOS]


def _nodos_sin_utilidad(omoe: Omoe) -> list[dict[str, Any]]:
    """Terminales evaluables sin función configurada (pendiente de sesión de expertos)."""
    nodos = NodoArbol.objects.filter(omoe=omoe, aplica=True).select_related('tipo_nivel')
    parent_ids = set(nodos.values_list('parent_id', flat=True))
    pendientes = []
    for n in nodos:
        if n.id in parent_ids:
            continue
        if n.modo_evaluacion == 'incertidumbre':
            continue
        if n.familia_funciones:
            continue
        pendientes.append({
            'nodo_id': n.id,
            'nombre': n.nombre,
            'tipo_nivel': getattr(n.tipo_nivel, 'nombre', None),
        })
    return pendientes


def _estado_momento(pendientes: list[dict], total_items: int = 0) -> str:
    if not pendientes and total_items == 0:
        return 'sin_datos'
    if not pendientes:
        return 'completo'
    return 'pendiente'


def build_config_trazabilidad(proyecto: Proyecto, omoe_id: int | None = None) -> dict[str, Any]:
    validacion = validar_simulacion(proyecto)
    faltantes = validacion.get('faltantes') or []

    faltantes_por_tipo: dict[str, list] = {}
    for f in faltantes:
        faltantes_por_tipo.setdefault(f.get('tipo') or 'otro', []).append(f)

    momentos_resumen = []
    for m in MOMENTOS:
        tipos = m['tipos_faltante']
        items = [
            f for f in faltantes
            if f.get('tipo') in tipos
        ]
        momentos_resumen.append({
            **m,
            'estado': _estado_momento(items),
            'total_pendientes': len(items),
            'pendientes': items[:50],
        })

    omoe_qs = Omoe.objects.filter(proyecto=proyecto).order_by('orden', 'id')
    if omoe_id:
        omoe_qs = omoe_qs.filter(pk=omoe_id)

    dimensiones = []
    for omoe in omoe_qs:
        omoe_nombre = omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.pk}'
        sin_util = _nodos_sin_utilidad(omoe)
        dim_faltantes = [f for f in faltantes if f.get('dimension') == omoe_nombre]
        dimensiones.append({
            'omoe_id': omoe.id,
            'nombre': omoe_nombre,
            'nodos_sin_utilidad': sin_util,
            'total_sin_utilidad': len(sin_util),
            'faltantes': dim_faltantes[:30],
            'total_faltantes': len(dim_faltantes),
        })

    historial = ConfigArbolHistorial.objects.filter(proyecto=proyecto)
    if omoe_id:
        historial = historial.filter(omoe_id=omoe_id)
    historial = historial.select_related('usuario', 'omoe')[:40]

    return {
        'proyecto_id': proyecto.id,
        'momentos': momentos_resumen,
        'dimensiones': dimensiones,
        'listo_para_simular': validacion.get('ok', False),
        'validacion_simulacion': {
            'ok': validacion.get('ok', False),
            'total_faltantes': validacion.get('total_faltantes', 0),
        },
        'historial_sesiones': [
            {
                'id': h.id,
                'momento': h.momento,
                'momento_label': h.get_momento_display(),
                'notas': h.notas,
                'fecha': h.fecha_creacion.isoformat(),
                'usuario': h.usuario.username if h.usuario_id else None,
                'omoe_id': h.omoe_id,
                'omoe_nombre': (
                    h.omoe.nombre_modelo if h.omoe_id and h.omoe else None
                ),
            }
            for h in historial
        ],
    }


def registrar_sesion_config(
    proyecto: Proyecto,
    usuario: User,
    momento: str,
    notas: str = '',
    omoe_id: int | None = None,
) -> ConfigArbolHistorial:
    if momento not in MOMENTO_ORDER:
        raise ValueError('Momento de configuración inválido.')
    omoe = None
    if omoe_id:
        omoe = Omoe.objects.get(pk=omoe_id, proyecto=proyecto)
    return ConfigArbolHistorial.objects.create(
        proyecto=proyecto,
        omoe=omoe,
        usuario=usuario,
        momento=momento,
        notas=(notas or '').strip(),
    )
