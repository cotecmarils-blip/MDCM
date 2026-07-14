import React from 'react';
import MathFormula from './MathFormula';
import UtilidadCurveChart from './UtilidadCurveChart';

function CheckboxIndicator({ selected }) {
  return (
    <span
      className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        selected
          ? 'border-navy-600 bg-navy-600 dark:border-navy-400 dark:bg-navy-500'
          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-navy-900'
      }`}
      aria-hidden
    >
      {selected && (
        <svg viewBox="0 0 12 12" className="h-2 w-2 text-white" fill="none">
          <path
            d="M2.5 6l2.5 2.5 4.5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function MopOptionCard({
  selected,
  label,
  latex,
  onSelect,
  disabled = false,
  name,
  curvePreview,
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      name={name}
      disabled={disabled}
      onClick={onSelect}
      className={`mop-option-card relative text-left rounded-lg border transition-all w-full p-2.5 pt-2 pl-8 ${
        selected
          ? 'border-navy-600 bg-navy-50/80 dark:border-navy-400 dark:bg-navy-800/50 ring-1 ring-navy-500/20'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-900/40 hover:border-navy-400/60 hover:bg-gray-50 dark:hover:bg-navy-900/70'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className="absolute top-2 left-2">
        <CheckboxIndicator selected={selected} />
      </span>

      <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 leading-tight mb-1">
        {label}
      </p>

      {curvePreview?.familia && (
        <UtilidadCurveChart
          familia={curvePreview.familia}
          params={curvePreview.params}
          tipoCriterio={curvePreview.tipoCriterio}
          compact
          showLabel={false}
          className="mb-1.5 rounded bg-white/60 dark:bg-navy-950/40 px-1 py-0.5"
        />
      )}

      {latex ? (
        <MathFormula latex={latex} displayMode className="mop-option-card-formula" />
      ) : (
        <p className="text-xs text-gray-400">—</p>
      )}
    </button>
  );
}

export default MopOptionCard;
