import React, { useMemo } from 'react';
import { validatePesosDimensionesPercent } from '../../utils/pesoUtils';
import MetodoInfoDropdown from './MetodoInfoDropdown';
import { NORMALIZATION_METHOD_DOCS, WEIGHT_METHOD_DOCS } from './simulacionMethodDocs';
import SimulacionNombreField from './SimulacionNombreField';
import SimulacionProcesoPreview from './SimulacionProcesoPreview';
import SimulacionWizardStepper from './SimulacionWizardStepper';
import ParetoEpsilonField from './ParetoEpsilonField';
import { parseParetoEpsilonInput } from './paretoEpsilonUtils';
import {
  WIZARD_STEPS,
  WIZARD_PIPELINE_FOCUS,
  buildConfigSummary,
  dimensionesSeleccionadas,
  validateWizardStep,
} from './simulacionWizardSteps';

const PESO_INPUT_CLASS =
  'w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-navy-950 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/30 disabled:opacity-50';

function StepHeader({ step }) {
  return (
    <div className="mb-5 wizard-step-enter">
      <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{step.title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{step.subtitle}</p>
    </div>
  );
}

function ChoiceCard({ selected, onClick, disabled, title, description, icon }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
        selected
          ? 'border-navy-500 bg-navy-500/8 shadow-sm shadow-navy-500/10'
          : 'border-gray-200 dark:border-gray-700/60 hover:border-navy-400/50 hover:bg-navy-500/[0.03]'
      } disabled:opacity-50`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg ${
            selected
              ? 'bg-navy-600 text-white'
              : 'bg-gray-100 dark:bg-navy-900 text-gray-500'
          }`}
        >
          {icon}
        </span>
        <div>
          <p className="font-semibold text-gray-800 dark:text-gray-100">{title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
        </div>
      </div>
    </button>
  );
}

function SimulacionWizard({
  proyectoId,
  opcionesMeta,
  calcConfig,
  onChange,
  loading,
  stepError,
  onStepError,
  previewPayload,
  onExecute,
}) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const currentStep = WIZARD_STEPS[stepIndex];
  const dimensiones = opcionesMeta?.dimensiones || [];
  const dimensionesActivas = useMemo(
    () => dimensionesSeleccionadas(dimensiones, calcConfig),
    [dimensiones, calcConfig],
  );
  const focusPipelineStep = useMemo(
    () => (calcConfig ? WIZARD_PIPELINE_FOCUS[currentStep.id] : 'entrada'),
    [currentStep.id, calcConfig],
  );

  const soloMatriz = Boolean(calcConfig?.solo_matriz);

  const maxReachableIndex = useMemo(() => {
    if (!calcConfig || !opcionesMeta) return 0;
    if (calcConfig.solo_matriz) return 0;
    let max = 0;
    for (let i = 0; i < WIZARD_STEPS.length - 1; i += 1) {
      const v = validateWizardStep(WIZARD_STEPS[i].id, calcConfig, opcionesMeta);
      if (!v.ok) break;
      max = i + 1;
    }
    return max;
  }, [calcConfig, opcionesMeta]);

  const showPesosUsuario = calcConfig?.metodo_pesos === 'user_defined_weights';

  const pesosDimensionResumen = useMemo(() => {
    if (!showPesosUsuario) return null;
    const pesosActivos = dimensionesActivas.map((dim) => {
      const idx = dimensiones.findIndex((d) => d.omoe_id === dim.omoe_id);
      return idx >= 0 ? (calcConfig?.pesos_usuario || [])[idx] : '';
    });
    return validatePesosDimensionesPercent(pesosActivos, dimensionesActivas.length);
  }, [showPesosUsuario, calcConfig?.pesos_usuario, dimensiones, dimensionesActivas]);

  if (!opcionesMeta || !calcConfig) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
        Cargando opciones de cálculo…
      </p>
    );
  }

  const normMethods = opcionesMeta.normalization_methods || [];
  const weightMethods = opcionesMeta.weight_methods || [];
  const madmMethods = opcionesMeta.madm_methods || [];

  const getDirection = (omoeId) =>
    calcConfig.direcciones?.[omoeId] || calcConfig.direcciones?.[String(omoeId)] || 'max';

  const setDirection = (omoeId, direction) => {
    onChange({
      ...calcConfig,
      direcciones: { ...(calcConfig.direcciones || {}), [omoeId]: direction },
    });
  };

  const toggleDimension = (nombre) => {
    const current = calcConfig.dimensiones_normalizar || [];
    const next = current.includes(nombre)
      ? current.filter((d) => d !== nombre)
      : [...current, nombre];
    onChange({ ...calcConfig, dimensiones_normalizar: next });
  };

  const isDimensionSelected = (nombre) =>
    (calcConfig.dimensiones_normalizar || []).includes(nombre);

  const setPesoUsuario = (index, value) => {
    const pesos = [...(calcConfig.pesos_usuario || dimensiones.map(() => ''))];
    while (pesos.length < dimensiones.length) pesos.push('');
    pesos[index] = value;
    onChange({ ...calcConfig, pesos_usuario: pesos });
  };

  const setSoloMatriz = (checked) => {
    onStepError(null);
    if (checked) setStepIndex(0);
    onChange({ ...calcConfig, solo_matriz: checked });
  };

  const goNext = () => {
    const v = validateWizardStep(currentStep.id, calcConfig, opcionesMeta);
    if (!v.ok) {
      onStepError(v.message);
      return;
    }
    onStepError(null);
    if (stepIndex < WIZARD_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    }
  };

  const goBack = () => {
    onStepError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const goToStep = (idx) => {
    onStepError(null);
    setStepIndex(idx);
  };

  const summary = buildConfigSummary(calcConfig, opcionesMeta);
  const isResumen = currentStep.id === 'resumen';
  const paretoEpsilonError = !parseParetoEpsilonInput(calcConfig?.pareto_epsilon).ok
    ? parseParetoEpsilonInput(calcConfig?.pareto_epsilon).message
    : null;

  return (
    <div className="sim-wizard">
      <SimulacionWizardStepper
        currentIndex={stepIndex}
        maxReachableIndex={maxReachableIndex}
        onStepClick={goToStep}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Izquierda: un solo paso del formulario */}
        <div className="min-w-0 order-2 lg:order-1">
          {stepError && (
            <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 wizard-step-enter">
              {stepError}
            </div>
          )}

          <div
            key={currentStep.id}
            className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white/80 dark:bg-navy-950/40 p-5 sm:p-6 wizard-step-enter"
          >
            <StepHeader step={currentStep} />

            {currentStep.id === 'nombre' && (
              <>
                <SimulacionNombreField
                  value={calcConfig.nombre_calculo || ''}
                  onChange={(nombre_calculo) => onChange({ ...calcConfig, nombre_calculo })}
                  disabled={loading}
                  error={stepError && /nombre/i.test(stepError) ? stepError : null}
                  autoFocus
                  hideStepBadge
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                  A la derecha verá la matriz de utilidades de su proyecto (paso 1 del pipeline).
                </p>
                <label
                  className={`mt-4 flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    soloMatriz
                      ? 'border-navy-500 bg-navy-500/5'
                      : 'border-gray-200 dark:border-gray-700/60 hover:border-navy-400/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={soloMatriz}
                    disabled={loading}
                    onChange={(e) => setSoloMatriz(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 shrink-0"
                  />
                  <span>
                    <span className="font-medium text-sm text-gray-800 dark:text-gray-100">
                      Comparación solo con matriz de utilidades
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      No continúa con MIN/MAX, Pareto, normalización, pesos ni ranking MADM:
                      guarda únicamente la matriz de utilidades por dimensión.
                    </span>
                  </span>
                </label>
                {soloMatriz && dimensiones.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Dimensiones a incluir
                    </p>
                    {dimensiones.map((dim) => (
                      <label
                        key={dim.omoe_id}
                        className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg border border-gray-200 dark:border-gray-700/60"
                      >
                        <input
                          type="checkbox"
                          checked={isDimensionSelected(dim.nombre)}
                          disabled={loading}
                          onChange={() => toggleDimension(dim.nombre)}
                          className="rounded border-gray-300 shrink-0"
                        />
                        <span className="font-medium">{dim.nombre}</span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}

            {currentStep.id === 'direcciones' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Marque las dimensiones que participarán en Pareto, normalización, pesos y ranking.
                  Para cada una indique si mayor o menor valor es mejor.
                </p>
                {dimensiones.map((dim) => {
                  const selected = isDimensionSelected(dim.nombre);
                  return (
                  <div
                    key={dim.omoe_id}
                    className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border ${
                      selected
                        ? 'border-navy-500/40 bg-navy-500/[0.04] border-gray-200 dark:border-gray-700/60'
                        : 'border-gray-200 dark:border-gray-700/60 bg-gray-50/30 dark:bg-navy-900/20 opacity-75'
                    }`}
                  >
                    <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={loading}
                        onChange={() => toggleDimension(dim.nombre)}
                        className="rounded border-gray-300 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{dim.nombre}</p>
                        <p className="text-xs text-gray-400">{dim.rama_evaluacion}</p>
                      </div>
                    </label>
                    <select
                      value={getDirection(dim.omoe_id) || dim.direction || 'max'}
                      disabled={loading || !selected}
                      onChange={(e) => setDirection(dim.omoe_id, e.target.value)}
                      className="form-select text-sm w-full sm:w-auto min-w-[12rem] shrink-0 disabled:opacity-50"
                      aria-label={`Tipo ${dim.nombre}`}
                    >
                      <option value="max">Mayor es mejor (MAX)</option>
                      <option value="min">Menor es mejor (MIN)</option>
                    </select>
                  </div>
                  );
                })}
              </div>
            )}

            {currentStep.id === 'pareto' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ya definió MIN/MAX en el paso anterior. Al elegir, el filtro Pareto se calcula
                  en vivo a la derecha.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ChoiceCard
                    selected={calcConfig.aplicar_pareto === true}
                    disabled={loading}
                    onClick={() => onChange({ ...calcConfig, aplicar_pareto: true })}
                    icon="◈"
                    title="Sí, aplicar Pareto"
                    description="Conserva solo alternativas no dominadas (notebook 01)."
                  />
                  <ChoiceCard
                    selected={calcConfig.aplicar_pareto === false}
                    disabled={loading}
                    onClick={() => onChange({ ...calcConfig, aplicar_pareto: false })}
                    icon="◇"
                    title="No aplicar"
                    description="Todas las alternativas continúan."
                  />
                </div>
                {calcConfig.aplicar_pareto && (
                  <ParetoEpsilonField
                    value={calcConfig.pareto_epsilon}
                    onChange={(pareto_epsilon) => onChange({ ...calcConfig, pareto_epsilon })}
                    disabled={loading}
                    error={paretoEpsilonError}
                  />
                )}
              </div>
            )}

            {currentStep.id === 'normalizacion' && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Las dimensiones ya fueron elegidas en el paso anterior. Aquí solo define el
                  método de escala (recomendado para usuarios no expertos: vectorial direccional).
                </p>
                {dimensionesActivas.length > 0 && (
                  <p className="text-xs text-navy-600 dark:text-navy-400 rounded-lg bg-navy-500/[0.06] px-3 py-2">
                    Dimensiones en el cálculo:{' '}
                    <strong>{dimensionesActivas.map((d) => d.nombre).join(', ')}</strong>
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200 dark:border-gray-700/60">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    Método de normalización *
                  </p>
                  <MetodoInfoDropdown
                    methods={normMethods}
                    docsMap={NORMALIZATION_METHOD_DOCS}
                    panelTitle="Ecuaciones de normalización"
                    panelDescription="Seleccione un método para ver su fórmula y un ejemplo gráfico."
                    defaultMethod={calcConfig.normalizacion_metodo}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {normMethods.map((m) => (
                    <label
                      key={m.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                        calcConfig.normalizacion_metodo === m.value
                          ? 'border-navy-500 bg-navy-500/5'
                          : 'border-gray-200 dark:border-gray-700/60 hover:border-navy-400/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="normalizacion_metodo"
                        value={m.value}
                        checked={calcConfig.normalizacion_metodo === m.value}
                        disabled={loading}
                        onChange={() => onChange({ ...calcConfig, normalizacion_metodo: m.value })}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium">{m.label}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {m.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {currentStep.id === 'pesos' && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Los pesos por dimensión aparecen a la derecha al elegir el método.
                </p>
                <div className="flex items-center justify-end">
                  <MetodoInfoDropdown
                    methods={weightMethods}
                    docsMap={WEIGHT_METHOD_DOCS}
                    panelTitle="Ecuaciones de pesos"
                    panelDescription="Seleccione un método para ver su fórmula y un ejemplo gráfico."
                    defaultMethod={calcConfig.metodo_pesos}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {weightMethods.map((m) => (
                    <label
                      key={m.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                        calcConfig.metodo_pesos === m.value
                          ? 'border-navy-500 bg-navy-500/5'
                          : 'border-gray-200 dark:border-gray-700/60 hover:border-navy-400/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="metodo_pesos"
                        value={m.value}
                        checked={calcConfig.metodo_pesos === m.value}
                        disabled={loading}
                        onChange={() => onChange({ ...calcConfig, metodo_pesos: m.value })}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium">{m.label}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {m.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {showPesosUsuario && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700/60">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                      Pesos por dimensión (%)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {dimensionesActivas.map((dim) => {
                        const idx = dimensiones.findIndex((d) => d.omoe_id === dim.omoe_id);
                        return (
                        <div key={dim.omoe_id}>
                          <label className="text-xs text-gray-500">{dim.nombre}</label>
                          <div className="relative mt-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              disabled={loading}
                              value={(calcConfig.pesos_usuario || [])[idx] ?? ''}
                              onChange={(e) => setPesoUsuario(idx, e.target.value)}
                              className={`${PESO_INPUT_CLASS} pr-8`}
                              placeholder="33.33"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                              %
                            </span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    {pesosDimensionResumen && (
                      <p
                        className={`text-xs font-medium mt-2 ${
                          pesosDimensionResumen.ok
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        Suma: {pesosDimensionResumen.total.toFixed(2)} %
                        {pesosDimensionResumen.ok ? ' (válido)' : ' — deben sumar 100 %'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentStep.id === 'madm' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Por defecto se usa TOPSIS (recomendado). El ranking preliminar se calcula a la
                  derecha al elegir el método.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {madmMethods.map((m) => (
                    <label
                      key={m.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                        calcConfig.metodo_madm === m.value
                          ? 'border-navy-500 bg-navy-500/5'
                          : 'border-gray-200 dark:border-gray-700/60 hover:border-navy-400/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="metodo_madm"
                        value={m.value}
                        checked={calcConfig.metodo_madm === m.value}
                        disabled={loading}
                        onChange={() => onChange({ ...calcConfig, metodo_madm: m.value })}
                        className="mt-1"
                      />
                      <span className="font-medium">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {currentStep.id === 'resumen' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Revise su configuración y el pipeline completo a la derecha. Si todo es correcto,
                  guarde el cálculo en el historial.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {summary.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-gray-200 dark:border-gray-700/60 px-3 py-2 bg-gray-50/60 dark:bg-navy-900/30"
                    >
                      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                        {item.label}
                      </p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mt-0.5">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 mt-5">
            <button
              type="button"
              onClick={goBack}
              disabled={loading || stepIndex === 0}
              className="btn border-gray-200 dark:border-gray-700/60 text-sm disabled:opacity-40"
            >
              Anterior
            </button>
            <p className="text-xs text-gray-400">
              {soloMatriz ? 'Comparación con matriz' : `Paso ${stepIndex + 1} / ${WIZARD_STEPS.length}`}
            </p>
            {soloMatriz ? (
              <button
                type="button"
                onClick={onExecute}
                disabled={loading}
                className="btn btn-primary text-sm disabled:opacity-50"
              >
                {loading ? 'Guardando…' : 'Comparar con matriz'}
              </button>
            ) : isResumen ? (
              <button
                type="button"
                onClick={onExecute}
                disabled={loading}
                className="btn btn-primary text-sm disabled:opacity-50"
              >
                {loading ? 'Guardando…' : 'Guardar cálculo'}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={loading}
                className="btn btn-primary text-sm disabled:opacity-50"
              >
                Siguiente
              </button>
            )}
          </div>
        </div>

        {/* Derecha: cálculo en vivo — siempre visible */}
        <aside className="min-w-0 order-1 lg:order-2 lg:sticky lg:top-2">
          <SimulacionProcesoPreview
            proyectoId={proyectoId}
            previewPayload={previewPayload}
            calcConfig={calcConfig}
            dimCount={dimensionesActivas.length}
            focusStepId={focusPipelineStep}
            enabled
          />
        </aside>
      </div>
    </div>
  );
}

export default SimulacionWizard;
