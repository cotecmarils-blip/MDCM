import React, { useEffect, useId, useState } from 'react';
import {
  DEFAULT_PARETO_EPSILON,
  DEFAULT_PARETO_EPSILON_DISPLAY,
  PARETO_EPSILON_VALIDATION_MSG,
  parseParetoEpsilonInput,
} from './paretoEpsilonUtils';

const INPUT_CLASS =
  'w-full max-w-xs text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-navy-950 text-gray-900 dark:text-gray-100 font-mono placeholder-gray-400 focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/30 disabled:opacity-50';

function isNonDefaultEpsilon(value) {
  const check = parseParetoEpsilonInput(value);
  if (!check.ok) return true;
  return check.value !== DEFAULT_PARETO_EPSILON;
}

function epsilonSummary(value) {
  const check = parseParetoEpsilonInput(value);
  if (!check.ok) return 'valor inválido';
  return String(check.value);
}

function GearIcon({ className = 'w-4 h-4' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ParetoEpsilonField({
  value,
  onChange,
  disabled = false,
  error = null,
  compact = false,
  collapsible = true,
}) {
  const panelId = useId();
  const displayValue = value ?? DEFAULT_PARETO_EPSILON_DISPLAY;
  const [open, setOpen] = useState(
    () => !collapsible || Boolean(error) || isNonDefaultEpsilon(value),
  );

  useEffect(() => {
    if (error || isNonDefaultEpsilon(value)) {
      setOpen(true);
    }
  }, [error, value]);

  const handleChange = (e) => {
    onChange(e.target.value);
  };

  const handleBlur = () => {
    const check = parseParetoEpsilonInput(displayValue);
    if (check.ok && displayValue.trim() === '') {
      onChange(DEFAULT_PARETO_EPSILON_DISPLAY);
    }
  };

  const summary = epsilonSummary(displayValue);
  const custom = isNonDefaultEpsilon(displayValue);

  const fieldBody = (
    <div className={compact ? 'space-y-1.5 pt-1' : 'space-y-2 pt-1'}>
      <label
        htmlFor="pareto-epsilon"
        className={`block font-semibold text-gray-700 dark:text-gray-300 ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        Tolerancia de comparación (epsilon)
      </label>
      <input
        id="pareto-epsilon"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={DEFAULT_PARETO_EPSILON_DISPLAY}
        className={`${INPUT_CLASS} ${error ? 'border-amber-500 ring-1 ring-amber-500/30' : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby="pareto-epsilon-help"
      />
      <p
        id="pareto-epsilon-help"
        className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-[11px]' : 'text-xs'}`}
      >
        Define la diferencia máxima permitida para considerar iguales dos valores durante las
        comparaciones Pareto. Un valor menor aumenta la precisión y reduce los empates; un valor
        mayor permite considerar como equivalentes valores muy cercanos.
      </p>
      {error && (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="alert">
          {error || PARETO_EPSILON_VALIDATION_MSG}
        </p>
      )}
    </div>
  );

  if (!collapsible) {
    return fieldBody;
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-gray-50/40 dark:bg-navy-900/20">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className={`text-gray-700 dark:text-gray-300 ${compact ? 'text-xs' : 'text-sm'}`}>
            <span className="font-medium">Tolerancia Pareto (epsilon)</span>
            <span className="text-gray-500 dark:text-gray-400 font-mono ml-1.5">{summary}</span>
            {!custom && (
              <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">· predeterminado</span>
            )}
          </p>
          {!open && error && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5" role="alert">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={panelId}
          title={open ? 'Ocultar opciones avanzadas Pareto' : 'Configurar tolerancia Pareto (epsilon)'}
          className={`shrink-0 inline-flex items-center justify-center rounded-lg border transition-colors ${
            compact ? 'h-8 w-8' : 'h-9 w-9'
          } ${
            open || custom || error
              ? 'border-navy-500/40 bg-navy-500/10 text-navy-700 dark:text-navy-300'
              : 'border-gray-200 dark:border-gray-700/60 bg-white dark:bg-navy-950 text-gray-500 hover:border-navy-400/50 hover:text-navy-600'
          } disabled:opacity-50`}
        >
          <GearIcon />
          <span className="sr-only">Configurar epsilon Pareto</span>
        </button>
      </div>
      {open && (
        <div
          id={panelId}
          className="px-3 pb-3 pt-0 border-t border-gray-200/80 dark:border-gray-700/50"
        >
          {fieldBody}
        </div>
      )}
    </div>
  );
}

export default ParetoEpsilonField;
