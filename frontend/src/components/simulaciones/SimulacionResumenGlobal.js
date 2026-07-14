import React, { useMemo, useState } from 'react';
import {
  buildEscenarioResumenRows,
  escenarioResumenLabel,
} from './simulacionEscenarioResumenUtils';

const MADM_LABELS = {
  topsis: 'TOPSIS',
  wsm: 'WSM',
  moora: 'MOORA',
  vikor: 'VIKOR',
  copras: 'COPRAS',
  aras: 'ARAS',
  codas: 'CODAS',
  edas: 'EDAS',
  mabac: 'MABAC',
  marcos: 'MARCOS',
  waspas: 'WASPAS',
  wpm: 'WPM',
};

function SimulacionResumenGlobal({ resultado }) {
  const [showMatriz, setShowMatriz] = useState(false);
  const alternativas = resultado?.alternativas || [];
  const activas = alternativas.filter((a) => !a.excluida_pareto);
  const metodoMadm = MADM_LABELS[resultado?.opciones_calculo?.metodo_madm]
    || resultado?.opciones_calculo?.metodo_madm
    || 'MADM';

  const norm = resultado?.normalizacion;
  const matrizNorm = norm?.normalized_matrix;
  const altNamesNorm = norm?.pareto_alternatives || [];
  const dimNames = norm?.dimensions || [];

  const escenarioRows = useMemo(
    () => buildEscenarioResumenRows(alternativas),
    [alternativas],
  );

  if (!activas.length) return null;

  const ganador = activas[0];
  const showEscenarioResumen = escenarioRows.length > 0;
  const escenariosGanador = escenarioRows.filter((r) => r.alternativaId === ganador.id);

  return (
    <div className="rounded-xl border border-navy-500/30 bg-gradient-to-br from-navy-500/5 to-transparent dark:from-navy-500/10 p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
          Resultado global
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
          Las columnas de dimensión de la tabla inferior son las{' '}
          <strong>utilidades del árbol</strong> (entrada). El ranking y la puntuación
          final salen del pipeline: Pareto → normalización → pesos →{' '}
          <strong>{metodoMadm}</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1 rounded-lg bg-white dark:bg-navy-900 border border-navy-500/20 px-4 py-3">
          <p className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">
            Mejor alternativa
          </p>
          <p className="text-base font-bold text-navy-700 dark:text-navy-200 mt-1 truncate">
            #{ganador.ranking} {ganador.nombre}
          </p>
          <p className="text-lg font-mono font-semibold text-navy-600 dark:text-navy-300 mt-0.5">
            {ganador.score_madm != null
              ? Number(ganador.score_madm).toFixed(4)
              : ganador.valor_global?.toFixed(4)}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">Puntuación {metodoMadm}</p>
          {escenariosGanador.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
              {escenariosGanador.map((row) => (
                <li key={`${row.omoeId}-${row.escenario}`}>
                  <span className="font-medium text-gray-600 dark:text-gray-300">{row.dimension}:</span>
                  {' '}
                  bajo «{row.escenario}»
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sm:col-span-2 rounded-lg bg-white dark:bg-navy-900 border border-gray-200 dark:border-gray-700/60 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-gray-400">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Alternativa</th>
                <th className="px-3 py-2 font-semibold">Puntuación global</th>
              </tr>
            </thead>
            <tbody>
              {activas.map((alt) => (
                <tr
                  key={alt.id}
                  className={`border-t border-gray-100 dark:border-gray-800/80 ${
                    alt.id === ganador.id ? 'bg-navy-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-bold text-navy-600">{alt.ranking}</td>
                  <td className="px-3 py-2 font-medium">{alt.nombre}</td>
                  <td className="px-3 py-2 font-mono font-semibold">
                    {alt.score_madm != null
                      ? Number(alt.score_madm).toFixed(4)
                      : alt.valor_global?.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {alternativas.some((a) => a.excluida_pareto) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Alternativas dominadas por Pareto no participan en el ranking global.
        </p>
      )}

      {showEscenarioResumen && (
        <div className="rounded-lg border border-blue-200/60 dark:border-blue-800/40 bg-white dark:bg-navy-900 overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800/80">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Escenario elegido por alternativa
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              En mínimo/máximo-mejor (Eq. 22) se toma el contexto más favorable; en peor caso
              (Eq. 23) el más adverso. Cada escenario se evalúa por separado.
            </p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-navy-900/60 text-left text-[10px] uppercase text-gray-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Alternativa</th>
                <th className="px-3 py-2 font-semibold">Dimensión</th>
                <th className="px-3 py-2 font-semibold">Modo</th>
                <th className="px-3 py-2 font-semibold">Escenario elegido</th>
                <th className="px-3 py-2 font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {escenarioRows.map((row) => (
                <tr
                  key={`${row.alternativaId}-${row.omoeId}`}
                  className={`border-t border-gray-100 dark:border-gray-800/80 ${
                    row.alternativaId === ganador.id ? 'bg-navy-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-medium">{row.alternativa}</td>
                  <td className="px-3 py-2">{row.dimension}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {escenarioResumenLabel(row.agregacion)}
                  </td>
                  <td className="px-3 py-2 font-semibold text-navy-700 dark:text-navy-300">
                    {row.escenario}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {row.valor != null ? Number(row.valor).toFixed(4) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matrizNorm?.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowMatriz((v) => !v)}
            className="text-xs font-medium text-navy-600 dark:text-navy-400 hover:underline"
          >
            {showMatriz ? 'Ocultar' : 'Ver'} matriz normalizada usada en el cálculo
          </button>
          {showMatriz && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 dark:bg-navy-900/60">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Alt.</th>
                    {dimNames.map((d) => (
                      <th key={d} className="px-2 py-1.5 text-left font-semibold text-gray-500">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrizNorm.map((row, i) => (
                    <tr key={altNamesNorm[i] || i} className="border-t border-gray-100 dark:border-gray-800/80">
                      <td className="px-2 py-1.5 font-medium truncate max-w-[8rem]">
                        {altNamesNorm[i] || `Alt. ${i + 1}`}
                      </td>
                      {row.map((val, j) => (
                        <td key={j} className="px-2 py-1.5 font-mono">
                          {Number(val).toFixed(4)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SimulacionResumenGlobal;
