import React from 'react';
import {
  ESCENARIO_AGREGACION_OPTIONS,
  MODO_VALOR_TERMINAL_OPTIONS,
  defaultsForRama,
  getEscenarioPesosHint,
  usesEscenarioPesos,
} from './escenarioAgregacionConstants';

const STATUS_STYLES = {
  recommended: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  advanced: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  experimental: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  basic: 'bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300',
};

function OptionCard({ selected, option, onSelect, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(option.value)}
      className={`text-left w-full rounded-lg border p-3 transition-all ${
        selected
          ? 'border-navy-500 bg-navy-500/5 ring-1 ring-navy-500/30'
          : 'border-gray-200 dark:border-gray-700/60 hover:border-navy-400/50'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{option.label}</span>
        {option.status && (
          <span
            className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
              STATUS_STYLES[option.statusTone] || STATUS_STYLES.basic
            }`}
          >
            {option.status}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
    </button>
  );
}

/**
 * Configuración de escenarios y modo de valor por dimensión (OMOE).
 */
function DimensionEvalConfigFields({
  ramaEvaluacion,
  tipoMeta = null,
  escenarioAgregacion,
  modoValorTerminal,
  onChange,
  disabled = false,
}) {
  const handleRamaHint = () => {
    if (disabled) return;
    const defs = defaultsForRama(ramaEvaluacion, tipoMeta);
    onChange({
      escenario_agregacion: defs.escenario_agregacion,
      modo_valor_terminal: defs.modo_valor_terminal,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Escenarios y valor terminal
          </h5>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xl">
            Define cómo se combinan las misiones/escenarios y si los nodos terminales usan
            curvas u(x) o valores brutos.
          </p>
        </div>
        {!disabled && (
          <button
            type="button"
            className="btn-sm btn-secondary text-xs shrink-0"
            onClick={handleRamaHint}
          >
            Sugerir según tipo ({ramaEvaluacion || 'omoe'})
          </button>
        )}
      </div>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Agregación de escenarios
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ESCENARIO_AGREGACION_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              option={opt}
              selected={escenarioAgregacion === opt.value}
              disabled={disabled}
              onSelect={(value) => onChange({ escenario_agregacion: value })}
            />
          ))}
        </div>
      </fieldset>

      {!usesEscenarioPesos(escenarioAgregacion) && (
        <p className="text-xs text-blue-800 dark:text-blue-200 rounded-md bg-blue-50/80 dark:bg-blue-900/20 px-3 py-2">
          {getEscenarioPesosHint(escenarioAgregacion)}
        </p>
      )}

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Valor en nodos terminales
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODO_VALOR_TERMINAL_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              option={opt}
              selected={modoValorTerminal === opt.value}
              disabled={disabled}
              onSelect={(value) => onChange({ modo_valor_terminal: value })}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export default DimensionEvalConfigFields;
