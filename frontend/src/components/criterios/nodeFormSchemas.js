import { CRITERIO_LEVELS } from './constants';
import { TIPOS_CRITERIO, defaultMopCriterioFields, normalizeMopCriterioFields } from './mopCriterioOptions';
import { RAMA_MOP_PRESETS } from './ramaContext';
import { DIMENSION_RAMA_OPTIONS } from './ramaEvaluacionOptions';
import { showUtilidadFields, isTerminalCriterioNode } from './terminalUtils';
import { FAMILIA_PARAM_SPECS } from './mopFuncionParams';
import { defaultCalculationFormState, buildCalculationPayload } from './calculationMethodConstants';
import { defaultsForRama } from './escenarioAgregacionConstants';

const SENTIDO_MEJORA_OPTS = [
  { value: 'maximizar', label: 'Maximizar' },
  { value: 'minimizar', label: 'Minimizar' },
  { value: 'objetivo', label: 'Acercarse a objetivo' },
];

const TIPO_DATO_OPTS = [
  { value: 'numerico', label: 'Numérico' },
  { value: 'texto', label: 'Texto' },
  { value: 'booleano', label: 'Booleano' },
  { value: 'categorico', label: 'Categórico' },
];

function f(name, label, type = 'text', extra = {}) {
  return { name, label, type, ...extra };
}

export const NODE_FORM_SCHEMAS = {
  [CRITERIO_LEVELS.OMOE]: [
    {
      name: 'rama_evaluacion',
      label: 'Tipo',
      type: 'select',
      required: true,
      options: DIMENSION_RAMA_OPTIONS,
    },
    f('nombre_modelo', 'Nombre de la dimensión', 'text', { required: true }),
    f('codigo', 'Código'),
    f('descripcion_general', 'Descripción', 'textarea'),
    f('version', 'Versión'),
    f('responsable', 'Responsable'),
    f('estado', 'Estado'),
    f('rango_minimo', 'Rango mínimo', 'number'),
    f('rango_maximo', 'Rango máximo', 'number'),
    f('observaciones', 'Observaciones', 'textarea'),
    f('tipo_dato', 'Tipo de dato', 'select', { options: TIPO_DATO_OPTS }),
    f('unidad', 'Unidad'),
  ],
  [CRITERIO_LEVELS.MISION]: [
    f('nombre_mision', 'Nombre de la misión', 'text', { required: true }),
    f('codigo', 'Código'),
    f('descripcion_operacional', 'Descripción operacional', 'textarea'),
    f('peso', 'Peso dentro del modelo (%)', 'number', { step: 0.01, min: 0, max: 100 }),
    f('aplica', 'Aplica', 'boolean'),
    f('responsable_validacion', 'Responsable de validación'),
    f('justificacion_peso', 'Justificación del peso', 'textarea'),
    f('observaciones', 'Observaciones', 'textarea'),
  ],
  [CRITERIO_LEVELS.NODO_ARBOL]: [
    f('nombre', 'Nombre del nodo', 'text', { required: true }),
    f('codigo', 'Código'),
    f('descripcion', 'Descripción', 'textarea'),
    {
      name: 'tipo_dato',
      label: 'Tipo de dato',
      type: 'select',
      options: TIPO_DATO_OPTS,
    },
    f('unidad', 'Unidad'),
    f('fuente_dato', 'Fuente del dato'),
    f('evidencia_requerida', 'Evidencia requerida', 'boolean'),
    f('tipo_evidencia', 'Tipo de evidencia'),
    f('observaciones', 'Observaciones', 'textarea'),
  ],
  [CRITERIO_LEVELS.GRUPO_AFINIDAD]: [
    f('nombre_grupo', 'Nombre del grupo', 'text', { required: true }),
    f('codigo', 'Código'),
    f('descripcion_funcional', 'Descripción funcional', 'textarea'),
    f('peso', 'Peso (%)', 'number', { step: 0.01, min: 0, max: 100 }),
    f('aplica', 'Aplica', 'boolean'),
    f('justificacion_peso', 'Justificación del peso', 'textarea'),
    f('observaciones', 'Observaciones', 'textarea'),
  ],
  [CRITERIO_LEVELS.MOP]: [
    f('nombre_mop', 'Nombre del MOP', 'text', { required: true }),
    f('codigo', 'Código'),
    f('descripcion_indicador', 'Descripción del indicador', 'textarea'),
    {
      name: 'tipo_criterio',
      label: 'Tipo de MOP',
      type: 'select',
      options: TIPOS_CRITERIO,
    },
    f('unidad_medida', 'Unidad de medida'),
    f('peso', 'Peso dentro del grupo (%)', 'number', { step: 0.01, min: 0, max: 100 }),
    f('valor_umbral', 'Valor umbral', 'number'),
    f('valor_meta', 'Valor meta', 'number'),
    {
      name: 'sentido_mejora',
      label: 'Sentido de mejora',
      type: 'select',
      options: SENTIDO_MEJORA_OPTS,
    },
    f('metodo_evaluacion', 'Método de evaluación'),
    f('valor_minimo_utilidad', 'Valor mínimo de utilidad', 'number'),
    f('valor_maximo_utilidad', 'Valor máximo de utilidad', 'number'),
    f('fuente_dato', 'Fuente del dato'),
    f('evidencia_requerida', 'Evidencia requerida', 'boolean'),
    f('aplica', 'Aplica', 'boolean'),
    f('observaciones', 'Observaciones', 'textarea'),
  ],
  [CRITERIO_LEVELS.DP]: [
    f('nombre_dp', 'Nombre del DP', 'text', { required: true }),
    f('codigo', 'Código'),
    f('descripcion_tecnica', 'Descripción técnica', 'textarea'),
    {
      name: 'tipo_dato',
      label: 'Tipo de dato',
      type: 'select',
      options: TIPO_DATO_OPTS,
    },
    f('unidad', 'Unidad'),
    f('valor_umbral', 'Valor umbral', 'number'),
    f('valor_meta', 'Valor meta', 'number'),
    {
      name: 'sentido_mejora',
      label: 'Sentido de mejora',
      type: 'select',
      options: SENTIDO_MEJORA_OPTS,
    },
    f('peso', 'Peso dentro del MOP (%)', 'number', { step: 0.01, min: 0, max: 100 }),
    f('fuente_informacion', 'Fuente de información'),
    f('requiere_evidencia', 'Requiere evidencia', 'boolean'),
    f('tipo_evidencia', 'Tipo de evidencia'),
    f('observaciones', 'Observaciones', 'textarea'),
  ],
};

export const VOP_FORM_SCHEMA = [
  f('valor_real_ofertado', 'Valor real ofertado', 'number'),
  f('unidad', 'Unidad'),
  f('funcion_utilidad_aplicada', 'Función de utilidad aplicada'),
  f('valor_umbral', 'Valor umbral', 'number'),
  f('valor_meta', 'Valor meta', 'number'),
  f('vop_calculado', 'VOP calculado', 'number'),
  f('cumplimiento_minimo', 'Cumplimiento mínimo', 'boolean'),
  f('evidencia', 'Evidencia', 'textarea'),
  f('observaciones', 'Observaciones', 'textarea'),
];

const FIELDS_IN_UTILIDAD_BLOCK = new Set([
  'valor_umbral',
  'valor_meta',
  'unidad',
  'unidad_medida',
  'valor_minimo_utilidad',
  'valor_maximo_utilidad',
]);

export function getSchemaForLevel(level, item = null, formData = null, { tipoOptions } = {}) {
  const schema = NODE_FORM_SCHEMAS[level] || [];
  let filtered = schema;
  if (level === CRITERIO_LEVELS.MOP && isTerminalCriterioNode(level, item)) {
    filtered = filtered.filter((f) => f.name !== 'tipo_criterio');
  }
  if (
    (level === CRITERIO_LEVELS.OMOE && isTerminalCriterioNode(level, item))
    || isTerminalCriterioNode(level, item)
    || (formData && showUtilidadFields(level, item, formData))
  ) {
    filtered = filtered.filter((f) => !FIELDS_IN_UTILIDAD_BLOCK.has(f.name));
  }
  if (level === CRITERIO_LEVELS.OMOE && tipoOptions?.length) {
    filtered = filtered.map((f) => (
      f.name === 'rama_evaluacion' ? { ...f, options: tipoOptions } : f
    ));
  }
  return filtered;
}

export function buildDefaultFormValues(level, item = null, { dimensionRama = null, parentNode = null } = {}) {
  const esNodoEvaluable = level === CRITERIO_LEVELS.NODO_ARBOL
    ? (item
      ? !(item.hijos?.length) && Boolean(
        item.tipo_criterio
          || item.familia_funciones
          || item.modo_evaluacion === 'incertidumbre',
      )
      : false)
    : level === CRITERIO_LEVELS.OMOE
      ? (item
        ? !(item.nodos?.length) && Boolean(item.tipo_criterio || item.familia_funciones)
        : false)
      : false;
  const provisional = { es_nodo_evaluable: esNodoEvaluable };
  const schema = getSchemaForLevel(level, item, provisional);
  const values = { es_nodo_evaluable: esNodoEvaluable };
  schema.forEach((field) => {
    const v = item?.[field.name];
    if (field.type === 'boolean') {
      if (field.name === 'aplica') {
        values[field.name] = item ? (v ?? true) : true;
      } else {
        values[field.name] = v ?? false;
      }
    } else if (field.type === 'number') {
      values[field.name] = v != null && v !== '' ? String(v) : '';
    } else if (field.name === 'rama_evaluacion') {
      const rama = item ? (v ?? 'omoe') : 'omoe';
      values[field.name] = rama === 'auto' ? 'omoe' : rama;
    } else {
      values[field.name] = v ?? '';
    }
  });
  const utilLevels = [
    CRITERIO_LEVELS.OMOE,
    CRITERIO_LEVELS.NODO_ARBOL,
    CRITERIO_LEVELS.GRUPO_AFINIDAD,
    CRITERIO_LEVELS.MOP,
    CRITERIO_LEVELS.DP,
  ];
  if (utilLevels.includes(level) && showUtilidadFields(level, item, values)) {
    const preset = !item && dimensionRama ? RAMA_MOP_PRESETS[dimensionRama] : null;
    const tipoInicial =
      item?.tipo_criterio ||
      item?.tipo_mop ||
      preset?.tipo_mop ||
      parentNode?.tipo_criterio ||
      parentNode?.tipo_mop ||
      defaultMopCriterioFields().tipo_criterio;
    const familiaInicial =
      item?.familia_funciones ||
      preset?.familia_funciones ||
      '';
    const params = { ...(item?.parametros_funcion || {}) };
    if (item?.valor_umbral != null && params.L == null) {
      params.L = String(item.valor_umbral);
    }
    if (item?.valor_meta != null && params.U == null) {
      params.U = String(item.valor_meta);
    }
    const normalized = normalizeMopCriterioFields(tipoInicial, familiaInicial, params);
    values.tipo_criterio = normalized.tipo_criterio;
    values.familia_funciones = normalized.familia_funciones;
    values.parametros_funcion = normalized.parametros_funcion;
    if (preset?.sentido_mejora) {
      values.sentido_mejora = preset.sentido_mejora;
    } else if (item?.sentido_mejora) {
      values.sentido_mejora = item.sentido_mejora;
    }
  } else if (level === CRITERIO_LEVELS.NODO_ARBOL || level === CRITERIO_LEVELS.OMOE) {
    values.tipo_criterio = '';
    values.familia_funciones = '';
    values.parametros_funcion = {};
  }
  if (level === CRITERIO_LEVELS.NODO_ARBOL || level === CRITERIO_LEVELS.OMOE) {
    values.modo_evaluacion = item?.modo_evaluacion || 'certeza';
    values.consecuencia_descripciones = item?.consecuencia_descripciones || {};
  }
  if (level === CRITERIO_LEVELS.OMOE) {
    Object.assign(values, defaultCalculationFormState(item));
    const ramaDefaults = defaultsForRama(values.rama_evaluacion || 'omoe');
    values.escenario_agregacion = item?.escenario_agregacion || ramaDefaults.escenario_agregacion;
    values.modo_valor_terminal = item?.modo_valor_terminal || ramaDefaults.modo_valor_terminal;
  }
  return values;
}

export function buildPayloadFromForm(level, formData, item = null) {
  const schema = getSchemaForLevel(level, item, formData);
  const payload = {};
  schema.forEach((field) => {
    let val = formData[field.name];
    if (field.type === 'boolean') {
      if (field.name === 'aplica') {
        payload[field.name] = val !== false && val !== 'false';
      } else {
        payload[field.name] = Boolean(val);
      }
    } else if (field.type === 'number') {
      if (val === '' || val == null) {
        if (field.name !== 'peso') {
          payload[field.name] = null;
        }
      } else {
        payload[field.name] = Number(val);
      }
    } else {
      payload[field.name] = val ?? '';
    }
  });

  const utilidadActiva = showUtilidadFields(level, item, formData);

  if (utilidadActiva) {
    const normalized = normalizeMopCriterioFields(
      formData.tipo_criterio || formData.tipo_mop || '',
      formData.familia_funciones || '',
      formData.parametros_funcion || {},
    );
    payload.tipo_criterio = normalized.tipo_criterio;
    payload.familia_funciones = normalized.familia_funciones;
    payload.parametros_funcion = normalized.parametros_funcion;
    if (level === CRITERIO_LEVELS.NODO_ARBOL || level === CRITERIO_LEVELS.OMOE) {
      syncUmbralMetaFromParams(payload);
    }
    if (level === CRITERIO_LEVELS.GRUPO_AFINIDAD || level === CRITERIO_LEVELS.MOP) {
      payload.tipo_mop = payload.tipo_criterio;
    }
  } else if (level === CRITERIO_LEVELS.NODO_ARBOL || level === CRITERIO_LEVELS.OMOE) {
    payload.tipo_criterio = '';
    payload.familia_funciones = '';
    payload.parametros_funcion = {};
  } else if (
    level === CRITERIO_LEVELS.GRUPO_AFINIDAD
    || level === CRITERIO_LEVELS.MOP
  ) {
    payload.tipo_criterio = formData.tipo_criterio || formData.tipo_mop || '';
    payload.familia_funciones = formData.familia_funciones || '';
    payload.parametros_funcion = formData.parametros_funcion || {};
    if (level === CRITERIO_LEVELS.GRUPO_AFINIDAD || level === CRITERIO_LEVELS.MOP) {
      payload.tipo_mop = payload.tipo_criterio;
    }
    if (level === CRITERIO_LEVELS.MOP) {
      syncUmbralMetaFromParams(payload);
    }
  }

  if (level === CRITERIO_LEVELS.DP) {
    payload.familia_funciones = formData.familia_funciones || '';
    payload.parametros_funcion = formData.parametros_funcion || {};
    syncUmbralMetaFromParams(payload);
  }
  if (level === CRITERIO_LEVELS.NODO_ARBOL || level === CRITERIO_LEVELS.OMOE) {
    const modo = utilidadActiva ? (formData.modo_evaluacion || 'certeza') : 'certeza';
    payload.modo_evaluacion = modo;
    if (modo === 'incertidumbre') {
      payload.tipo_criterio = '';
      payload.familia_funciones = '';
      payload.parametros_funcion = {};
      payload.consecuencia_descripciones = cleanConsecuenciaDescripciones(
        formData.consecuencia_descripciones,
      );
    } else {
      payload.consecuencia_descripciones = {};
    }
  }
  if (level === CRITERIO_LEVELS.OMOE) {
    Object.assign(payload, buildCalculationPayload(formData));
    payload.escenario_agregacion = formData.escenario_agregacion || defaultsForRama(formData.rama_evaluacion).escenario_agregacion;
    payload.modo_valor_terminal = formData.modo_valor_terminal || defaultsForRama(formData.rama_evaluacion).modo_valor_terminal;
    delete payload.orden;
  }
  return payload;
}

function cleanConsecuenciaDescripciones(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  Object.entries(raw).forEach(([key, value]) => {
    const k = String(key).trim();
    if (!k) return;
    out[k] = value == null ? '' : String(value).trim();
  });
  return out;
}

function syncUmbralMetaFromParams(payload) {
  const p = payload.parametros_funcion || {};
  if (p.L !== undefined && p.L !== '') payload.valor_umbral = Number(p.L);
  if (p.U !== undefined && p.U !== '') payload.valor_meta = Number(p.U);
}

export function validateUtilidadParams(familia, parametros = {}) {
  const specs = FAMILIA_PARAM_SPECS[familia] || [];
  const errors = [];
  specs.forEach((spec) => {
    if (!spec.required) return;
    const val = parametros[spec.key];
    if (val === '' || val == null) {
      errors.push(`Completa el parámetro ${spec.label}.`);
    }
  });
  return errors;
}

/** Suma pesos en centésimas para evitar 99.96 por float (0.1 + 0.2). */
export function parsePesoPercent(value) {
  if (value === '' || value == null) return 0;
  const n = Number(String(value).replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

export function sumPesosPercent(values) {
  const cents = values.reduce((acc, v) => {
    const n = parsePesoPercent(v);
    return acc + Math.round(n * 100);
  }, 0);
  return cents / 100;
}

export function siblingPesoResumen(siblings, item, formPeso) {
  const activos = (siblings || []).filter((s) => s.aplica !== false);
  if (!activos.length) return null;
  const otherValues = activos
    .filter((s) => !item || String(s.id) !== String(item.id))
    .map((s) => s.peso);
  const mine = formPeso === '' || formPeso == null ? 0 : formPeso;
  const total = sumPesosPercent([...otherValues, mine]);
  const mineNum = parsePesoPercent(mine);
  const nearFull = Math.abs(total - 100) < 0.06;
  const pesoOk = mineNum >= -0.0001 && mineNum <= 100.0001;
  const totalOk = total >= -0.0001 && total <= 100.05;
  return {
    total,
    ok: pesoOk && totalOk,
    nearFull,
    count: activos.length + (item ? 0 : 1),
  };
}

export function validateNodeForm(level, formData, item = null, { siblings = [] } = {}) {
  const errors = [];
  const schema = getSchemaForLevel(level, item, formData);

  schema.forEach((field) => {
    if (!field.required) return;
    const val = formData[field.name];
    if (field.type === 'boolean') return;
    if (val == null || String(val).trim() === '') {
      errors.push(`${field.label} es obligatorio.`);
    }
  });

  const pesoVal = formData.peso;
  if (pesoVal !== '' && pesoVal != null) {
    const pesoNum = parsePesoPercent(pesoVal);
    if (Number.isNaN(pesoNum) || pesoNum < 0 || pesoNum > 100) {
      errors.push('El peso debe estar entre 0 y 100 %.');
    } else if (siblings.length > 0) {
      const activos = siblings.filter((s) => s.aplica !== false);
      const otherValues = activos
        .filter((s) => !item || String(s.id) !== String(item.id))
        .map((s) => s.peso);
      const total = sumPesosPercent([...otherValues, pesoNum]);
      if (total < -0.05) {
        errors.push('Los pesos entre hermanos no pueden ser negativos.');
      } else if (total > 100.05) {
        errors.push(
          `Los pesos entre hermanos no pueden superar 100 % (total: ${total.toFixed(2)} %).`,
        );
      }
    }
  }

  if (level === CRITERIO_LEVELS.NODO_ARBOL && !item?.hijos?.length && !item) {
    if (!formData.es_nodo_evaluable) {
      return errors;
    }
  }

  if (level === CRITERIO_LEVELS.OMOE && !item?.nodos?.length && !item) {
    if (!formData.es_nodo_evaluable) {
      return errors;
    }
  }

  const esRiesgoTerminal =
    (level === CRITERIO_LEVELS.NODO_ARBOL || level === CRITERIO_LEVELS.OMOE)
    && formData.modo_evaluacion === 'incertidumbre';

  if (showUtilidadFields(level, item, formData) && !esRiesgoTerminal) {
    const tipo = formData.tipo_criterio || formData.tipo_mop || '';
    const familia = formData.familia_funciones || '';
    const utilidadIniciada = Boolean(tipo || familia);
    if (utilidadIniciada) {
      if (!tipo) {
        errors.push('Selecciona el tipo de criterio.');
      }
      if (!familia) {
        errors.push('Selecciona la familia de funciones.');
      }
      if (tipo && familia) {
        const normalized = normalizeMopCriterioFields(tipo, familia, formData.parametros_funcion);
        if (normalized.familia_funciones !== familia) {
          errors.push('La función no corresponde al tipo de criterio. Elige una familia de la lista.');
        }
      }
      errors.push(...validateUtilidadParams(familia, formData.parametros_funcion));
    }
  }

  return errors;
}

export { showUtilidadFields } from './terminalUtils';
