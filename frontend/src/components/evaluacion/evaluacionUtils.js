/** Clave de celda: nivel:nodo_id:escenarioId|global */
export function valorCellKey(nivel, nodoId, escenarioId) {
  const esc = escenarioId != null ? escenarioId : 'global';
  return `${nivel}:${nodoId}:${esc}`;
}

export function buildMatrixFromDimension(dimension) {
  const { escenarios = [], terminales = [], columnas: schemaColumnas = [] } = dimension;
  const terminalMap = new Map(
    terminales.map((t) => [`${t.nivel}:${t.nodo_id}`, t]),
  );

  const seen = new Set();
  const columnas = [];
  schemaColumnas.forEach((c) => {
    const tk = `${c.nivel}:${c.nodo_id}`;
    if (seen.has(tk)) return;
    seen.add(tk);
    const t = terminalMap.get(tk) || {};
    columnas.push({
      nivel: c.nivel,
      nodo_id: c.nodo_id,
      omoe_id: c.omoe_id ?? t.omoe_id,
      nombre: c.terminal_nombre || t.nombre,
      unidad: c.unidad || t.unidad,
      input_kind: c.input_kind ?? t.input_kind,
      select_options: c.select_options || t.select_options || [],
      constantes: c.constantes || t.constantes || {},
      familia_funciones: c.familia_funciones || t.familia_funciones,
      tipo_criterio: c.tipo_criterio || t.tipo_mop || t.tipo_criterio || '',
      tipo_dato: c.tipo_dato || t.tipo_dato || '',
      modo_evaluacion: c.modo_evaluacion || t.modo_evaluacion || 'certeza',
      prob_options: c.prob_options || t.prob_options || [],
      cons_options: c.cons_options || t.cons_options || [],
    });
  });

  if (!columnas.length && terminales.length) {
    terminales.forEach((t) => {
      columnas.push({
        nivel: t.nivel,
        nodo_id: t.nodo_id,
        omoe_id: t.omoe_id,
        nombre: t.nombre,
        unidad: t.unidad,
        input_kind: t.input_kind,
        select_options: t.select_options || [],
        constantes: t.constantes || {},
        familia_funciones: t.familia_funciones,
        tipo_criterio: t.tipo_mop || t.tipo_criterio || '',
        tipo_dato: t.tipo_dato || '',
        modo_evaluacion: t.modo_evaluacion || 'certeza',
        prob_options: t.prob_options || [],
        cons_options: t.cons_options || [],
      });
    });
  }

  const columnasMeta = {};
  schemaColumnas.forEach((c) => {
    columnasMeta[c.key] = c;
  });
  return {
    omoe_id: dimension.omoe_id,
    omoe_nombre: dimension.omoe_nombre,
    rama_evaluacion: dimension.rama_evaluacion,
    escenario_agregacion: dimension.escenario_agregacion,
    modo_valor_terminal: dimension.modo_valor_terminal,
    filas: escenarios,
    columnas,
    columnasMeta,
  };
}

/** Una matriz por dimensión (+ bloques legados si existen). */
export function buildDimensionMatrices(schema) {
  if (!schema) return [];
  return (schema.dimensiones || []).map(buildMatrixFromDimension);
}

/** @deprecated Use buildDimensionMatrices */
export function buildMatrixFromSchema(schema) {
  const matrices = buildDimensionMatrices(schema);
  if (matrices.length === 1) return matrices[0];
  return {
    filas: schema.escenarios || [],
    columnas: (schema.terminales || []).map((t) => ({
      nivel: t.nivel,
      nodo_id: t.nodo_id,
      nombre: t.nombre,
      input_kind: t.input_kind,
      select_options: t.select_options || [],
    })),
    generales: [],
    columnasMeta: Object.fromEntries((schema.columnas || []).map((c) => [c.key, c])),
  };
}

export function getCellMeta(schema, key) {
  return (schema.columnas || []).find((c) => c.key === key) || null;
}
