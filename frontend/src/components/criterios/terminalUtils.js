import { CRITERIO_LEVELS } from './constants';

/** Dimensión sin nodos en el árbol = nodo terminal evaluable. */
export function isTerminalCriterioNode(level, item) {
  if (!item) return false;
  if (level === CRITERIO_LEVELS.OMOE) {
    return !(item.nodos?.length);
  }
  if (level === CRITERIO_LEVELS.NODO_ARBOL) {
    return !(item.hijos?.length);
  }
  if (level === CRITERIO_LEVELS.DP) return true;
  if (level === CRITERIO_LEVELS.MOP) return !(item.dps?.length);
  if (level === CRITERIO_LEVELS.GRUPO_AFINIDAD) return !(item.mops?.length);
  return false;
}

/**
 * Muestra bloque de utilidad (tipo, familia, parámetros).
 * En nodos nuevos solo si el usuario marca "nodo evaluable (hoja)".
 */
export function showUtilidadFields(level, item, formData = {}) {
  if (level === CRITERIO_LEVELS.OMOE) {
    if (item?.nodos?.length) return false;
    if (!item) return Boolean(formData.es_nodo_evaluable);
    if (item.tipo_criterio || item.familia_funciones) return true;
    return Boolean(formData.es_nodo_evaluable);
  }
  if (level === CRITERIO_LEVELS.NODO_ARBOL) {
    if (item?.hijos?.length) return false;
    if (!item) return Boolean(formData.es_nodo_evaluable);
    if (item.tipo_criterio || item.familia_funciones) return true;
    if (item.modo_evaluacion === 'incertidumbre') return true;
    return Boolean(formData.es_nodo_evaluable);
  }
  return isTerminalCriterioNode(level, item);
}
