export function traceNodeKey(node, parentKey = 'root') {
  const id = node?.nodo_id ?? node?.nombre ?? 'x';
  return `${parentKey}/${node?.kind}-${id}`;
}

export function formatValor(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(4);
}

function normalizeComparisonNode(h) {
  const child = h.trace || h;
  return {
    nodo_id: h.nodo_id ?? child?.nodo_id,
    nombre: h.nombre ?? child?.nombre ?? '—',
    level_label: h.level_label ?? child?.level_label ?? child?.kind ?? '',
    valor: h.valor ?? child?.valor,
  };
}

/** Busca un nodo por id en el árbol de trace (rollup o fila hijo). */
export function findTraceNodeByNodoId(trace, nodoId) {
  if (!trace || nodoId == null) return null;
  if (trace.nodo_id === nodoId) return trace;
  for (const h of trace.hijos || []) {
    if (h.nodo_id === nodoId) return h;
    const child = h.trace || h;
    const found = findTraceNodeByNodoId(child, nodoId);
    if (found) return found;
  }
  return null;
}

export function getTraceNodeValor(node) {
  if (node == null || node.valor == null) return null;
  const n = Number(node.valor);
  return Number.isNaN(n) ? null : n;
}

/** Padre directo de un nodo dentro del trace. */
export function findParentOfTraceNode(trace, nodoId) {
  if (!trace || nodoId == null) return null;
  for (const h of trace.hijos || []) {
    const child = h.trace || h;
    const id = h.nodo_id ?? child?.nodo_id;
    if (id === nodoId) return trace;
    const found = findParentOfTraceNode(child, nodoId);
    if (found) return found;
  }
  return null;
}

/** Ruta desde la raíz hasta un nodo (para breadcrumb). */
export function findPathToTraceNode(trace, nodoId, path = []) {
  if (!trace) return null;
  const current = { nodo_id: trace.nodo_id, nombre: trace.nombre || '—' };
  const nextPath = [...path, current];
  if (trace.nodo_id === nodoId) return nextPath;
  for (const h of trace.hijos || []) {
    const child = h.trace || h;
    const id = h.nodo_id ?? child?.nodo_id;
    if (id == null) continue;
    if (id === nodoId) {
      return [...nextPath, { nodo_id: id, nombre: h.nombre ?? child?.nombre ?? '—' }];
    }
    const found = findPathToTraceNode(child, nodoId, nextPath);
    if (found) return found;
  }
  return null;
}

/**
 * Nodos comparables: hijos del nodo seleccionado, o hermanos si no hay grupo hijo.
 * Misma lógica que AHP: solo nodos con el mismo padre en la rama.
 */
export function resolveComparisonNodes(selectedNode, trace) {
  if (!selectedNode) return [];

  const hijos = (selectedNode.hijos || [])
    .map(normalizeComparisonNode)
    .filter((n) => n.nodo_id != null);

  if (hijos.length >= 2) return hijos;

  const targetId = selectedNode.nodo_id;
  if (targetId != null) {
    const parent = findParentOfTraceNode(trace, targetId);
    if (parent) {
      const siblings = (parent.hijos || [])
        .map(normalizeComparisonNode)
        .filter((n) => n.nodo_id != null);
      if (siblings.length >= 2) return siblings;
      if (siblings.length === 1 && siblings[0].nodo_id !== targetId) return siblings;
    }
  }

  return hijos;
}

export function comparisonGroupLabel(selectedNode, comparisonNodes, trace) {
  if (!selectedNode || !comparisonNodes.length) return '';
  const hijos = (selectedNode.hijos || []).filter((h) => (h.nodo_id ?? h.trace?.nodo_id) != null);
  if (hijos.length >= 2) {
    return `Hijos de «${selectedNode.nombre}»`;
  }
  const parent = findParentOfTraceNode(trace, selectedNode.nodo_id);
  if (parent) {
    return `Hermanos bajo «${parent.nombre}»`;
  }
  return 'Nodos del nivel seleccionado';
}

/** Lista plana para la pestaña Auditoría (de hoja hacia raíz por rama). */
export function flattenAuditLines(trace, path = [], out = []) {
  if (!trace) return out;

  const currentPath = [...path, trace.nombre || '—'];
  const depth = path.length;

  out.push({
    key: traceNodeKey(trace, path.join('/')),
    depth,
    path: currentPath.join(' → '),
    nombre: trace.nombre,
    levelLabel: trace.level_label || trace.kind,
    kind: trace.kind,
    valor: trace.valor,
    formula: trace.formula,
  });

  const hijos = trace.hijos || [];
  hijos.forEach((h) => {
    const childTrace = h.trace || h;
    if (childTrace?.kind) {
      flattenAuditLines(childTrace, currentPath, out);
    }
  });

  return out;
}

export function collectTreeRows(trace, depth = 0, rows = []) {
  if (!trace) return rows;

  rows.push({
    key: traceNodeKey(trace, String(depth)),
    node: trace,
    depth,
  });

  (trace.hijos || []).forEach((h) => {
    const child = h.trace || h;
    if (child?.kind) {
      collectTreeRows(child, depth + 1, rows);
    }
  });

  return rows;
}

export function paramEntries(parametros) {
  if (!parametros || typeof parametros !== 'object') return [];
  return Object.entries(parametros).filter(([, v]) => v != null && String(v).trim() !== '');
}
