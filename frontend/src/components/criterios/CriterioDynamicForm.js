import React, { useEffect, useMemo, useState } from 'react';
import { tiposDimensionApi } from '../../api';
import { CRITERIO_LEVELS } from './constants';
import MopCriterioFields from './MopCriterioFields';
import TerminalEvaluacionFields from './TerminalEvaluacionFields';
import CalculationMethodSelector from './CalculationMethodSelector';
import DimensionEvalConfigFields from './DimensionEvalConfigFields';
import { getSchemaForLevel, showUtilidadFields, siblingPesoResumen } from './nodeFormSchemas';
import { defaultMopCriterioFields } from './mopCriterioOptions';
import { RAMA_MOP_PRESETS } from './ramaContext';
import { DIMENSION_RAMA_OPTIONS } from './ramaEvaluacionOptions';
import { defaultsForRama } from './escenarioAgregacionConstants';

const NAME_FIELDS = new Set([
  'nombre',
  'nombre_modelo',
  'nombre_mision',
  'nombre_grupo',
  'nombre_mop',
  'nombre_dp',
]);

const PRIORITY_FIELDS = new Set(['peso', 'justificacion_peso']);

const UTIL_SUPPORT_FIELDS = new Set(['tipo_dato', 'unidad', 'unidad_medida']);

const DEFERRED_FROM_SCHEMA = new Set([
  ...PRIORITY_FIELDS,
  ...NAME_FIELDS,
  'codigo',
  'tipo_criterio',
  'tipo_mop',
  'familia_funciones',
  'parametros_funcion',
  'valor_umbral',
  'valor_meta',
  'sentido_mejora',
  'valor_minimo_utilidad',
  'valor_maximo_utilidad',
  'tipo_dato',
  'unidad',
  'unidad_medida',
]);

function renderField(field, ctx) {
  const { level, formData, disabled, inputClass, handleInput } = ctx;
  const id = `criterio-${level}-${field.name}`;
  const val = formData[field.name];
  const isRequired = field.required && !disabled;

  if (field.type === 'textarea') {
    return (
      <div key={field.name}>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {field.label}
          {isRequired && ' *'}
        </label>
        <textarea
          id={id}
          name={field.name}
          value={val ?? ''}
          onChange={handleInput}
          rows={3}
          disabled={disabled}
          required={isRequired}
          className={`${inputClass} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        />
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <label
        key={field.name}
        className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
      >
        <input
          type="checkbox"
          name={field.name}
          checked={Boolean(val)}
          onChange={handleInput}
          disabled={disabled}
          className="rounded border-gray-300"
        />
        {field.label}
      </label>
    );
  }

  if (field.type === 'select') {
    const showEmpty = !field.required || !(field.options || []).some((o) => o.value === val);
    return (
      <div key={field.name}>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {field.label}
          {isRequired && ' *'}
        </label>
        <select
          id={id}
          name={field.name}
          value={val ?? ''}
          onChange={handleInput}
          disabled={disabled}
          required={isRequired}
          className={`${inputClass} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {showEmpty && <option value="">— Seleccionar —</option>}
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div key={field.name}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {field.label}
        {isRequired && ' *'}
      </label>
      <input
        id={id}
        type={field.type === 'number' ? 'number' : 'text'}
        name={field.name}
        value={val ?? ''}
        onChange={handleInput}
        disabled={disabled}
        required={isRequired}
        step={field.step}
        min={field.min}
        max={field.max}
        className={`${inputClass} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      />
    </div>
  );
}

function CriterioDynamicForm({
  level,
  formData,
  onChange,
  disabled = false,
  inputClass,
  parentLabel,
  item,
  dimensionRama,
  siblings = [],
  isCreate = false,
  proyectoId = null,
  omoeId = null,
  compact = false,
  omitPesoEvaluacion = false,
}) {
  const [tipoOptions, setTipoOptions] = useState(DIMENSION_RAMA_OPTIONS);
  const [tiposByCodigo, setTiposByCodigo] = useState({});

  useEffect(() => {
    let cancelled = false;
    tiposDimensionApi.list()
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        if (!items.length) return;
        setTipoOptions(items.map((t) => ({ value: t.codigo, label: t.nombre })));
        setTiposByCodigo(Object.fromEntries(items.map((t) => [t.codigo, t])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const schema = useMemo(
    () => getSchemaForLevel(level, item, formData, { tipoOptions }),
    [level, item, formData, tipoOptions],
  );
  const showUtilidad = showUtilidadFields(level, item, formData);
  // El modo (certeza/incertidumbre) y su configuración viven en la Información del
  // nodo terminal (OMOE u nodo del árbol) y aplican a todos los escenarios.
  const isTreeTerminalLevel =
    level === CRITERIO_LEVELS.NODO_ARBOL || level === CRITERIO_LEVELS.OMOE;
  const showTerminalEval =
    isTreeTerminalLevel && showUtilidad;
  const canToggleEvaluable =
    (level === CRITERIO_LEVELS.NODO_ARBOL && !item?.hijos?.length)
    || (level === CRITERIO_LEVELS.OMOE && !item?.nodos?.length);
  const evaluableEsDimension = level === CRITERIO_LEVELS.OMOE;
  const deferExpertFields = omitPesoEvaluacion || isCreate;
  const showExpertEvalToggle =
    deferExpertFields && !isCreate && canToggleEvaluable;

  const handleField = (name, value) => {
    if (name === 'rama_evaluacion' && level === CRITERIO_LEVELS.OMOE) {
      const defs = defaultsForRama(value, tiposByCodigo[value]);
      onChange({
        ...formData,
        [name]: value,
        escenario_agregacion: defs.escenario_agregacion,
        modo_valor_terminal: defs.modo_valor_terminal,
      });
      return;
    }
    onChange({ ...formData, [name]: value });
  };

  const handleInput = (e) => {
    const { name, value, type, checked } = e.target;
    handleField(name, type === 'checkbox' ? checked : value);
  };

  const handleEvaluableToggle = (checked) => {
    if (!checked) {
      onChange({
        ...formData,
        es_nodo_evaluable: false,
        tipo_criterio: '',
        familia_funciones: '',
        parametros_funcion: {},
      });
      return;
    }
    const preset = dimensionRama ? RAMA_MOP_PRESETS[dimensionRama] : null;
    const defaults = defaultMopCriterioFields();
    onChange({
      ...formData,
      es_nodo_evaluable: true,
      tipo_criterio: preset?.tipo_mop || defaults.tipo_criterio,
      familia_funciones: preset?.familia_funciones || defaults.familia_funciones,
      parametros_funcion: defaults.parametros_funcion,
      sentido_mejora: preset?.sentido_mejora || formData.sentido_mejora || '',
    });
  };

  const ctx = { level, formData, disabled, inputClass, handleInput };

  const prioritySchema = schema.filter((f) => PRIORITY_FIELDS.has(f.name));
  const nameSchema = schema.filter((f) => NAME_FIELDS.has(f.name) || f.name === 'codigo');
  const utilSupportSchema = showUtilidad
    ? schema.filter((f) => UTIL_SUPPORT_FIELDS.has(f.name))
    : [];
  const restSchema = schema.filter((f) => !DEFERRED_FROM_SCHEMA.has(f.name));

  const hasPesoSection =
    !deferExpertFields &&
    (prioritySchema.length > 0 || showUtilidad || canToggleEvaluable);

  const pesoResumen = siblingPesoResumen(siblings, item, formData.peso);

  const nameBlock = nameSchema.length > 0 && (
    <section className={compact ? 'space-y-2' : 'space-y-3'}>
      {!compact && (
        <h4 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">
          Identificación
        </h4>
      )}
      {nameSchema.map((field) => renderField(field, ctx))}
    </section>
  );

  const pesoBlock = hasPesoSection && (
    <section
      className={`rounded-xl border-2 border-navy-500/25 bg-gradient-to-b from-navy-500/[0.06] to-transparent ${
        compact ? 'p-3 space-y-2' : 'p-4 space-y-4'
      }`}
    >
      <div>
        <h4 className={`font-bold text-navy-700 dark:text-navy-300 ${compact ? 'text-xs' : 'text-sm'}`}>
          {evaluableEsDimension && !showUtilidad
            ? 'Evaluación directa (opcional)'
            : 'Peso y variables de evaluación'}
        </h4>
        {!compact && (!evaluableEsDimension || showUtilidad) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Lo más relevante para simulación: peso entre hermanos y constantes (L, U, k…).
            La variable <strong>x</strong> se ingresa en Evaluación.
          </p>
        )}
      </div>

      {prioritySchema.map((field) => renderField(field, ctx))}

      {isCreate && siblings.length > 0 && (
        <p className="text-xs text-navy-600 dark:text-navy-400">
          Al crear un hermano, los pesos del nivel se reparten en partes iguales (suma 100 %).
        </p>
      )}

      {!isCreate && pesoResumen && (
        <p
          className={`text-xs font-medium ${
            pesoResumen.ok
              ? 'text-green-700 dark:text-green-400'
              : 'text-amber-700 dark:text-amber-400'
          }`}
        >
          Suma de pesos en este nivel: {pesoResumen.total.toFixed(2)} %
          {pesoResumen.nearFull && pesoResumen.total >= 99.94
            ? ' (objetivo: 100 % entre hermanos)'
            : ''}
          {pesoResumen.ok
            ? ' (válido: entre 0 y 100 %)'
            : ' — cada peso debe estar entre 0 y 100 % y el total no puede superar 100 %'}
        </p>
      )}

      {canToggleEvaluable && !disabled && (
        <label className={`flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer rounded-lg border border-navy-500/20 bg-white/60 dark:bg-navy-900/40 ${compact ? 'p-2' : 'p-3'}`}>
          <input
            type="checkbox"
            checked={Boolean(formData.es_nodo_evaluable)}
            onChange={(e) => handleEvaluableToggle(e.target.checked)}
            className="mt-0.5 rounded border-gray-300"
          />
          <span>
            <span className="font-medium block">
              {evaluableEsDimension
                ? 'Dimensión evaluable sin hijos (opcional)'
                : 'Nodo evaluable (hoja)'}
            </span>
            {!compact && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {evaluableEsDimension
                  ? 'Déjelo desactivado si va a crear misiones, grupos o nodos en el árbol. Solo actívelo si la dimensión se evalúa directamente, sin estructura.'
                  : 'Actívelo para configurar ecuación y constantes en este nodo.'}
              </span>
            )}
          </span>
        </label>
      )}

      {showUtilidad && !isTreeTerminalLevel && (
        <MopCriterioFields
          tipoCriterio={formData.tipo_criterio || formData.tipo_mop || defaultMopCriterioFields().tipo_criterio}
          familiaFunciones={formData.familia_funciones || defaultMopCriterioFields().familia_funciones}
          parametrosFuncion={formData.parametros_funcion}
          onChange={(util) => {
            const next = { ...formData, ...util };
            const p = util.parametros_funcion || {};
            if (p.L !== undefined && p.L !== '') next.valor_umbral = p.L;
            if (p.U !== undefined && p.U !== '') next.valor_meta = p.U;
            onChange(next);
          }}
          disabled={disabled}
          inputClass={inputClass}
          compact={compact}
        />
      )}

      {utilSupportSchema.map((field) => renderField(field, ctx))}
    </section>
  );

  const terminalEvalBlock = showTerminalEval && (
    <TerminalEvaluacionFields
      modo={formData.modo_evaluacion || 'certeza'}
      tipoCriterio={formData.tipo_criterio || formData.tipo_mop}
      familiaFunciones={formData.familia_funciones}
      parametrosFuncion={formData.parametros_funcion}
      consecuenciaDescripciones={formData.consecuencia_descripciones}
      proyectoId={proyectoId}
      onChange={(patch) => onChange({ ...formData, ...patch })}
      disabled={disabled}
      inputClass={inputClass}
      compact={compact}
    />
  );

  const expertEvalToggleBlock = showExpertEvalToggle && (
    <section
      className={`rounded-xl border border-dashed border-navy-500/30 bg-navy-500/[0.04] ${
        compact ? 'p-3 space-y-2' : 'p-4 space-y-3'
      }`}
    >
      <div>
        <h4 className={`font-semibold text-navy-700 dark:text-navy-300 ${compact ? 'text-xs' : 'text-sm'}`}>
          Configuración avanzada (sesión con expertos)
        </h4>
        {!compact && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Las funciones de utilidad y los pesos no son obligatorias al crear la estructura.
            Actívelo cuando el equipo de expertos defina ecuaciones y constantes; los pesos se
            ajustan en <strong>Definición de escenarios</strong>.
          </p>
        )}
      </div>
      {!disabled && (
        <label className={`flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer rounded-lg border border-navy-500/20 bg-white/60 dark:bg-navy-900/40 ${compact ? 'p-2' : 'p-3'}`}>
          <input
            type="checkbox"
            checked={Boolean(formData.es_nodo_evaluable)}
            onChange={(e) => handleEvaluableToggle(e.target.checked)}
            className="mt-0.5 rounded border-gray-300"
          />
          <span>
            <span className="font-medium block">
              {evaluableEsDimension
                ? 'Dimensión evaluable sin hijos'
                : 'Configurar función de valor marginal'}
            </span>
            {!compact && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {evaluableEsDimension
                  ? 'Solo si la dimensión se evalúa directamente, sin nodos hijos.'
                  : 'Define tipo de criterio, familia de funciones y parámetros (L, U, k…).'}
              </span>
            )}
          </span>
        </label>
      )}
      {terminalEvalBlock}
    </section>
  );

  const createStructureHint = isCreate && isTreeTerminalLevel && (
    <p className="text-xs text-gray-500 dark:text-gray-400 rounded-lg bg-gray-50 dark:bg-navy-900/40 px-3 py-2">
      Solo se requiere el nombre para crear el nodo. Las funciones de utilidad y los pesos se
      configuran en sesiones posteriores con expertos.
    </p>
  );

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      {parentLabel && (
        <p className={`text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-navy-900/40 rounded-lg ${compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2'}`}>
          {parentLabel}
        </p>
      )}

      {compact ? (
        <>
          {createStructureHint}
          {nameBlock}
          {pesoBlock}
          {expertEvalToggleBlock}
          {!showExpertEvalToggle && terminalEvalBlock}
        </>
      ) : (
        <>
          {createStructureHint}
          {pesoBlock}
          {expertEvalToggleBlock}
          {!showExpertEvalToggle && terminalEvalBlock}
          {nameBlock}
        </>
      )}

      {level === CRITERIO_LEVELS.OMOE && (
        <details className="group rounded-xl border border-dashed border-gray-300 dark:border-gray-600/70 bg-gray-50/40 dark:bg-navy-900/20">
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 select-none">
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Configuración avanzada
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Agregación de escenarios, valor terminal y método de cálculo de la dimensión.
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-navy-600 dark:text-navy-300 group-open:hidden">
              Mostrar
            </span>
            <span className="shrink-0 text-xs font-medium text-navy-600 dark:text-navy-300 hidden group-open:inline">
              Ocultar
            </span>
          </summary>
          <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-200/80 dark:border-gray-700/60">
            <DimensionEvalConfigFields
              ramaEvaluacion={formData.rama_evaluacion}
              tipoMeta={tiposByCodigo[formData.rama_evaluacion]}
              escenarioAgregacion={formData.escenario_agregacion}
              modoValorTerminal={formData.modo_valor_terminal}
              disabled={disabled}
              onChange={(patch) => onChange({ ...formData, ...patch })}
            />
            <CalculationMethodSelector
              calculationMethod={formData.calculation_method}
              calculationConfig={formData.calculation_config}
              disabled={disabled}
              inputClass={inputClass}
              omoeId={omoeId}
              proyectoId={proyectoId}
              escenarioAgregacion={formData.escenario_agregacion}
              onChange={(calcFields) => onChange({ ...formData, ...calcFields })}
            />
          </div>
        </details>
      )}

      {restSchema.length > 0 && (
        <section className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700/60">
          <h4 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">
            Detalles adicionales
          </h4>
          {restSchema.map((field) => renderField(field, ctx))}
        </section>
      )}
    </div>
  );
}

export default CriterioDynamicForm;
