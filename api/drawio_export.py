"""
Exportación de árboles de criterios a XML compatible con draw.io (diagrams.net).

Dos modos:
- Estructura: árbol completo sin pesos (nodos inactivos visibles en gris).
- Por escenarios: una hoja (pestaña) por escenario con pesos reales y solo nodos activos.
"""
from __future__ import annotations

import re
import uuid
import xml.etree.ElementTree as ET

from django.core.cache import cache

from .evaluacion_service import escenarios_for_dimension
from .mcdm_utils import build_hierarchy_export
from .models import Escenario, NodoArbol, Omoe, Proyecto
from .nodo_arbol_serializers import build_hijos_cache
from .nodo_escenario_service import load_config_map, seed_arbol_config_for_escenario

# Layout (dimensiones legibles en draw.io)
NODE_W = 140
NODE_H = 56
OMOE_W = 180
OMOE_H = 44
H_GAP = 24
V_STEP = 80
PADDING = 40
ROW_GAP = 120
DRAFT_TTL_SECONDS = 600


def store_drawio_draft(xml: str, *, proyecto_id: int, user_id: int) -> str:
    token = uuid.uuid4().hex
    cache.set(
        f'drawio_draft:{token}',
        {'xml': xml, 'proyecto_id': proyecto_id, 'user_id': user_id},
        timeout=DRAFT_TTL_SECONDS,
    )
    return token


def get_drawio_draft(token: str, *, proyecto_id: int | None = None) -> str | None:
    if not token or len(token) != 32 or not all(c in '0123456789abcdef' for c in token):
        return None
    key = f'drawio_draft:{token}'
    payload = cache.get(key)
    if not payload:
        return None
    if proyecto_id is not None and payload.get('proyecto_id') != proyecto_id:
        return None
    return payload.get('xml')


def _sanitize_sheet_name(name: str, max_len: int = 60) -> str:
    cleaned = re.sub(r'[<>&"\n\r\t]', ' ', str(name or '')).strip()
    return (cleaned[:max_len] if cleaned else 'Escenario')


def _peso_to_fraction(peso: float) -> float:
    """Convierte peso almacenado (0–100 %) a fracción local 0–1."""
    value = float(peso or 0)
    if value > 1.5:
        return round(value / 100.0, 6)
    return round(value, 6)


def _format_local_weight(node: dict) -> str | None:
    if not node.get('show_weights', True):
        return None
    lw = node.get('local_weight')
    if lw is None or node.get('is_root'):
        return None
    try:
        value = float(lw)
    except (TypeError, ValueError):
        return None
    pct = value * 100
    if abs(pct - round(pct)) < 0.05:
        return f'{round(pct)}%'
    return f'{pct:.1f}%'


def _node_label(node: dict) -> str:
    name = node.get('name') or '—'
    peso = _format_local_weight(node)
    if peso:
        return f'{name}\nPeso local: {peso}'
    return name


def _is_omoe_root(node: dict) -> bool:
    return node.get('is_root', False)


def _box_size(node: dict) -> tuple[int, int]:
    if _is_omoe_root(node):
        return OMOE_W, OMOE_H
    return NODE_W, NODE_H


def _node_style(node: dict) -> str:
    if node.get('inactive'):
        return (
            'rounded=1;whiteSpace=wrap;html=0;align=center;verticalAlign=middle;'
            'fillColor=#9ca3af;strokeColor=#6b7280;fontColor=#ffffff;fontSize=11;'
        )
    depth = min(node.get('depth', 0), 5)
    fills = ['#1e3a5f', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe']
    strokes = ['#0f2744', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd']
    text = '#ffffff' if depth <= 2 else '#0f172a'
    fill = fills[depth]
    stroke = strokes[depth]
    return (
        f'rounded=1;whiteSpace=wrap;html=0;align=center;verticalAlign=middle;'
        f'fillColor={fill};strokeColor={stroke};fontColor={text};fontSize=11;'
    )


def _sibling_gap(count: int) -> int:
    if count > 14:
        return 12
    if count > 8:
        return 16
    if count > 4:
        return 20
    return H_GAP


def _measure_subtree(node: dict) -> None:
    w, _ = _box_size(node)
    children = node.get('children') or []
    if not children:
        node['subtree_w'] = w
        return
    for child in children:
        _measure_subtree(child)
    gap = _sibling_gap(len(children))
    gaps = gap * max(0, len(children) - 1)
    total = sum(c['subtree_w'] for c in children)
    node['subtree_w'] = max(w, total + gaps)


def _assign_positions(node: dict, depth: int, left_x: float) -> float:
    w, h = _box_size(node)
    node['depth'] = depth
    node['y'] = PADDING + depth * V_STEP

    children = node.get('children') or []
    if not children:
        node['x'] = left_x + (node['subtree_w'] - w) / 2
        return left_x + node['subtree_w']

    gap = _sibling_gap(len(children))
    cursor = left_x
    for i, child in enumerate(children):
        cursor = _assign_positions(child, depth + 1, cursor)
        if i < len(children) - 1:
            cursor += gap

    if depth == 0 and not node.get('is_root'):
        node['x'] = left_x
    else:
        first = children[0]
        last = children[-1]
        fw, _ = _box_size(first)
        lw, _ = _box_size(last)
        center_x = (first['x'] + fw / 2 + last['x'] + lw / 2) / 2
        node['x'] = center_x - w / 2
    return left_x + node['subtree_w']


def _layout_tree(root: dict) -> dict:
    import copy

    tree = copy.deepcopy(root)
    _measure_subtree(tree)
    _assign_positions(tree, 0, 0.0)
    return tree


def _tree_bounds(tree: dict) -> tuple[float, float]:
    max_x = PADDING
    max_y = PADDING

    def walk(n: dict) -> None:
        nonlocal max_x, max_y
        w, h = _box_size(n)
        max_x = max(max_x, n['x'] + w + PADDING)
        max_y = max(max_y, n['y'] + h + PADDING)
        for child in n.get('children') or []:
            walk(child)

    walk(tree)
    return max_x, max_y


def _nodo_aplica_en_escenario(
    nodo: NodoArbol,
    config_map: dict[int, dict] | None,
) -> bool:
    if config_map is not None and nodo.id in config_map:
        return bool(config_map[nodo.id].get('aplica', True))
    return bool(nodo.aplica)


def _nodo_peso_en_escenario(
    nodo: NodoArbol,
    config_map: dict[int, dict] | None,
) -> float:
    if config_map is not None and nodo.id in config_map:
        return float(config_map[nodo.id].get('peso', 0) or 0)
    return float(nodo.peso or 0)


def _nodo_to_dict_structure(nodo: NodoArbol, cache: dict) -> dict:
    """Árbol completo: todos los nodos, sin pesos en etiquetas."""
    children_raw = cache.get(nodo.id, [])
    children = [_nodo_to_dict_structure(child, cache) for child in children_raw]
    return {
        'name': nodo.nombre,
        'show_weights': False,
        'type': 'Attribute' if not children else 'Criterion',
        'children': children,
        'inactive': not nodo.aplica,
    }


def _nodo_to_dict_escenario(
    nodo: NodoArbol,
    cache: dict,
    config_map: dict[int, dict],
    *,
    weight_fraction: float | None,
) -> dict | None:
    """Solo nodos activos en el escenario; pesos reales del escenario."""
    if not _nodo_aplica_en_escenario(nodo, config_map):
        return None

    children_raw = cache.get(nodo.id, [])
    active_children = [
        child for child in children_raw
        if _nodo_aplica_en_escenario(child, config_map)
    ]
    children = []
    for child in active_children:
        child_peso = _nodo_peso_en_escenario(child, config_map)
        child_dict = _nodo_to_dict_escenario(
            child,
            cache,
            config_map,
            weight_fraction=_peso_to_fraction(child_peso),
        )
        if child_dict is not None:
            children.append(child_dict)

    node = {
        'name': nodo.nombre,
        'show_weights': True,
        'type': 'Attribute' if not children else 'Criterion',
        'children': children,
        'inactive': False,
    }
    if weight_fraction is not None:
        node['local_weight'] = weight_fraction
    return node


def _omoe_root_dict(omoe: Omoe, children: list[dict], *, show_weights: bool) -> dict:
    return {
        'name': omoe.nombre_modelo or omoe.codigo or 'Dimensión',
        'show_weights': show_weights,
        'type': 'Criterion',
        'children': children,
        'is_root': True,
    }


def build_omoe_tree_structure(omoe: Omoe) -> dict:
    """Árbol completo sin pesos (NodoArbol o legado)."""
    cache = build_hijos_cache(omoe.id)
    roots = cache.get(None, [])
    if roots:
        children = [_nodo_to_dict_structure(nodo, cache) for nodo in roots]
        return _omoe_root_dict(omoe, children, show_weights=False)
    tree = build_hierarchy_export(omoe, strip_meta=True)
    tree['is_root'] = True
    tree['show_weights'] = False
    _strip_weights_from_tree(tree)
    return tree


def _strip_weights_from_tree(node: dict) -> None:
    node.pop('local_weight', None)
    node['show_weights'] = False
    for child in node.get('children') or []:
        _strip_weights_from_tree(child)


def build_omoe_tree_for_escenario(omoe: Omoe, escenario: Escenario) -> dict | None:
    """Árbol del escenario: solo nodos activos y pesos de NodoArbolEscenario."""
    cache = build_hijos_cache(omoe.id)
    roots = cache.get(None, [])
    if not roots:
        return None

    seed_arbol_config_for_escenario(escenario)
    config_map = load_config_map(escenario.id)

    active_roots = [
        nodo for nodo in roots
        if _nodo_aplica_en_escenario(nodo, config_map)
    ]
    children = []
    for nodo in active_roots:
        peso = _nodo_peso_en_escenario(nodo, config_map)
        child_dict = _nodo_to_dict_escenario(
            nodo,
            cache,
            config_map,
            weight_fraction=_peso_to_fraction(peso),
        )
        if child_dict is not None:
            children.append(child_dict)

    return _omoe_root_dict(omoe, children, show_weights=True)


def build_diagram_trees(proyecto: Proyecto, omoe: Omoe | None = None) -> list[dict]:
    if omoe is not None:
        return [build_omoe_tree_structure(omoe)]
    omoes = proyecto.omoes.order_by('orden', 'id')
    return [build_omoe_tree_structure(o) for o in omoes]


def build_escenario_pages(
    proyecto: Proyecto,
    omoe: Omoe | None = None,
) -> list[dict]:
    """Una página draw.io por escenario de cada dimensión."""
    if omoe is not None:
        omoes = [omoe]
    else:
        omoes = list(proyecto.omoes.order_by('orden', 'id'))

    pages: list[dict] = []
    multi_dim = omoe is None and len(omoes) > 1

    for o in omoes:
        escenarios = escenarios_for_dimension(o)
        if not escenarios:
            continue
        dim_label = (o.nombre_modelo or o.codigo or f'Dimensión {o.id}')[:40]
        for esc in escenarios:
            tree = build_omoe_tree_for_escenario(o, esc)
            if tree is None:
                continue
            esc_label = esc.nombre or f'Escenario {esc.id}'
            if multi_dim:
                sheet_name = f'{dim_label} — {esc_label}'
            else:
                sheet_name = esc_label
            pages.append({
                'name': _sanitize_sheet_name(sheet_name),
                'trees': [tree],
            })

    return pages


EDGE_STYLE = (
    'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=0;'
    'jettySize=0;html=0;endArrow=none;endFill=0;'
    'strokeColor=#64748b;strokeWidth=1.5;'
    'exitX=0.5;exitY=1;exitDx=0;exitDy=0;'
    'entryX=0.5;entryY=0;entryDx=0;entryDy=0;'
    'exitPerimeter=0;entryPerimeter=0;'
)

BUS_MIN = 14
BUS_MAX = 32


def _node_center_bottom(geo: dict) -> tuple[float, float]:
    return geo['x'] + geo['width'] / 2, geo['y'] + geo['height']


def _node_center_top(geo: dict) -> tuple[float, float]:
    return geo['x'] + geo['width'] / 2, geo['y']


def _bus_y_for_parent(parent_geo: dict, child_geos: list[dict]) -> float:
    _, py_bottom = _node_center_bottom(parent_geo)
    if not child_geos:
        return py_bottom + BUS_MIN
    min_child_top = min(g['y'] for g in child_geos)
    gap = max(min_child_top - py_bottom, BUS_MIN)
    offset = max(BUS_MIN, min(BUS_MAX, gap * 0.42))
    return round(py_bottom + offset)


def _tree_edge_waypoints(parent_geo: dict, child_geo: dict, bus_y: float) -> list[dict]:
    px, _ = _node_center_bottom(parent_geo)
    cx, _ = _node_center_top(child_geo)
    px, cx, bus_y = round(px), round(cx), round(bus_y)
    if abs(px - cx) <= 1:
        return [{'x': px, 'y': bus_y}]
    return [{'x': px, 'y': bus_y}, {'x': cx, 'y': bus_y}]


def _collect_cells(
    tree: dict,
    y_offset: float,
    cells: list[tuple[str, dict]],
    edges: list[dict],
    id_counter: list[int],
) -> None:
    node_id = str(id_counter[0])
    id_counter[0] += 1
    w, h = _box_size(tree)
    geometry = {
        'x': round(tree['x']),
        'y': round(tree['y'] + y_offset),
        'width': w,
        'height': h,
    }
    cells.append((
        node_id,
        {
            'value': _node_label(tree),
            'style': _node_style(tree),
            'vertex': '1',
            'parent': '1',
            'geometry': geometry,
        },
    ))
    tree['_cell_id'] = node_id

    children = tree.get('children') or []
    child_geos = []
    for child in children:
        cw, ch = _box_size(child)
        child_geos.append({
            'x': round(child['x']),
            'y': round(child['y'] + y_offset),
            'width': cw,
            'height': ch,
        })

    bus_y = _bus_y_for_parent(geometry, child_geos) if children else 0

    for child in children:
        _collect_cells(child, y_offset, cells, edges, id_counter)
        cw, ch = _box_size(child)
        child_geo = {
            'x': round(child['x']),
            'y': round(child['y'] + y_offset),
            'width': cw,
            'height': ch,
        }
        edges.append({
            'source': node_id,
            'target': child['_cell_id'],
            'waypoints': _tree_edge_waypoints(geometry, child_geo, bus_y),
        })


def _render_page_cells(trees: list[dict]) -> tuple[list, list, int, int, int]:
    cells: list[tuple[str, dict]] = []
    edges: list[dict] = []
    id_counter = [2]
    y_offset = 0.0

    for tree in trees:
        layout = _layout_tree(tree)
        _collect_cells(layout, y_offset, cells, edges, id_counter)
        _, height = _tree_bounds(layout)
        y_offset += height + ROW_GAP

    max_x = PADDING
    for _, props in cells:
        geo = props['geometry']
        max_x = max(max_x, geo['x'] + geo['width'] + PADDING)
    page_w = max(850, int(max_x))
    page_h = max(600, int(y_offset + PADDING))
    return cells, edges, page_w, page_h, id_counter[0]


def _append_cells_to_root(root: ET.Element, cells, edges, id_counter: list[int]) -> None:
    for cell_id, props in cells:
        attrs = {
            'id': cell_id,
            'value': props['value'],
            'style': props['style'],
            'vertex': props['vertex'],
            'parent': props['parent'],
        }
        cell = ET.SubElement(root, 'mxCell', attrs)
        geo = props['geometry']
        ET.SubElement(
            cell,
            'mxGeometry',
            {
                'x': str(geo['x']),
                'y': str(geo['y']),
                'width': str(geo['width']),
                'height': str(geo['height']),
                'as': 'geometry',
            },
        )

    for edge_spec in edges:
        edge_id = str(id_counter[0])
        id_counter[0] += 1
        waypoints = edge_spec.get('waypoints') or []
        edge_el = ET.SubElement(
            root,
            'mxCell',
            {
                'id': edge_id,
                'style': EDGE_STYLE,
                'edge': '1',
                'parent': '1',
                'source': edge_spec['source'],
                'target': edge_spec['target'],
            },
        )
        geo = ET.SubElement(edge_el, 'mxGeometry', {'relative': '1', 'as': 'geometry'})
        if waypoints:
            points = ET.SubElement(geo, 'Array', {'as': 'points'})
            for pt in waypoints:
                ET.SubElement(points, 'mxPoint', {
                    'x': str(pt['x']),
                    'y': str(pt['y']),
                })


def _build_diagram_element(
    parent: ET.Element,
    *,
    diagram_id: str,
    diagram_name: str,
    trees: list[dict],
) -> None:
    cells, edges, page_w, page_h, next_cell_id = _render_page_cells(trees)
    diagram = ET.SubElement(parent, 'diagram', {'id': diagram_id, 'name': diagram_name})
    model = ET.SubElement(
        diagram,
        'mxGraphModel',
        {
            'dx': '1200',
            'dy': '800',
            'grid': '1',
            'gridSize': '10',
            'guides': '1',
            'tooltips': '1',
            'connect': '1',
            'arrows': '1',
            'fold': '1',
            'page': '1',
            'pageScale': '1',
            'pageWidth': str(page_w),
            'pageHeight': str(page_h),
            'math': '0',
            'shadow': '0',
        },
    )
    root = ET.SubElement(model, 'root')
    ET.SubElement(root, 'mxCell', {'id': '0'})
    ET.SubElement(root, 'mxCell', {'id': '1', 'parent': '0'})
    _append_cells_to_root(root, cells, edges, [next_cell_id])


def build_drawio_xml(trees: list[dict], *, diagram_name: str = 'Mapa de criterios') -> str:
    mxfile = ET.Element(
        'mxfile',
        {
            'host': 'app.diagrams.net',
            'agent': 'MCDM',
            'version': '22.1.0',
            'type': 'device',
        },
    )
    _build_diagram_element(
        mxfile,
        diagram_id='MCDM-diagram',
        diagram_name=diagram_name,
        trees=trees,
    )
    xml_body = ET.tostring(mxfile, encoding='unicode')
    return f'<?xml version="1.0" encoding="UTF-8"?>\n{xml_body}'


def build_drawio_xml_multipage(pages: list[dict]) -> str:
    """Varias hojas (pestañas) en un mismo archivo draw.io."""
    mxfile = ET.Element(
        'mxfile',
        {
            'host': 'app.diagrams.net',
            'agent': 'MCDM',
            'version': '22.1.0',
            'type': 'device',
        },
    )
    for idx, page in enumerate(pages):
        diagram_id = f'MCDM-page-{idx + 1}-{uuid.uuid4().hex[:8]}'
        _build_diagram_element(
            mxfile,
            diagram_id=diagram_id,
            diagram_name=page['name'],
            trees=page['trees'],
        )
    xml_body = ET.tostring(mxfile, encoding='unicode')
    return f'<?xml version="1.0" encoding="UTF-8"?>\n{xml_body}'


def export_proyecto_drawio(proyecto: Proyecto, omoe: Omoe | None = None) -> str:
    """Árbol completo sin pesos (exportación original)."""
    trees = build_diagram_trees(proyecto, omoe)
    if not trees:
        trees = [{
            'name': proyecto.nombre or 'Proyecto',
            'show_weights': False,
            'children': [],
            'is_root': True,
        }]
    name = _sanitize_sheet_name(proyecto.nombre or 'Proyecto')
    return build_drawio_xml(trees, diagram_name=name)


def export_proyecto_drawio_escenarios(
    proyecto: Proyecto,
    omoe: Omoe | None = None,
) -> str:
    """Una hoja por escenario con pesos y solo nodos activos."""
    pages = build_escenario_pages(proyecto, omoe)
    if not pages:
        raise ValueError(
            'No hay escenarios configurados para exportar. '
            'Cree escenarios en la dimensión antes de exportar por escenario.'
        )
    return build_drawio_xml_multipage(pages)
