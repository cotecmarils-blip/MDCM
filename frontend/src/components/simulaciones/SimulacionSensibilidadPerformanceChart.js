import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { useTheme } from '../../ThemeContext';
import { buildPerformanceSeries, coerceWeightsMap } from './simulacionSensibilidadUtils';

export default function SimulacionSensibilidadPerformanceChart({
  criteria,
  weights,
  localPriorities,
  alternatives,
  scoresByAlt,
  onWeightChange,
  metodoLabel,
  plotBgColor = '#f7f7ef',
}) {
  const { isDark } = useTheme();

  const wmap = useMemo(() => coerceWeightsMap(weights, criteria), [weights, criteria]);

  const { labels, series, bars } = useMemo(
    () => buildPerformanceSeries(
      alternatives,
      criteria,
      wmap,
      localPriorities,
      scoresByAlt,
    ),
    [alternatives, criteria, wmap, localPriorities, scoresByAlt],
  );

  const barWeights = bars.map((b) => b.weight);
  const barY = labels.map((_, i) => (i < criteria.length ? barWeights[i] : null));
  const plotRevision = barWeights.map((w) => w.toFixed(4)).join(',');

  const plotData = [
    {
      type: 'bar',
      x: labels,
      y: barY,
      name: 'Peso dim.',
      marker: { color: isDark ? '#6b7280' : '#9ca3af' },
      yaxis: 'y',
      hovertemplate: '%{x}<br>Peso: %{y:.1%}<extra></extra>',
    },
    ...series.map((s) => ({
      type: 'scatter',
      mode: 'lines+markers',
      x: labels,
      y: s.values,
      name: s.name,
      line: { color: s.color, width: 2 },
      marker: { color: s.color, size: 6 },
      yaxis: 'y2',
      hovertemplate: '%{x}<br>%{fullData.name}: %{y:.4f}<extra></extra>',
    })),
  ];

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 px-1">
        Performance
      </p>
      <Plot
        data={plotData}
        layout={{
          autosize: true,
          height: 340,
          datarevision: plotRevision,
          uirevision: 'perf',
          margin: { l: 52, r: 52, t: 28, b: 72 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: plotBgColor,
          font: { color: isDark ? '#e5e7eb' : '#374151', size: 10 },
          xaxis: { tickangle: -30, gridcolor: isDark ? '#374151' : '#e5e7eb' },
          yaxis: {
            title: 'Crit %',
            range: [0, 1.05],
            side: 'left',
            gridcolor: isDark ? '#374151' : '#e5e7eb',
            tickformat: '.0%',
          },
          yaxis2: {
            title: `Alt % / ${metodoLabel}`,
            range: [0, 1.05],
            overlaying: 'y',
            side: 'right',
            gridcolor: 'transparent',
          },
          legend: { orientation: 'h', y: -0.35, font: { size: 9 } },
          bargap: 0.25,
          barmode: 'overlay',
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%' }}
        onClick={(event) => {
          if (!onWeightChange || !event.points?.length) return;
          const point = event.points[0];
          if (point.curveNumber !== 0) return;
          const idx = point.pointIndex;
          if (idx >= criteria.length) return;
          const criterion = criteria[idx];
          onWeightChange(criterion, Math.min(1, Math.max(0, (point.y ?? 0) + 0.05)));
        }}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-1">
        {criteria.map((criterion) => (
          <label key={criterion} className="flex flex-col gap-0.5 text-[11px]">
            <span className="text-gray-500 dark:text-gray-400 truncate" title={criterion}>
              {criterion}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={wmap[criterion] ?? 0}
              onChange={(e) => onWeightChange(criterion, parseFloat(e.target.value))}
              className="w-full accent-navy-700"
            />
            <span className="tabular-nums text-navy-700 dark:text-navy-300">
              {((wmap[criterion] ?? 0) * 100).toFixed(1)}%
            </span>
          </label>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 px-1">
        Barras grises = peso de cada dimensión (eje izq.). Líneas = valores normalizados y puntuación
        global (eje der.).
      </p>
    </div>
  );
}
