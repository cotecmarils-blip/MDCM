import React from 'react';
import { DEFAULT_PLOT_BG_COLOR } from './simulacionPlotBg';

/** Control compacto en línea para el color de fondo del área de trazado. */
function SimulacionPlotBgPicker({ plotBgColor, onChange }) {
  return (
    <label className="flex items-center gap-1.5 shrink-0 text-xs text-gray-500 dark:text-gray-400">
      <span className="font-medium text-gray-600 dark:text-gray-300">Fondo:</span>
      <input
        type="color"
        value={plotBgColor}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-gray-200 dark:border-navy-700 bg-white p-0.5"
        aria-label="Color de fondo del área de trazado de la gráfica"
        title="Color de fondo del área de trazado"
      />
      <span className="font-mono text-[11px] uppercase">{plotBgColor}</span>
      {plotBgColor !== DEFAULT_PLOT_BG_COLOR && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_PLOT_BG_COLOR)}
          className="text-[11px] text-navy-700 dark:text-navy-300 hover:underline"
        >
          Restaurar
        </button>
      )}
    </label>
  );
}

export default SimulacionPlotBgPicker;
