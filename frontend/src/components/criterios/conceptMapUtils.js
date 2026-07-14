import { CRITERIO_LEVELS, CHILDREN_KEY, CHILD_LEVEL, MODELO_LABEL, getNodoTipoLabel } from './constants';
import { effectiveOmoeRama } from './ramaContext';
import { isTerminalCriterioNode } from './terminalUtils';
import { buildDefaultFormValues, getSchemaForLevel, validateUtilidadParams } from './nodeFormSchemas';

export const MAP_NODE_W = 26;
export const MAP_NODE_H = 26;
export const MAP_OMOE_NODE_W = 96;
export const MAP_OMOE_NODE_H = 32;
/** Ancho de la columna de etiquetas de nivel (fuera del SVG del árbol). */
export const MAP_LABEL_COL_W = 92;
export const MAP_H_GAP = 6;
/** Separación vertical entre filas (nodo + espacio para flecha). */
export const MAP_V_STEP = 54;
export const MAP_PADDING = 12;
/** Origen X fijo del árbol dentro del SVG (todos los diagramas alineados). */
export const MAP_TREE_ORIGIN_X = 0;

export const PENDING_STYLE = { fill: '#f59e0b', stroke: '#d97706', text: '#1c1917' };
export const INACTIVE_STYLE = { fill: '#9ca3af', stroke: '#6b7280', text: '#f9fafb' };

export const DEPTH_STYLES = [
  { fill: '#1e3a5f', stroke: '#0f2744', text: '#ffffff' },
  { fill: '#1d4ed8', stroke: '#1e40af', text: '#ffffff' },
  { fill: '#3b82f6', stroke: '#2563eb', text: '#ffffff' },
  { fill: '#60a5fa', stroke: '#3b82f6', text: '#0f172a' },
  { fill: '#93c5fd', stroke: '#60a5fa', text: '#0f172a' },
  { fill: '#bfdbfe', stroke: '#93c5fd', text: '#0f172a' },
];

export function nodeBoxWidth(meta) {
  return meta?.level === CRITERIO_LEVELS.OMOE ? MAP_OMOE_NODE_W : MAP_NODE_W;
}

export function nodeBoxHeight(meta) {
  return meta?.level === CRITERIO_LEVELS.OMOE ? MAP_OMOE_NODE_H : MAP_NODE_H;
}

function levelLabelFor(level, node) {
  if (level === CRITERIO_LEVELS.OMOE) return MODELO_LABEL.toUpperCase();
  if (level === CRITERIO_LEVELS.NODO_ARBOL) {
    return (getNodoTipoLabel(node) || 'NODO').toUpperCase();
  }
  const labels = {
    [CRITERIO_LEVELS.MISION]: 'MISIÓN',
    [CRITERIO_LEVELS.GRUPO_AFINIDAD]: 'GRUPO DE AFINIDAD',
    [CRITERIO_LEVELS.MOP]: 'MOP',
    [CRITERIO_LEVELS.DP]: 'DP',
  };
  return (labels[level] || level || 'NODO').toUpperCase();
}

export function nodeName(node) {
  return (
    node.nombre ||
    node.nombre_display ||
    node.nombre_modelo ||
    node.nombre_mision ||
    node.nombre_grupo ||
    node.nombre_mop ||
    node.nombre_dp ||
    '—'
  );
}

export function paramsSummary(node) {
  const p = node.parametros_funcion || {};
  const parts = [];
  const keys = ['L', 'U', 'k', 'T', 'S', 'M', 'V', 'x0'];
  keys.forEach((k) => {
    const v = p[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      parts.push(`${k}=${v}`);
    }
  });
  if (!parts.length && node.valor_umbral != null) parts.push(`L=${node.valor_umbral}`);
  if (!parts.length && node.valor_meta != null) parts.push(`U=${node.valor_meta}`);
  return parts.length ? parts.join(' · ') : null;
}

function hasRequiredSchemaGap(level, node, formData) {
  const schema = getSchemaForLevel(level, node, formData);
  return schema.some((field) => {
    if (!field.required || field.type === 'boolean') return false;
    const val = formData[field.name];
    return val == null || String(val).trim() === '';
  });
}

/** Nodo con datos pendientes (mapa naranja): nombre, utilidad incompleta o peso sin asignar. */
export function hasNodePendingData(level, node, omoe = null) {
  if (!node || node.aplica === false) return false;

  const formData = buildDefaultFormValues(level, node);
  if (hasRequiredSchemaGap(level, node, formData)) return true;

  if (!isTerminalCriterioNode(level, node)) return false;

  const modo = node.modo_evaluacion || formData.modo_evaluacion || 'certeza';
  if (modo === 'incertidumbre') return false;

  const modoValor = omoe?.modo_valor_terminal || 'utilidad';
  // Costos (OMOC): solo valor bruto x — no exigir función de utilidad ni peso.
  if (modoValor === 'valor_bruto') {
    return false;
  }

  const tipo = node.tipo_criterio || node.tipo_mop || '';
  const familia = node.familia_funciones || '';
  if (!tipo || !familia) return true;

  const params = node.parametros_funcion || formData.parametros_funcion || {};
  if (validateUtilidadParams(familia, params).length > 0) return true;

  const peso = node.peso;
  if (peso === null || peso === undefined || peso === '') return true;

  return false;
}

function buildMeta(level, node, omoe) {
  return {
    level,
    node,
    omoeId: omoe.id,
    nombre: nodeName(node),
    peso: node.peso,
    aplica: node.aplica !== false,
    rama: level === CRITERIO_LEVELS.OMOE ? effectiveOmoeRama(node) : null,
    levelLabel: levelLabelFor(level, node),
    hasPending:
      node.aplica !== false && hasNodePendingData(level, node, omoe),
    isTerminal: isTerminalCriterioNode(level, node),
    children: [],
  };
}

function sortNodosByLayout(nodos) {
  return [...(nodos || [])].sort((a, b) => {
    const ta = Number(a.tipo_nivel_orden ?? a.tipo_nivel?.orden ?? 0);
    const tb = Number(b.tipo_nivel_orden ?? b.tipo_nivel?.orden ?? 0);
    if (ta !== tb) return ta - tb;
    const oa = Number(a.orden_visual ?? 0);
    const ob = Number(b.orden_visual ?? 0);
    if (oa !== ob) return oa - ob;
    return Number(a.id) - Number(b.id);
  });
}

function buildNodoChildren(nodos, omoe) {
  return sortNodosByLayout(nodos).map((n) => {
    const meta = buildMeta(n.nivel || CRITERIO_LEVELS.NODO_ARBOL, n, omoe);
    if (n.hijos?.length) meta.children = buildNodoChildren(n.hijos, omoe);
    return meta;
  });
}

function buildLegacyChildren(nodes, level, omoe) {
  return (nodes || []).map((n) => {
    const nodeLevel = n.nivel || level;
    const meta = buildMeta(nodeLevel, n, omoe);
    const childLevel = CHILD_LEVEL[nodeLevel];
    const childKey = CHILDREN_KEY[nodeLevel];
    const children = childKey ? n[childKey] || [] : [];
    if (children.length && childLevel) {
      meta.children = buildLegacyChildren(children, childLevel, omoe);
    }
    return meta;
  });
}

/** Un árbol conceptual por dimensión (OMOE). */
export function buildConceptMapRoots(forest) {
  return (forest || []).map((omoe) => {
    const root = buildMeta(CRITERIO_LEVELS.OMOE, omoe, omoe);
    if (omoe.nodos?.length) {
      root.children = buildNodoChildren(omoe.nodos, omoe);
    } else if (omoe.grupos?.length) {
      root.children = buildLegacyChildren(omoe.grupos, CRITERIO_LEVELS.GRUPO_AFINIDAD, omoe);
    }
    return {
      omoeId: omoe.id,
      omoeNombre: nodeName(omoe),
      root,
    };
  });
}

function nodeRowIndex(meta, parentRowIndex) {
  if (meta.level === CRITERIO_LEVELS.OMOE) return 0;
  if (meta.level === CRITERIO_LEVELS.NODO_ARBOL) {
    const orden = meta.node.tipo_nivel_orden ?? meta.node.tipo_nivel?.orden;
    if (orden != null) return Number(orden);
  }
  return parentRowIndex + 1;
}

function nodeRowCenterY(meta) {
  const row = meta.rowIndex ?? meta.depth ?? 0;
  const h = nodeBoxHeight(meta);
  return MAP_PADDING + row * MAP_V_STEP + h / 2;
}
function siblingGap(childCount) {
  if (childCount > 14) return 3;
  if (childCount > 8) return 4;
  if (childCount > 4) return 5;
  return MAP_H_GAP;
}

function measureSubtree(node) {
  const w = nodeBoxWidth(node);
  if (!node.children?.length) {
    node.subtreeW = w;
    return;
  }
  node.children.forEach(measureSubtree);
  const gap = siblingGap(node.children.length);
  const gaps = gap * Math.max(0, node.children.length - 1);
  const sum = node.children.reduce((s, c) => s + c.subtreeW, 0);
  node.subtreeW = Math.max(w, sum + gaps);
}

function assignPositions(node, parentRowIndex, leftX) {
  const w = nodeBoxWidth(node);
  const rowIndex = nodeRowIndex(node, parentRowIndex);
  node.rowIndex = rowIndex;
  node.depth = rowIndex;
  node.y = MAP_PADDING + rowIndex * MAP_V_STEP;

  if (!node.children?.length) {
    node.x = leftX + (node.subtreeW - w) / 2;
    return leftX + node.subtreeW;
  }

  const gap = siblingGap(node.children.length);
  let cursor = leftX;
  node.children.forEach((child, i) => {
    cursor = assignPositions(child, rowIndex, cursor);
    if (i < node.children.length - 1) cursor += gap;
  });

  if (rowIndex === 0) {
    node.x = leftX;
  } else {
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    const centerX = (first.x + nodeBoxWidth(first) / 2 + last.x + nodeBoxWidth(last) / 2) / 2;
    node.x = centerX - w / 2;
  }
  return leftX + node.subtreeW;
}

export function layoutConceptTree(root) {
  const tree = structuredClone(root);
  measureSubtree(tree);
  assignPositions(tree, 0, MAP_TREE_ORIGIN_X);
  return tree;
}

export function getDepthRowPositions(layoutRoot, nivelesArbol = []) {
  const ordensInTree = new Set();
  function collectOrden(n) {
    const row = n.rowIndex ?? n.depth ?? 0;
    if (row > 0) ordensInTree.add(row);
    (n.children || []).forEach(collectOrden);
  }
  collectOrden(layoutRoot);

  const maxOrden = ordensInTree.size
    ? Math.max(...ordensInTree)
    : 0;
  const minOrden = ordensInTree.size
    ? Math.min(...ordensInTree)
    : 0;

  const rows = new Map();
  rows.set(0, {
    depth: 0,
    label: MODELO_LABEL.toUpperCase(),
    y: MAP_PADDING + MAP_OMOE_NODE_H / 2,
  });

  const activeNiveles = (nivelesArbol || [])
    .filter((n) => n.activo !== false)
    .sort((a, b) => Number(a.orden) - Number(b.orden));

  activeNiveles.forEach((nivel) => {
    const orden = Number(nivel.orden);
    if (orden < minOrden || orden > maxOrden) return;
    rows.set(orden, {
      depth: orden,
      label: (nivel.nombre || `Nivel ${orden}`).toUpperCase(),
      y: MAP_PADDING + orden * MAP_V_STEP + MAP_NODE_H / 2,
    });
  });

  // Preferir el nombre real del tipo en los nodos (tipo_nivel_nombre) sobre la
  // plantilla genérica "Nivel N" cuando el árbol ya tiene elementos.
  function walkLabels(n) {
    const row = n.rowIndex ?? n.depth ?? 0;
    if (row > 0 && n.levelLabel) {
      const existing = rows.get(row);
      rows.set(row, {
        depth: row,
        label: n.levelLabel,
        y: existing?.y ?? nodeRowCenterY(n),
      });
    }
    (n.children || []).forEach(walkLabels);
  }
  walkLabels(layoutRoot);

  return Array.from(rows.values()).sort((a, b) => a.depth - b.depth);
}

export function getTreeBounds(tree) {
  let maxX = MAP_TREE_ORIGIN_X;
  let maxY = MAP_PADDING;

  function walk(n) {
    maxX = Math.max(maxX, n.x + nodeBoxWidth(n) + MAP_PADDING);
    maxY = Math.max(maxY, n.y + nodeBoxHeight(n) + MAP_PADDING);
    (n.children || []).forEach(walk);
  }
  walk(tree);
  return { width: maxX, height: maxY };
}

const LINK_ARROW_INSET = 3;
/** Espacio sobre el hijo donde ocurre la rama horizontal (antes del borde del cuadro). */
const LINK_BIFURCATION_GAP = 16;
/** Caída mínima bajo el padre antes del peine horizontal. */
const LINK_MIN_TRUNK = 10;

function childLinkMeta(child) {
  const cw = nodeBoxWidth(child);
  return {
    child,
    cx: child.x + cw / 2,
    cy: child.y - LINK_ARROW_INSET,
    row: child.rowIndex ?? 0,
  };
}

/**
 * Conectores por padre: tronco visible desde el padre, peine horizontal bajo él
 * y bajada vertical en la columna de cada hijo (sin atravesar otros nodos en X del padre).
 */
function collectParentLinks(node, links) {
  const children = node.children || [];
  if (!children.length) return;

  const pw = nodeBoxWidth(node);
  const ph = nodeBoxHeight(node);
  const px = node.x + pw / 2;
  const py = node.y + ph;
  const elbowY = py + LINK_MIN_TRUNK;
  const keyBase = `${node.level}-${node.node.id}`;

  const metas = children.map(childLinkMeta);
  const allCx = metas.map((m) => m.cx);
  const minCx = Math.min(...allCx);
  const maxCx = Math.max(...allCx);
  const busLeft = Math.min(px, minCx);
  const busRight = Math.max(px, maxCx);

  if (metas.length === 1 && Math.abs(metas[0].cx - px) < 0.5) {
    const meta = metas[0];
    const busY = Math.max(elbowY, meta.cy - LINK_BIFURCATION_GAP);
    if (busY < meta.cy - 1) {
      links.push({
        key: `${keyBase}-stem`,
        path: `M ${px} ${py} V ${busY}`,
      });
      links.push({
        key: `${keyBase}-${meta.child.node.id}`,
        path: `M ${px} ${busY} V ${meta.cy}`,
        peso: meta.child.peso,
        level: meta.child.level,
        arrow: true,
      });
    } else {
      links.push({
        key: `${keyBase}-${meta.child.node.id}`,
        path: `M ${px} ${py} V ${meta.cy}`,
        peso: meta.child.peso,
        level: meta.child.level,
        arrow: true,
      });
    }
    return;
  }

  links.push({
    key: `${keyBase}-stem`,
    path: `M ${px} ${py} V ${elbowY}`,
  });

  if (busRight - busLeft > 0.5) {
    links.push({
      key: `${keyBase}-bus`,
      path: `M ${busLeft} ${elbowY} H ${busRight}`,
    });
  }

  metas.forEach((meta) => {
    const busY = Math.max(elbowY, meta.cy - LINK_BIFURCATION_GAP);
    if (busY < meta.cy - 1) {
      links.push({
        key: `${keyBase}-${meta.child.node.id}-drop`,
        path: `M ${meta.cx} ${elbowY} V ${busY}`,
      });
      links.push({
        key: `${keyBase}-${meta.child.node.id}`,
        path: `M ${meta.cx} ${busY} V ${meta.cy}`,
        peso: meta.child.peso,
        level: meta.child.level,
        arrow: true,
      });
    } else {
      links.push({
        key: `${keyBase}-${meta.child.node.id}`,
        path: `M ${meta.cx} ${elbowY} V ${meta.cy}`,
        peso: meta.child.peso,
        level: meta.child.level,
        arrow: true,
      });
    }
  });
}

export function collectLinks(node, links = []) {
  collectParentLinks(node, links);
  (node.children || []).forEach((child) => collectLinks(child, links));
  return links;
}

/** Grupos de hermanos en la misma fila (mismo nivel) para reordenar en el mapa. */
export function collectRowSiblingGroups(layoutRoot) {
  const groups = [];

  function walk(parentMeta) {
    const children = parentMeta.children || [];
    if (children.length > 1) {
      const byRow = new Map();
      children.forEach((child) => {
        const row = child.rowIndex ?? child.depth ?? 0;
        if (row <= 0) return;
        if (!byRow.has(row)) byRow.set(row, []);
        byRow.get(row).push(child);
      });
      byRow.forEach((siblings, rowIndex) => {
        if (siblings.length > 1) {
          groups.push({
            parentMeta,
            rowIndex,
            siblings: [...siblings].sort((a, b) => a.x - b.x),
          });
        }
      });
    }
    children.forEach(walk);
  }

  walk(layoutRoot);
  return groups;
}

export function findSiblingGroupForMeta(groups, meta) {
  return groups.find((g) =>
    g.siblings.some((s) => s.level === meta.level && String(s.node.id) === String(meta.node.id)),
  );
}

export function computeReorderedIds(siblings, draggedMeta, offsetX) {
  const ordered = [...siblings].sort((a, b) => a.x - b.x);
  const fromIdx = ordered.findIndex(
    (s) => s.level === draggedMeta.level && String(s.node.id) === String(draggedMeta.node.id),
  );
  if (fromIdx < 0) return null;

  const moved = ordered.splice(fromIdx, 1)[0];
  const dragCx = moved.x + nodeBoxWidth(moved) / 2 + offsetX;
  let insertAt = ordered.findIndex((s) => dragCx < s.x + nodeBoxWidth(s) / 2);
  if (insertAt < 0) insertAt = ordered.length;
  ordered.splice(insertAt, 0, moved);

  const prevIds = siblings.map((s) => String(s.node.id));
  const nextIds = ordered.map((s) => String(s.node.id));
  if (prevIds.join(',') === nextIds.join(',')) return null;
  return ordered.map((s) => s.node.id);
}