import { validatePesosDimensionesPercent } from '../../utils/pesoUtils';
import {
  DEFAULT_PARETO_EPSILON_DISPLAY,
  formatParetoEpsilonForInput,
  parseParetoEpsilonInput,
  PARETO_EPSILON_VALIDATION_MSG,
} from './paretoEpsilonUtils';

export const WIZARD_STEPS = [
  {
    id: 'nombre',
    title: 'Nombre',
    subtitle: 'Identifique este cálculo en el historial',
  },
  {
    id: 'direcciones',
    title: 'Dimensiones y MIN / MAX',
    subtitle: 'Seleccione qué dimensiones entran al cálculo y si mayor o menor es mejor',
  },
  {
    id: 'pareto',
    title: 'Pareto',
    subtitle: '¿Filtrar alternativas dominadas?',
  },
  {
    id: 'normalizacion',
    title: 'Normalización',
    subtitle: 'Método para escalar las dimensiones elegidas (por defecto: vectorial direccional)',
  },
  {
    id: 'pesos',
    title: 'Pesos',
    subtitle: 'Ponderación entre dimensiones',
  },
  {
    id: 'madm',
    title: 'Ranking',
    subtitle: 'Método MADM final (por defecto: TOPSIS)',
  },
  {
    id: 'resumen',
    title: 'Resumen',
    subtitle: 'Revise el proceso y ejecute',
  },
];

export const WIZARD_PIPELINE_FOCUS = {
  nombre: 'entrada',
  direcciones: 'entrada',
  pareto: 'pareto',
  normalizacion: 'normalizacion',
  pesos: 'pesos',
  madm: 'madm',
  resumen: null,
};

export function dimensionesSeleccionadas(allDimensiones = [], config = null) {
  const names = config?.dimensiones_normalizar || [];
  if (!names.length) return [];
  const set = new Set(names);
  return (allDimensiones || []).filter((d) => set.has(d.nombre));
}

export function buildPreviewPayload(calcConfig, allDimensiones = []) {
  if (!calcConfig) return null;

  const activas = dimensionesSeleccionadas(allDimensiones, calcConfig);

  const payload = {
    direcciones: calcConfig.direcciones || {},
    dimensiones_normalizar: calcConfig.dimensiones_normalizar || [],
  };

  if (calcConfig.aplicar_pareto !== null && calcConfig.aplicar_pareto !== undefined) {
    payload.aplicar_pareto = calcConfig.aplicar_pareto;
  }
  const epsilonCheck = parseParetoEpsilonInput(calcConfig.pareto_epsilon);
  if (epsilonCheck.ok) {
    payload.pareto_epsilon = epsilonCheck.value;
  }
  if (calcConfig.normalizacion_metodo) {
    payload.normalizacion_metodo = calcConfig.normalizacion_metodo;
  }
  if (calcConfig.metodo_pesos) {
    payload.metodo_pesos = calcConfig.metodo_pesos;
  }
  if (calcConfig.metodo_madm) {
    payload.metodo_madm = calcConfig.metodo_madm;
  }
  if (calcConfig.metodo_pesos === 'user_defined_weights') {
    payload.pesos_usuario = activas.map((dim) => {
      const idx = (allDimensiones || []).findIndex((d) => d.omoe_id === dim.omoe_id);
      const raw = idx >= 0 ? (calcConfig.pesos_usuario || [])[idx] : '';
      if (raw === '' || raw == null) return 0;
      const n = Number(String(raw).replace(',', '.'));
      return Number.isNaN(n) ? 0 : n;
    });
  }

  return payload;
}

export function createEmptyCalcConfig(dimensiones = [], defaults = {}) {
  const dirs = {};
  dimensiones.forEach((d) => {
    dirs[d.omoe_id] = d.direction || 'max';
  });
  return {
    nombre_calculo: '',
    solo_matriz: false,
    aplicar_pareto: defaults.aplicar_pareto ?? null,
    pareto_epsilon: formatParetoEpsilonForInput(defaults.pareto_epsilon),
    normalizacion_metodo: defaults.normalizacion_metodo || 'directional_vector',
    dimensiones_normalizar: defaults.dimensiones_normalizar || dimensiones.map((d) => d.nombre),
    direcciones: dirs,
    metodo_pesos: defaults.metodo_pesos || 'equal_weights',
    metodo_madm: defaults.metodo_madm || 'topsis',
    pesos_usuario: dimensiones.map(() => ''),
  };
}

export function validateWizardStep(stepId, config, opcionesMeta) {
  const allDimensiones = opcionesMeta?.dimensiones || [];
  const activas = dimensionesSeleccionadas(allDimensiones, config);

  switch (stepId) {
    case 'nombre':
      if (!config?.nombre_calculo?.trim()) {
        return { ok: false, message: 'Escriba un nombre para el cálculo.' };
      }
      return { ok: true };

    case 'direcciones': {
      if (!activas.length) {
        return { ok: false, message: 'Seleccione al menos una dimensión para el cálculo.' };
      }
      for (const d of activas) {
        const dir = config.direcciones?.[d.omoe_id] ?? config.direcciones?.[String(d.omoe_id)];
        if (!dir) {
          return { ok: false, message: `Defina MIN/MAX para la dimensión «${d.nombre}».` };
        }
      }
      return { ok: true };
    }

    case 'pareto':
      if (config?.aplicar_pareto === null || config?.aplicar_pareto === undefined) {
        return { ok: false, message: 'Seleccione si desea aplicar el filtro Pareto.' };
      }
      {
        const eps = parseParetoEpsilonInput(config?.pareto_epsilon);
        if (!eps.ok) {
          return { ok: false, message: eps.message || PARETO_EPSILON_VALIDATION_MSG };
        }
      }
      return { ok: true };

    case 'normalizacion':
      if (!activas.length) {
        return { ok: false, message: 'Seleccione al menos una dimensión para el cálculo.' };
      }
      if (!config?.normalizacion_metodo) {
        return { ok: false, message: 'Seleccione un método de normalización.' };
      }
      return { ok: true };

    case 'dimensiones':
      if (!activas.length) {
        return { ok: false, message: 'Seleccione al menos una dimensión para el cálculo.' };
      }
      return { ok: true };

    case 'pesos':
      if (!config?.metodo_pesos) {
        return { ok: false, message: 'Seleccione un método de cálculo de pesos.' };
      }
      if (config.metodo_pesos === 'user_defined_weights') {
        const pesosActivos = activas.map((dim) => {
          const idx = allDimensiones.findIndex((d) => d.omoe_id === dim.omoe_id);
          return idx >= 0 ? (config.pesos_usuario || [])[idx] : '';
        });
        const check = validatePesosDimensionesPercent(pesosActivos, activas.length);
        if (!check.ok) {
          return { ok: false, message: check.message || 'Los pesos deben sumar 100 %.' };
        }
      }
      return { ok: true };

    case 'madm':
      if (!config?.metodo_madm) {
        return { ok: false, message: 'Seleccione un método MADM de ranking.' };
      }
      return { ok: true };

    case 'resumen':
      for (const step of WIZARD_STEPS.slice(0, -1)) {
        const v = validateWizardStep(step.id, config, opcionesMeta);
        if (!v.ok) return v;
      }
      return { ok: true };

    default:
      return { ok: true };
  }
}

export function buildConfigSummary(config, opcionesMeta) {
  const dimensiones = opcionesMeta?.dimensiones || [];
  const activas = dimensionesSeleccionadas(dimensiones, config);
  const normLabel = opcionesMeta?.normalization_methods?.find(
    (m) => m.value === config.normalizacion_metodo,
  )?.label;
  const pesoLabel = opcionesMeta?.weight_methods?.find(
    (m) => m.value === config.metodo_pesos,
  )?.label;
  const madmLabel = opcionesMeta?.madm_methods?.find(
    (m) => m.value === config.metodo_madm,
  )?.label;

  return [
    { label: 'Nombre', value: config.nombre_calculo?.trim() || '—' },
    {
      label: 'Direcciones MIN/MAX',
      value:
        activas.length > 0
          ? activas
              .map((d) => {
                const dir =
                  config.direcciones?.[d.omoe_id] ??
                  config.direcciones?.[String(d.omoe_id)] ??
                  d.direction ??
                  'max';
                return `${d.nombre}: ${dir === 'min' ? 'MIN' : 'MAX'}`;
              })
              .join(' · ')
          : '—',
    },
    {
      label: 'Filtro Pareto',
      value:
        config.aplicar_pareto === null
          ? '—'
          : config.aplicar_pareto
            ? 'Sí — solo no dominadas'
            : 'No — todas las alternativas',
    },
    {
      label: 'Epsilon Pareto',
      value: (() => {
        const eps = parseParetoEpsilonInput(config.pareto_epsilon);
        return eps.ok ? String(eps.value) : '—';
      })(),
    },
    {
      label: 'Dimensiones en el cálculo',
      value:
        activas.length > 0
          ? activas.map((d) => d.nombre).join(', ')
          : '—',
    },
    { label: 'Método normalización', value: normLabel || config.normalizacion_metodo || '—' },
    { label: 'Pesos', value: pesoLabel || config.metodo_pesos || '—' },
    { label: 'Ranking MADM', value: madmLabel || config.metodo_madm || '—' },
  ];
}
