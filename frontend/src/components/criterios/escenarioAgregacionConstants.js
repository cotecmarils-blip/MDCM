/** Categorías de agregación de escenarios por dimensión (metodología MDCM). */

export const ESCENARIO_AGREG_COMPENSATORIO = 'compensatorio';
export const ESCENARIO_AGREG_MINIMO_MEJOR = 'minimo_mejor';
export const ESCENARIO_AGREG_MAXIMO_MEJOR = 'maximo_mejor';
export const ESCENARIO_AGREG_PEOR_CASO = 'peor_caso';
export const ESCENARIO_AGREG_INDEPENDIENTE = 'independiente';

export const ESCENARIO_AGREGACION_OPTIONS = [
  {
    value: ESCENARIO_AGREG_COMPENSATORIO,
    label: 'Compensatorio',
    description:
      'Eq. (21): contextos incluyentes — se combinan con pesos meso (típico efectividad / misiones).',
    status: 'Recomendado efectividad',
    statusTone: 'recommended',
  },
  {
    value: ESCENARIO_AGREG_MINIMO_MEJOR,
    label: 'Mínimo-mejor',
    description:
      'Eq. (22) sentido negativo: se elige el contexto más favorable (menor costo / riesgo).',
    status: 'Costos / riesgos',
    statusTone: 'advanced',
  },
  {
    value: ESCENARIO_AGREG_MAXIMO_MEJOR,
    label: 'Máximo-mejor',
    description:
      'Eq. (22) sentido positivo: se elige el contexto con mayor valor (beneficio).',
    status: 'Avanzado',
    statusTone: 'experimental',
  },
  {
    value: ESCENARIO_AGREG_PEOR_CASO,
    label: 'Peor caso',
    description:
      'Eq. (23): resolución robusta — invierte la selección preferencial (max en costo/riesgo; min en beneficio).',
    status: 'Robusto',
    statusTone: 'advanced',
  },
  {
    value: ESCENARIO_AGREG_INDEPENDIENTE,
    label: 'Independiente',
    description:
      'Cada escenario se evalúa por separado; sin agregación global (placeholder).',
    status: 'Futuro',
    statusTone: 'basic',
  },
];

export const MODO_VALOR_UTILIDAD = 'utilidad';
export const MODO_VALOR_BRUTO = 'valor_bruto';

export const MODO_VALOR_TERMINAL_OPTIONS = [
  {
    value: MODO_VALOR_UTILIDAD,
    label: 'Función de utilidad (0–1)',
    description: 'Transforma x con la curva u(x) definida en el nodo.',
  },
  {
    value: MODO_VALOR_BRUTO,
    label: 'Valor bruto (sin transformación)',
    description: 'Usa el dato x tal cual y lo suma (típico en dimensión de costos).',
  },
];

export function defaultsForRama(rama, tipoMeta = null) {
  if (tipoMeta) {
    return {
      escenario_agregacion: tipoMeta.escenario_agregacion_default || ESCENARIO_AGREG_COMPENSATORIO,
      modo_valor_terminal: tipoMeta.modo_valor_terminal_default || MODO_VALOR_UTILIDAD,
    };
  }
  if (rama === 'omoc') {
    return {
      escenario_agregacion: ESCENARIO_AGREG_MINIMO_MEJOR,
      modo_valor_terminal: MODO_VALOR_BRUTO,
    };
  }
  if (rama === 'omor') {
    return {
      escenario_agregacion: ESCENARIO_AGREG_MINIMO_MEJOR,
      modo_valor_terminal: MODO_VALOR_UTILIDAD,
    };
  }
  return {
    escenario_agregacion: ESCENARIO_AGREG_COMPENSATORIO,
    modo_valor_terminal: MODO_VALOR_UTILIDAD,
  };
}

export function getEscenarioAgregacionLabel(value) {
  return ESCENARIO_AGREGACION_OPTIONS.find((o) => o.value === value)?.label || value;
}

export function getModoValorTerminalLabel(value) {
  return MODO_VALOR_TERMINAL_OPTIONS.find((o) => o.value === value)?.label || value;
}

/** Solo en modo compensatorio los pesos de escenario participan en el cálculo. */
export function usesEscenarioPesos(escenarioAgregacion) {
  const mode = escenarioAgregacion || ESCENARIO_AGREG_COMPENSATORIO;
  return mode === ESCENARIO_AGREG_COMPENSATORIO;
}

export function getEscenarioPesosHint(escenarioAgregacion) {
  if (usesEscenarioPesos(escenarioAgregacion)) return null;
  const label = getEscenarioAgregacionLabel(escenarioAgregacion);
  if (escenarioAgregacion === ESCENARIO_AGREG_PEOR_CASO) {
    return `En modo «${label}» no se usan pesos entre escenarios: el cálculo elige el escenario más adverso por alternativa (Eq. 23).`;
  }
  return `En modo «${label}» no se usan pesos entre escenarios: el cálculo elige el escenario más favorable por alternativa.`;
}
