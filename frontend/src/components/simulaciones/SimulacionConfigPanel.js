import React, { useMemo } from 'react';
import { validatePesosDimensionesPercent } from '../../utils/pesoUtils';
import MetodoInfoDropdown from './MetodoInfoDropdown';
import ParetoEpsilonField from './ParetoEpsilonField';
import { parseParetoEpsilonInput } from './paretoEpsilonUtils';
import { NORMALIZATION_METHOD_DOCS, WEIGHT_METHOD_DOCS } from './simulacionMethodDocs';

const PESO_INPUT_CLASS =
  'w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-navy-950 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/30 disabled:opacity-50';

function SimulacionConfigPanel({ opcionesMeta, config, onChange, disabled }) {
  const dimensiones = opcionesMeta?.dimensiones || [];
  const showPesosUsuario = config.metodo_pesos === 'user_defined_weights';

  const pesosDimensionResumen = useMemo(() => {
    if (!opcionesMeta || !showPesosUsuario) return null;
    return validatePesosDimensionesPercent(config.pesos_usuario, dimensiones.length);
  }, [opcionesMeta, showPesosUsuario, config.pesos_usuario, dimensiones.length]);

  if (!opcionesMeta) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
        Cargando opciones de cálculo…
      </p>
    );
  }

  const normMethods = opcionesMeta.normalization_methods || [];
  const weightMethods = opcionesMeta.weight_methods || [];
  const madmMethods = opcionesMeta.madm_methods || [];

  const getDirection = (omoeId) =>
    config.direcciones?.[omoeId] || config.direcciones?.[String(omoeId)] || 'max';

  const setDirection = (omoeId, direction) => {
    onChange({
      ...config,
      direcciones: { ...(config.direcciones || {}), [omoeId]: direction },
    });
  };

  const toggleDimension = (nombre) => {
    const current = config.dimensiones_normalizar || [];
    const next = current.includes(nombre)
      ? current.filter((d) => d !== nombre)
      : [...current, nombre];
    onChange({ ...config, dimensiones_normalizar: next });
  };

  const setPesoUsuario = (index, value) => {
    const pesos = [...(config.pesos_usuario || dimensiones.map(() => ''))];
    while (pesos.length < dimensiones.length) pesos.push('');
    pesos[index] = value;
    onChange({ ...config, pesos_usuario: pesos });
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-navy-800 text-xs font-bold text-gray-700 dark:text-gray-200"
            aria-hidden
          >
            2
          </span>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Opciones del cálculo
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Pareto opcional, normalización por dimensión, método de pesos y método MADM.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(config.aplicar_pareto)}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, aplicar_pareto: e.target.checked })}
          className="rounded border-gray-300"
        />
        <span>Aplicar filtro Pareto (solo alternativas no dominadas)</span>
      </label>

      {Boolean(config.aplicar_pareto) && (
        <ParetoEpsilonField
          value={config.pareto_epsilon}
          onChange={(pareto_epsilon) => onChange({ ...config, pareto_epsilon })}
          disabled={disabled}
          error={
            config.pareto_epsilon != null && !parseParetoEpsilonInput(config.pareto_epsilon).ok
              ? parseParetoEpsilonInput(config.pareto_epsilon).message
              : null
          }
          compact
        />
      )}

      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
          Dimensiones del cálculo y sentido (MIN / MAX) *
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Marque qué dimensiones participan en el cálculo y si mayor o menor valor es mejor.
        </p>
        <div className="space-y-2">
          {dimensiones.map((dim) => {
            const selected = (config.dimensiones_normalizar || []).includes(dim.nombre);
            return (
            <div
              key={dim.omoe_id}
              className={`flex flex-wrap items-center gap-3 p-2.5 rounded-lg border ${
                selected
                  ? 'border-navy-500/30 bg-white/60 dark:bg-navy-950/30'
                  : 'border-gray-200 dark:border-gray-700/60 opacity-75'
              }`}
            >
              <label className="flex items-center gap-2 text-sm cursor-pointer min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => toggleDimension(dim.nombre)}
                  className="rounded border-gray-300 shrink-0"
                />
                <span className="truncate font-medium">{dim.nombre}</span>
                <span className="text-xs text-gray-400 shrink-0">({dim.rama_evaluacion})</span>
              </label>
              <select
                value={getDirection(dim.omoe_id) || dim.direction || 'max'}
                disabled={disabled || !selected}
                onChange={(e) => setDirection(dim.omoe_id, e.target.value)}
                className="form-select text-sm w-full sm:w-auto min-w-[12rem] shrink-0 disabled:opacity-50"
                aria-label={`Tipo de dimensión ${dim.nombre}`}
              >
                <option value="max">Mayor es mejor (MAX)</option>
                <option value="min">Menor es mejor (MIN)</option>
              </select>
            </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Método de normalización *
          </p>
          <MetodoInfoDropdown
            methods={normMethods}
            docsMap={NORMALIZATION_METHOD_DOCS}
            panelTitle="Ecuaciones de normalización"
            panelDescription="Seleccione un método para ver su fórmula y un ejemplo gráfico."
            defaultMethod={config.normalizacion_metodo}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {normMethods.map((m) => (
            <label
              key={m.value}
              className={`flex items-start gap-2 p-2 rounded-lg border text-sm cursor-pointer ${
                config.normalizacion_metodo === m.value
                  ? 'border-navy-500 bg-navy-500/5'
                  : 'border-gray-200 dark:border-gray-700/60'
              }`}
            >
              <input
                type="radio"
                name="normalizacion_metodo"
                value={m.value}
                checked={config.normalizacion_metodo === m.value}
                disabled={disabled}
                onChange={() => onChange({ ...config, normalizacion_metodo: m.value })}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{m.label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Método de cálculo de pesos *
          </p>
          <MetodoInfoDropdown
            methods={weightMethods}
            docsMap={WEIGHT_METHOD_DOCS}
            panelTitle="Ecuaciones de pesos"
            panelDescription="Seleccione un método para ver su fórmula y un ejemplo gráfico."
            defaultMethod={config.metodo_pesos}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {weightMethods.map((m) => (
            <label
              key={m.value}
              className={`flex items-start gap-2 p-2 rounded-lg border text-sm cursor-pointer ${
                config.metodo_pesos === m.value
                  ? 'border-navy-500 bg-navy-500/5'
                  : 'border-gray-200 dark:border-gray-700/60'
              }`}
            >
              <input
                type="radio"
                name="metodo_pesos"
                value={m.value}
                checked={config.metodo_pesos === m.value}
                disabled={disabled}
                onChange={() => onChange({ ...config, metodo_pesos: m.value })}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{m.label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {showPesosUsuario && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Pesos por dimensión (%) *
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Indique un porcentaje para cada dimensión. La suma debe ser exactamente 100 %.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {dimensiones.map((dim, idx) => (
              <div key={dim.omoe_id}>
                <label className="text-xs text-gray-500 dark:text-gray-400">{dim.nombre}</label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    disabled={disabled}
                    value={(config.pesos_usuario || [])[idx] ?? ''}
                    onChange={(e) => setPesoUsuario(idx, e.target.value)}
                    className={`${PESO_INPUT_CLASS} pr-8`}
                    placeholder="33.33"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    %
                  </span>
                </div>
              </div>
            ))}
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
              {pesosDimensionResumen.ok
                ? ' (válido)'
                : ` — ${pesosDimensionResumen.message || 'deben sumar 100 %'}`}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 block mb-1">
          Método MADM de ranking
        </label>
        <select
          value={config.metodo_madm || 'topsis'}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, metodo_madm: e.target.value })}
          className="form-select w-full max-w-md text-sm"
        >
          {madmMethods.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default SimulacionConfigPanel;
