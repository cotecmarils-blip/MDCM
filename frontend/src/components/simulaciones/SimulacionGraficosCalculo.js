import React, { useEffect, useMemo, useState } from 'react';
import TradeoffCharts from '../resultados/TradeoffCharts';
import SimulacionComparacionNivel from './SimulacionComparacionNivel';
import SimulacionDimensionFilter, {
  defaultSelectedDimIds,
} from './SimulacionDimensionFilter';
import {
  buildGraficosFromResultado,
  listDimensionesFromResultado,
} from './simulacionGraficosUtils';

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

function SimulacionGraficosCalculo({
  resultado,
  soloMatriz = false,
  plotBgColor = '#f7f7ef',
  onPlotBgColorChange,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const dimensiones = useMemo(
    () => listDimensionesFromResultado(resultado),
    [resultado],
  );
  const [selectedDimIds, setSelectedDimIds] = useState([]);
  const [vistaGrafico, setVistaGrafico] = useState('dimensiones');

  useEffect(() => {
    setSelectedDimIds(defaultSelectedDimIds(dimensiones));
  }, [resultado?.historial_id, dimensiones]);

  const effectiveDimIds = useMemo(() => {
    if (selectedDimIds.length) return selectedDimIds;
    return defaultSelectedDimIds(dimensiones);
  }, [selectedDimIds, dimensiones]);

  const chartData = useMemo(
    () => buildGraficosFromResultado(resultado, effectiveDimIds),
    [resultado, effectiveDimIds],
  );

  const visibleDimensiones = useMemo(() => {
    const selectedSet = new Set(effectiveDimIds);
    return dimensiones.filter((d) => selectedSet.has(d.id));
  }, [dimensiones, effectiveDimIds]);

  const sortedPuntos = useMemo(() => {
    const pts = [...chartData.puntos];
    pts.sort(
      (a, b) => (a.ranking ?? 999) - (b.ranking ?? 999) || b.overall - a.overall,
    );
    return pts;
  }, [chartData.puntos]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedId && sortedPuntos.some((p) => p.id === selectedId)) {
      return selectedId;
    }
    return sortedPuntos[0]?.id ?? null;
  }, [selectedId, sortedPuntos]);

  const selected = sortedPuntos.find((p) => p.id === effectiveSelectedId);
  const metodoMadm = soloMatriz
    ? 'Utilidad media'
    : MADM_LABELS[chartData.metodoMadm] || chartData.metodoMadm || 'MADM';
  const fmt = (val, digits = 3) => (val == null ? '—' : Number(val).toFixed(digits));

  const tieneAlternativas = (resultado?.alternativas || []).length > 0;

  if (!tieneAlternativas) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
        No hay alternativas con datos suficientes para graficar en este cálculo.
      </p>
    );
  }

  if (!sortedPuntos.length && vistaGrafico === 'dimensiones') {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
        No hay alternativas con datos suficientes para graficar por dimensión.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
          {vistaGrafico === 'dimensiones'
            ? 'Espacio de objetivos del cálculo (utilidades por dimensión).'
            : 'Compare alternativas en cualquier nivel del árbol (solo nodos hermanos).'}
          {chartData.aplicarPareto && vistaGrafico === 'dimensiones' && (
            <span className="text-amber-700 dark:text-amber-400">
              {' '}
              Solo alternativas del frente Pareto.
            </span>
          )}
        </p>
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700/60 p-0.5 bg-gray-50 dark:bg-navy-900/40 shrink-0">
          <button
            type="button"
            onClick={() => setVistaGrafico('dimensiones')}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
              vistaGrafico === 'dimensiones'
                ? 'bg-white dark:bg-navy-800 shadow-sm text-navy-700 dark:text-navy-200'
                : 'text-gray-500'
            }`}
          >
            Por dimensión
          </button>
          <button
            type="button"
            onClick={() => setVistaGrafico('nivel')}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
              vistaGrafico === 'nivel'
                ? 'bg-white dark:bg-navy-800 shadow-sm text-navy-700 dark:text-navy-200'
                : 'text-gray-500'
            }`}
          >
            Por nivel del árbol
          </button>
        </div>
      </div>

      {vistaGrafico === 'nivel' ? (
        <SimulacionComparacionNivel
          resultado={resultado}
          plotBgColor={plotBgColor}
          onPlotBgColorChange={onPlotBgColorChange}
        />
      ) : (
        <>
      <SimulacionDimensionFilter
        dimensiones={dimensiones}
        selectedIds={selectedDimIds}
        onChange={setSelectedDimIds}
      />

      <TradeoffCharts
        key={`${resultado?.historial_id || 'graficos'}-${effectiveDimIds.join(',')}-${plotBgColor}`}
        puntos={sortedPuntos}
        selectedId={effectiveSelectedId}
        onSelect={setSelectedId}
        chartDimensions={chartData.chartDimensions}
        madmLabel={metodoMadm}
        plotBgColor={plotBgColor}
        onPlotBgColorChange={onPlotBgColorChange}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-navy-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-navy-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Alt.</th>
                <th className="px-4 py-3 text-left font-semibold">Alternativa</th>
                {visibleDimensiones.map((dim) => (
                  <th key={dim.id} className="px-4 py-3 text-right font-semibold">
                    {dim.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPuntos.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`border-t border-gray-100 dark:border-navy-800 cursor-pointer ${
                    p.id === effectiveSelectedId
                      ? 'bg-navy-50 dark:bg-navy-800/60'
                      : 'hover:bg-gray-50 dark:hover:bg-navy-900'
                  }`}
                >
                  <td className="px-4 py-2 font-bold">{p.label}</td>
                  <td className="px-4 py-2">{p.nombre}</td>
                  {visibleDimensiones.map((dim) => (
                    <td key={dim.id} className="px-4 py-2 text-right tabular-nums">
                      {fmt(p.valores?.[dim.id], dim.rama === 'omoc' ? 2 : 3)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="rounded-lg border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 p-4">
            <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              {selected.label} — {selected.nombre}
            </h4>
            <dl className="space-y-2 text-sm">
              {visibleDimensiones.map((dim) => (
                <div key={dim.id} className="flex justify-between gap-2">
                  <dt className="text-gray-500 truncate">{dim.nombre}</dt>
                  <dd className="font-medium tabular-nums shrink-0">
                    {fmt(selected.valores?.[dim.id], 4)}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-100 dark:border-navy-800 pt-2 text-xs text-gray-400">
                {soloMatriz ? (
                  <>
                    <dt>Utilidad media</dt>
                    <dd className="tabular-nums">{fmt(selected.overall, 4)}</dd>
                  </>
                ) : (
                  <>
                    <dt>Ranking {metodoMadm}</dt>
                    <dd className="tabular-nums">#{selected.ranking ?? '—'}</dd>
                  </>
                )}
              </div>
            </dl>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

export default SimulacionGraficosCalculo;
