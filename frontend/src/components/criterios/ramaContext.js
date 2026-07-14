import { CRITERIO_LEVELS } from './constants';

export const RAMA_FILTER_ALL = 'all';

export const RAMA_META = {
  omoe: {
    label: 'OMOE',
    title: 'Efectividad operativa',
    hint: 'Indicadores donde un valor mayor suele ser mejor (velocidad, alcance, capacidad).',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  omoc: {
    label: 'OMOC',
    title: 'Costo operativo',
    hint: 'Indicadores de costo: menor valor es preferible (CAPEX, OPEX, ciclo de vida).',
    badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  },
  omor: {
    label: 'OMOR',
    title: 'Riesgo operativo',
    hint: 'Indicadores de riesgo o penalización: menor exposición es preferible.',
    badgeClass: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200',
  },
};

export const RAMA_MOP_PRESETS = {
  omoe: {
    tipo_mop: 'mas_es_mejor',
    sentido_mejora: 'maximizar',
    familia_funciones: 'min_max',
  },
  omoc: {
    tipo_mop: 'menos_es_mejor',
    sentido_mejora: 'minimizar',
    familia_funciones: 'min_max_decreciente',
  },
  omor: {
    tipo_mop: 'menos_es_mejor_penalizacion',
    sentido_mejora: 'minimizar',
    familia_funciones: 'exponencial_decreciente',
  },
};

export function getRamaMeta(rama) {
  if (RAMA_META[rama]) return RAMA_META[rama];
  const code = (rama || '').toString();
  return {
    label: code.toUpperCase() || 'TIPO',
    title: code || 'Tipo personalizado',
    hint: 'Tipo de dimensión del catálogo global.',
    badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-200',
  };
}

export function normalizeRama(rama) {
  if (!rama || rama === 'auto') return null;
  return rama;
}

export function effectiveOmoeRama(omoe) {
  if (!omoe) return 'omoe';
  const explicit = normalizeRama(omoe.rama_evaluacion);
  if (explicit) return explicit;
  return 'omoe';
}

/** @deprecated Usar effectiveOmoeRama en el primer nivel del árbol. */
export function effectiveGrupoRama(grupo) {
  if (!grupo) return 'omoe';
  const explicit = normalizeRama(grupo.rama_evaluacion);
  if (explicit) return explicit;
  const name = `${grupo.nombre_grupo || ''} ${grupo.descripcion_funcional || ''}`.toLowerCase();
  if (/cost|costo|capex|opex|precio|presupuesto/.test(name)) return 'omoc';
  if (/risk|riesgo|peligro|amenaza|falla|seguridad/.test(name)) return 'omor';
  return 'omoe';
}

export function resolveDimensionRama(selection) {
  if (!selection) return null;
  if (selection.dimensionRama) return selection.dimensionRama;
  const { level, node } = selection;

  if (level === CRITERIO_LEVELS.OMOE && node) {
    return effectiveOmoeRama(node);
  }
  return null;
}

/**
 * Rama correcta al crear un hijo bajo una dimensión o un nodo del árbol.
 * No debe caer a OMOE cuando el padre está en OMOC/OMOR.
 */
export function resolveAddChildRama(parentLevel, parentNode, forest = []) {
  if (!parentNode) return 'omoe';

  if (parentLevel === CRITERIO_LEVELS.OMOE) {
    return effectiveOmoeRama(parentNode);
  }

  if (parentNode.dimensionRama) {
    return parentNode.dimensionRama;
  }
  if (parentNode.rama) {
    return parentNode.rama;
  }

  const omoeId = parentNode.omoe_id ?? parentNode.omoe;
  if (omoeId != null && Array.isArray(forest) && forest.length) {
    const omoe = forest.find((o) => String(o.id) === String(omoeId));
    if (omoe) return effectiveOmoeRama(omoe);
  }

  return effectiveOmoeRama(parentNode);
}

export function filterForestByRama(forest, ramaFilter) {
  if (!forest?.length || ramaFilter === RAMA_FILTER_ALL) return forest;
  return forest.filter((omoe) => effectiveOmoeRama(omoe) === ramaFilter);
}
