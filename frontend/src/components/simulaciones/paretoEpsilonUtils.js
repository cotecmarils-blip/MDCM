/** Debe coincidir con DEFAULT_PARETO_EPSILON en api/pareto_solver.py */
export const DEFAULT_PARETO_EPSILON = 1e-12;

export const DEFAULT_PARETO_EPSILON_DISPLAY = '1e-12';

export const PARETO_EPSILON_VALIDATION_MSG =
  'Ingrese un valor de epsilon válido, mayor o igual que cero.';

export function formatParetoEpsilonForInput(value) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_PARETO_EPSILON_DISPLAY;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return String(value).trim();
}

/**
 * @returns {{ ok: true, value: number } | { ok: false, message: string }}
 */
export function parseParetoEpsilonInput(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: true, value: DEFAULT_PARETO_EPSILON };
  }
  const normalized = String(raw).trim().replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, message: PARETO_EPSILON_VALIDATION_MSG };
  }
  return { ok: true, value: parsed };
}
