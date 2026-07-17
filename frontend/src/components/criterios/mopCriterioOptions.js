/** Tipo de criterio y familias de funciones (formularios de MOP). */

import {
  defaultParametrosForFamilia,
  normalizeParametrosForFamilia,
} from './mopFuncionParams';

export const TIPOS_CRITERIO = [
  { value: 'mas_es_mejor', label: 'Más es mejor' },
  { value: 'menos_es_mejor', label: 'Menos es mejor' },
  {
    value: 'menos_es_mejor_penalizacion',
    label: 'Menos es mejor, con penalización potencialmente no lineal',
  },
  { value: 'valor_objetivo', label: 'Existe un valor objetivo' },
  { value: 'intervalo_optimo', label: 'Existe un intervalo o punto optimo' },
  { value: 'preferencia_categorias', label: 'Preferencia por categorías' },
];

export const FAMILIAS_POR_TIPO = {
  mas_es_mejor: [
    { value: 'razon_relativa', label: 'Razón relativa' },
    { value: 'min_max', label: 'Min-max' },
    { value: 'meta_saturada', label: 'Meta saturada' },
    { value: 'exponencial_creciente', label: 'Exponencial creciente' },
  ],
  menos_es_mejor: [
    { value: 'razon_inversa', label: 'Razón inversa' },
    { value: 'min_max_decreciente', label: 'Min-max decreciente' },
    { value: 'exponencial_decreciente', label: 'Exponencial decreciente' },
  ],
  menos_es_mejor_penalizacion: [
    { value: 'exponencial_decreciente', label: 'Exponencial decreciente' },
    { value: 'logistica_decreciente', label: 'Logística decreciente' },
    { value: 'umbral_veto', label: 'Umbral de veto' },
  ],
  valor_objetivo: [
    { value: 'funcion_saturada', label: 'Función saturada' },
    { value: 'distancia_meta', label: 'Distancia a meta' },
  ],
  intervalo_optimo: [
    { value: 'triangular', label: 'Triangular' },
    { value: 'trapezoidal', label: 'Trapezoidal' },
    { value: 'distancia_ideal', label: 'Distancia al ideal' },
  ],
  preferencia_categorias: [
    { value: 'escalas_discretas', label: 'Escalas discretas' },
    { value: 'tablas_equivalencia', label: 'Tablas de equivalencia' },
  ],
};

/**
 * Familias retiradas del selector por ser redundantes o no evaluables.
 * Se remapean a su equivalente vigente para que criterios ya guardados
 * conserven el mismo comportamiento numérico al editarlos.
 */
export const LEGACY_FAMILIA_ALIAS = {
  umbral_creciente: 'min_max',
  umbral_decreciente: 'min_max_decreciente',
};

export function getFamiliasForTipo(tipo) {
  return FAMILIAS_POR_TIPO[tipo] || [];
}

export function getTipoLabel(value) {
  return TIPOS_CRITERIO.find((t) => t.value === value)?.label || value || '—';
}

export function getFamiliaLabel(tipo, value) {
  return getFamiliasForTipo(tipo).find((f) => f.value === value)?.label || value || '—';
}

export function defaultMopCriterioFields() {
  const tipo = TIPOS_CRITERIO[0].value;
  const familia = getFamiliasForTipo(tipo)[0]?.value || '';
  return {
    tipo_criterio: tipo,
    familia_funciones: familia,
    parametros_funcion: defaultParametrosForFamilia(familia),
  };
}

export function normalizeMopCriterioFields(tipo, familia, parametros = null) {
  const familias = getFamiliasForTipo(tipo);
  if (!familias.length) {
    return {
      tipo_criterio: tipo || '',
      familia_funciones: '',
      parametros_funcion: {},
    };
  }
  const aliased = LEGACY_FAMILIA_ALIAS[familia] || familia;
  const valid = familias.some((f) => f.value === aliased);
  const resolvedFamilia = valid ? aliased : familias[0].value;
  return {
    tipo_criterio: tipo || familias[0] ? tipo : '',
    familia_funciones: resolvedFamilia,
    parametros_funcion: normalizeParametrosForFamilia(resolvedFamilia, parametros),
  };
}
