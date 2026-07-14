/** Muestreo y evaluación de funciones de utilidad (alineado con api/mcdm_utils.py + pyDecisionMaking). */

function toFloat(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstPresent(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return null;
}

function clip(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizedX(x, threshold, goal) {
  if (goal === threshold) return 0;
  return clip((x - threshold) / (goal - threshold), 0, 1);
}

function mapToUtilityRange(baseU, spec) {
  let bu = baseU;
  if (!spec.is_increasing) bu = 1 - bu;
  return spec.threshold_utility + bu * (spec.goal_utility - spec.threshold_utility);
}

function evalLinear(x, spec) {
  const nx = normalizedX(x, spec.threshold, spec.goal);
  return mapToUtilityRange(nx, spec);
}

function evalExponential(x, spec) {
  const nx = normalizedX(x, spec.threshold, spec.goal);
  const alpha = spec.shape_parameter;
  const denom = Math.exp(alpha) - 1;
  const baseU = denom === 0 ? nx : (Math.exp(alpha * nx) - 1) / denom;
  return mapToUtilityRange(baseU, spec);
}

function evalLogarithmic(x, spec) {
  const nx = normalizedX(x, spec.threshold, spec.goal);
  const alpha = spec.shape_parameter;
  const denom = Math.log(1 + alpha);
  const baseU = denom === 0 ? nx : Math.log(1 + alpha * nx) / denom;
  return mapToUtilityRange(baseU, spec);
}

function evalSigmoidal(x, spec) {
  const nx = normalizedX(x, spec.threshold, spec.goal);
  const k = spec.shape_parameter;
  const m = spec.midpoint;
  const rawLogistic = (val) => 1 / (1 + Math.exp(-k * (val - m)));
  const lower = rawLogistic(0);
  const upper = rawLogistic(1);
  const denom = upper - lower;
  const baseU = denom === 0 ? nx : (rawLogistic(nx) - lower) / denom;
  return mapToUtilityRange(baseU, spec);
}

/**
 * Construye especificación de utilidad compatible con evaluateUtility().
 * @param {{ familia?: string, params?: object, tipoCriterio?: string, tipoDato?: string }} cfg
 */
export function buildUtilitySpec({
  familia = '',
  params = {},
  tipoCriterio = '',
  tipoDato = '',
} = {}) {
  const fam = (familia || '').trim();
  const p = params || {};

  if (fam === 'escalas_discretas' || tipoDato === 'categorico') {
    const mapping = {};
    (p.categorias_utilidad || []).forEach((entry) => {
      const cat = entry?.categoria;
      const util = entry?.utilidad;
      if (cat != null && util != null && String(cat).trim() !== '') {
        mapping[String(cat)] = Number(util);
      }
    });
    if (Object.keys(mapping).length) {
      return { type: 'DiscreteUtilityFunction', mapping };
    }
    if (p.mapping && typeof p.mapping === 'object') {
      const m = {};
      Object.entries(p.mapping).forEach(([k, v]) => {
        m[String(k)] = Number(v);
      });
      if (Object.keys(m).length) return { type: 'DiscreteUtilityFunction', mapping: m };
    }
  }

  let threshold = toFloat(firstPresent(p.L));
  let goal = toFloat(firstPresent(p.U, p.T));
  if (threshold == null) threshold = 0;
  if (goal == null) goal = threshold + 1;

  const decreasing =
    tipoCriterio === 'menos_es_mejor'
    || fam.includes('decreciente')
    || fam.includes('inversa');

  const base = {
    threshold,
    goal,
    threshold_utility: 0,
    goal_utility: 1,
    is_increasing: !decreasing,
  };

  if (fam === 'exponencial_creciente' || fam === 'exponencial_decreciente') {
    return {
      type: 'ExponentialUtilityFunction',
      shape_parameter: toFloat(p.k) ?? 2,
      ...base,
    };
  }

  if (fam === 'meta_saturada' || fam === 'funcion_saturada') {
    return {
      type: 'LogarithmicUtilityFunction',
      shape_parameter: toFloat(firstPresent(p.k, p.S, p.T)) ?? 10,
      ...base,
    };
  }

  if (fam === 'logistica_decreciente') {
    const x0 = toFloat(p.x0);
    let midpoint = 0.5;
    if (x0 != null && goal !== threshold) {
      midpoint = clip((x0 - threshold) / (goal - threshold), 0, 1);
    }
    return {
      type: 'SigmoidalUtilityFunction',
      shape_parameter: toFloat(p.k) ?? 10,
      midpoint,
      ...base,
    };
  }

  return { type: 'LinearUtilityFunction', ...base };
}

/** Evalúa u(x) para la especificación dada. */
export function evaluateUtility(rawValue, spec) {
  if (!spec) return null;
  if (rawValue == null || String(rawValue).trim() === '') return null;

  if (spec.type === 'DiscreteUtilityFunction') {
    const key = String(rawValue).trim();
    if (key in spec.mapping) return spec.mapping[key];
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(spec.mapping)) {
      if (String(k).toLowerCase() === lower) return v;
    }
    return 0;
  }

  const x = Number(rawValue);
  if (!Number.isFinite(x)) return null;

  switch (spec.type) {
    case 'ExponentialUtilityFunction':
      return evalExponential(x, spec);
    case 'LogarithmicUtilityFunction':
      return evalLogarithmic(x, spec);
    case 'SigmoidalUtilityFunction':
      return evalSigmoidal(x, spec);
    default:
      return evalLinear(x, spec);
  }
}

/**
 * Genera puntos para graficar la curva.
 * @returns {{ discrete?: boolean, categories?: Array, points?: Array<{x:number,u:number}>, xMin?: number, xMax?: number }}
 */
export function sampleUtilityCurve(spec, { numPoints = 48, padding = 0.08 } = {}) {
  if (!spec) return { points: [], xMin: 0, xMax: 1 };

  if (spec.type === 'DiscreteUtilityFunction') {
    const categories = Object.entries(spec.mapping || {}).map(([label, u]) => ({
      label,
      u: Number(u),
    }));
    return { discrete: true, categories };
  }

  const lo = spec.threshold;
  const hi = spec.goal;
  const span = hi - lo || 1;
  const pad = span * padding;
  const xMin = lo - pad;
  const xMax = hi + pad;
  const points = [];

  for (let i = 0; i <= numPoints; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / numPoints;
    points.push({ x, u: evaluateUtility(x, spec) ?? 0 });
  }

  return { points, xMin, xMax };
}
