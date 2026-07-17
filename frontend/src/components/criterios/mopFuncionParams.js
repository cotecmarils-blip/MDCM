/**
 * Parámetros de usuario por familia de función (según tabla de referencia MOP).
 *
 * Claves = valor interno del selector «Familias de funciones aplicadas».
 * Etiquetas visibles y fórmulas: api/familia_funciones_doc.py (FAMILIA_FUNCIONES_DOC).
 */

export const FAMILIA_PARAM_SPECS = {
  razon_relativa: [
    { key: 'U', label: 'U — referencia (máximo)', type: 'number', required: true },
  ],
  min_max: [
    { key: 'L', label: 'L — límite inferior (constante)', type: 'number', required: true },
    { key: 'U', label: 'U — límite superior (constante)', type: 'number', required: true },
  ],
  meta_saturada: [{ key: 'T', label: 'T (meta)', type: 'number', required: true }],
  umbral_creciente: [
    { key: 'L', label: 'L (límite inferior)', type: 'number', required: true },
    { key: 'U', label: 'U (límite superior)', type: 'number', required: true },
  ],
  exponencial_creciente: [
    { key: 'L', label: 'L (límite inferior)', type: 'number', required: true },
    { key: 'U', label: 'U (límite superior)', type: 'number', required: true },
    { key: 'k', label: 'k (pendiente)', type: 'number', required: true },
  ],
  razon_inversa: [
    { key: 'L', label: 'L — referencia (mínimo)', type: 'number', required: true },
  ],
  min_max_decreciente: [
    { key: 'L', label: 'L — límite inferior (constante)', type: 'number', required: true },
    { key: 'U', label: 'U — límite superior (constante)', type: 'number', required: true },
  ],
  umbral_decreciente: [
    { key: 'L', label: 'L (límite inferior)', type: 'number', required: true },
    { key: 'U', label: 'U (límite superior)', type: 'number', required: true },
  ],
  exponencial_decreciente: [
    { key: 'k', label: 'k (pendiente)', type: 'number', required: true },
    { key: 'L', label: 'L (opcional)', type: 'number', required: false },
    { key: 'U', label: 'U (opcional)', type: 'number', required: false },
  ],
  logistica_decreciente: [
    { key: 'x0', label: 'x0 (punto de inflexión)', type: 'number', required: true },
    { key: 'k', label: 'k (pendiente)', type: 'number', required: true },
  ],
  umbral_veto: [{ key: 'V', label: 'V (umbral de veto)', type: 'number', required: true }],
  funcion_saturada: [
    { key: 'L', label: 'L (límite inferior)', type: 'number', required: true },
    { key: 'S', label: 'S (saturación)', type: 'number', required: true },
  ],
  distancia_meta: [
    { key: 'T', label: 'T (meta)', type: 'number', required: true },
    { key: 'R', label: 'R (radio / tolerancia)', type: 'number', required: true },
  ],
  triangular: [
    { key: 'L', label: 'L (límite inferior)', type: 'number', required: true },
    { key: 'M', label: 'M (óptimo)', type: 'number', required: true },
    { key: 'U', label: 'U (límite superior)', type: 'number', required: true },
  ],
  trapezoidal: [
    { key: 'L', label: 'L (límite inferior)', type: 'number', required: true },
    { key: 'M1', label: 'M1 (inicio meseta)', type: 'number', required: true },
    { key: 'M2', label: 'M2 (fin meseta)', type: 'number', required: true },
    { key: 'U', label: 'U (límite superior)', type: 'number', required: true },
  ],
  distancia_ideal: [
    { key: 'I', label: 'I (valor ideal)', type: 'number', required: true },
    { key: 'dmax', label: 'dmax (distancia máxima, opcional)', type: 'number', required: false },
  ],
  escalas_discretas: [
    {
      key: 'categorias_opciones',
      label: 'Categorías posibles',
      type: 'option_pool',
      required: true,
      hint: 'Defina las categorías; luego asigne utilidad a cada una.',
    },
    {
      key: 'categorias_utilidad',
      label: 'Utilidad por categoría',
      type: 'paired_list',
      leftKey: 'categoria',
      rightKey: 'utilidad',
      optionsFrom: 'categorias_opciones',
      required: true,
    },
  ],
  funciones_tramos: [
    {
      key: 'puntos_corte',
      label: 'Puntos de corte (separados por coma)',
      type: 'text',
      required: true,
    },
    {
      key: 'regla_por_tramo',
      label: 'Regla por tramo',
      type: 'textarea',
      required: true,
    },
  ],
  tablas_equivalencia: [
    {
      key: 'estados_opciones',
      label: 'Valores o estados posibles',
      type: 'option_pool',
      required: true,
      hint: 'Primero defina los estados; luego configure cada equivalencia.',
    },
    {
      key: 'equivalencias',
      label: 'Tabla de equivalencias',
      type: 'paired_list',
      leftKey: 'estado',
      rightKey: 'utilidad',
      optionsFrom: 'estados_opciones',
      required: true,
    },
  ],
};

export function getParamSpecsForFamilia(familia) {
  return FAMILIA_PARAM_SPECS[familia] || [];
}

export function familiaRequiresParams(familia) {
  return getParamSpecsForFamilia(familia).length > 0;
}

/** @deprecated Usar campos L/U en parametros_funcion por familia. */
export const FAMILIA_UMBRAL_META_HINTS = {};

export function getFamiliaConstantHint() {
  return null;
}

export function defaultParametrosForFamilia(familia) {
  const params = {};
  getParamSpecsForFamilia(familia).forEach((spec) => {
    if (spec.type === 'option_pool' || spec.type === 'paired_list') {
      params[spec.key] = [];
    } else {
      params[spec.key] = '';
    }
  });
  return params;
}

export function normalizeParametrosForFamilia(familia, raw) {
  const base = defaultParametrosForFamilia(familia);
  if (!raw || typeof raw !== 'object') return base;
  const result = { ...base };
  Object.keys(base).forEach((key) => {
    if (raw[key] !== undefined && raw[key] !== null) {
      result[key] = raw[key];
    }
  });
  return result;
}

export function formatParamValue(spec, value) {
  if (spec.type === 'option_pool') {
    const list = Array.isArray(value) ? value : [];
    return list.length ? list.join(', ') : '—';
  }
  if (spec.type === 'paired_list') {
    const rows = Array.isArray(value) ? value : [];
    if (!rows.length) return '—';
    const lk = spec.leftKey || 'estado';
    const rk = spec.rightKey || 'utilidad';
    return rows.map((r) => `${r[lk] || '?'} → ${r[rk] ?? '?'}`).join('; ');
  }
  return value === '' || value == null ? '—' : String(value);
}
