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

// Mapea una utilidad base ya orientada (mayor = mejor) al rango [tu, gu] sin invertir.
function mapOriented(baseU, spec) {
  const bu = clip(baseU, 0, 1);
  return spec.threshold_utility + bu * (spec.goal_utility - spec.threshold_utility);
}

function evalRatio(x, spec) {
  let base;
  if (spec.is_increasing) {
    base = spec.goal === 0 ? 0 : clip(x / spec.goal, 0, 1);
  } else if (x <= 0) {
    base = 1;
  } else if (spec.threshold <= 0) {
    base = 0;
  } else {
    base = clip(spec.threshold / x, 0, 1);
  }
  return mapOriented(base, spec);
}

function evalTriangular(x, spec) {
  const { threshold: L, goal: U, peak: M } = spec;
  let base;
  if (U <= L || x <= L || x >= U) base = 0;
  else if (x <= M) base = M > L ? (x - L) / (M - L) : 1;
  else base = U > M ? (U - x) / (U - M) : 1;
  return mapOriented(base, spec);
}

function evalTrapezoidal(x, spec) {
  const { threshold: L, goal: U, plateau_start: M1, plateau_end: M2 } = spec;
  let base;
  if (U <= L || x <= L || x >= U) base = 0;
  else if (x < M1) base = M1 > L ? (x - L) / (M1 - L) : 1;
  else if (x <= M2) base = 1;
  else base = U > M2 ? (U - x) / (U - M2) : 1;
  return mapOriented(base, spec);
}

function evalDistance(x, spec) {
  const r = spec.radius || 1;
  const base = 1 - Math.abs(x - spec.target) / r;
  return mapOriented(base, spec);
}

function evalVeto(x, spec) {
  const { threshold: L, veto: V } = spec;
  let base;
  if (x >= V) base = 0;
  else if (V > L) base = clip(1 - (x - L) / (V - L), 0, 1);
  else base = x <= L ? 1 : 0;
  return mapOriented(base, spec);
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

  if (fam === 'razon_relativa' || fam === 'razon_inversa') {
    // Razón: creciente u=x/U (dominio [0,U]); decreciente u=L/x (dominio
    // [L, 5L]). Solo pide un parámetro (U o L); el otro extremo es para
    // graficar la vista previa con un rango razonable.
    const rbase = { ...base };
    if (rbase.is_increasing) {
      rbase.threshold = 0;
      if (!(rbase.goal > 0)) rbase.goal = 1;
    } else {
      if (!(rbase.threshold > 0)) rbase.threshold = (rbase.goal || 10) * 0.1 || 1;
      rbase.goal = rbase.threshold * 5;
    }
    return { type: 'RatioUtilityFunction', ...rbase };
  }

  if (fam === 'triangular') {
    const peak = toFloat(p.M) ?? (threshold + goal) / 2;
    return { type: 'TriangularUtilityFunction', peak, ...base };
  }

  if (fam === 'trapezoidal') {
    const span = (goal - threshold) || 1;
    const plateauStart = toFloat(p.M1) ?? threshold + span / 3;
    const plateauEnd = toFloat(p.M2) ?? threshold + (2 * span) / 3;
    return {
      type: 'TrapezoidalUtilityFunction',
      plateau_start: plateauStart,
      plateau_end: plateauEnd,
      ...base,
    };
  }

  if (fam === 'distancia_meta' || fam === 'distancia_ideal') {
    const target = toFloat(firstPresent(p.T, p.I)) ?? (threshold + goal) / 2;
    let radius = toFloat(firstPresent(p.R, p.dmax));
    if (radius == null || radius === 0) radius = Math.abs(goal - threshold) / 2 || 1;
    return {
      type: 'DistanceUtilityFunction',
      target,
      radius,
      ...base,
      threshold: target - radius,
      goal: target + radius,
    };
  }

  if (fam === 'umbral_veto') {
    const veto = toFloat(p.V) ?? goal;
    return {
      type: 'VetoUtilityFunction',
      veto,
      ...base,
      is_increasing: false,
      goal: veto,
    };
  }

  if (fam === 'tablas_equivalencia') {
    const mapping = {};
    (p.equivalencias || []).forEach((entry) => {
      const est = entry?.estado;
      const util = entry?.utilidad;
      if (est != null && util != null && String(est).trim() !== '') {
        mapping[String(est)] = Number(util);
      }
    });
    if (Object.keys(mapping).length) {
      return { type: 'DiscreteUtilityFunction', mapping };
    }
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
    case 'RatioUtilityFunction':
      return evalRatio(x, spec);
    case 'TriangularUtilityFunction':
      return evalTriangular(x, spec);
    case 'TrapezoidalUtilityFunction':
      return evalTrapezoidal(x, spec);
    case 'DistanceUtilityFunction':
      return evalDistance(x, spec);
    case 'VetoUtilityFunction':
      return evalVeto(x, spec);
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
