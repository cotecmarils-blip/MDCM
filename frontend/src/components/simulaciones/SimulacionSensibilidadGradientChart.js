import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { useTheme } from '../../ThemeContext';

export default function SimulacionSensibilidadGradientChart({
  sweep,
  alternatives,
  dimension,
  metodoLabel,
  currentWeightPct,
  loading = false,
  plotBgColor = '#f7f7ef',
}) {
  const { isDark } = useTheme();

  const traces = useMemo(() => {
    if (!sweep?.length) return [];
    return (alternatives || []).map((alt) => ({
      type: 'scatter',
      mode: 'lines+markers',
      name: alt.name,
      x: sweep.map((s) => s.peso_dimension_pct),
      y: sweep.map((s) => s.scores?.[alt.name] ?? null),
      line: { color: alt.color, width: 2 },
      marker: { color: alt.color, size: 5 },
      hovertemplate: `${alt.name}<br>Peso: %{x:.1f}%<br>${metodoLabel}: %{y:.4f}<extra></extra>`,
    }));
  }, [sweep, alternatives, metodoLabel]);

  if (!traces.length) {
    if (loading) {
      return (
        <p className="text-xs text-gray-500 dark:text-gray-400 py-8 text-center">
          Calculando barrido de sensibilidad…
        </p>
      );
    }
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 py-8 text-center">
        Seleccione una dimensión para ver el barrido de sensibilidad.
      </p>
    );
  }

  return (
    <div className="space-y-2 relative">
      {loading && (
        <span className="absolute top-0 right-2 text-[10px] text-navy-600 dark:text-navy-400 z-10">
          Actualizando…
        </span>
      )}
      <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 px-1">
        Gradient — peso de «{dimension}»
      </p>
      <Plot
        data={traces}
        layout={{
          autosize: true,
          height: 340,
          margin: { l: 48, r: 24, t: 24, b: 48 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: plotBgColor,
          font: { color: isDark ? '#e5e7eb' : '#374151', size: 11 },
          xaxis: {
            title: `Peso de ${dimension} (%)`,
            range: [0, 100],
            gridcolor: isDark ? '#374151' : '#e5e7eb',
          },
          yaxis: {
            title: metodoLabel,
            gridcolor: isDark ? '#374151' : '#e5e7eb',
          },
          legend: { orientation: 'h', y: -0.28, font: { size: 9 } },
          shapes: currentWeightPct != null
            ? [{
                type: 'line',
                x0: currentWeightPct,
                x1: currentWeightPct,
                y0: 0,
                y1: 1,
                yref: 'paper',
                line: { color: '#dc2626', width: 2 },
              }]
            : [],
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%' }}
      />
    </div>
  );
}
