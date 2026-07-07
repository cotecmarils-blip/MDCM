import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { useTheme } from '../../ThemeContext';

function abbreviateLabel(text, max = 28) {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export default function SimulacionSensibilidadTornadoChart({
  payload,
  metodoLabel,
  loading,
  syncing = false,
  plotBgColor = '#f7f7ef',
}) {
  const { isDark } = useTheme();

  const plot = useMemo(() => {
    const bars = payload?.bars || [];
    const baseline = Number(payload?.baseline_score ?? 0);
    if (!bars.length) return null;

    const labels = bars.map((b) => abbreviateLabel(b.dimension));
    const leftWidths = bars.map((b) => {
      const pess = Number(b.pessimistic);
      return pess < baseline ? baseline - pess : 0;
    });
    const leftBases = bars.map((b) => Number(b.pessimistic));
    const rightWidths = bars.map((b) => {
      const opt = Number(b.optimistic);
      return opt > baseline ? opt - baseline : 0;
    });

    return {
      labels,
      baseline,
      leftWidths,
      leftBases,
      rightWidths,
      hoverLow: bars.map((b) => Number(b.score_at_weight_0).toFixed(4)),
      hoverHigh: bars.map((b) => Number(b.score_at_weight_1).toFixed(4)),
      swings: bars.map((b) => Number(b.swing).toFixed(4)),
    };
  }, [payload]);

  if (loading && !plot) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 py-10 text-center">
        Calculando diagrama de tornado…
      </p>
    );
  }

  if (!plot) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 py-10 text-center">
        No hay datos para el diagrama de tornado.
      </p>
    );
  }

  const gridColor = isDark ? '#374151' : '#e5e7eb';
  const fontColor = isDark ? '#e5e7eb' : '#374151';
  const height = Math.max(300, plot.labels.length * 46 + 100);

  return (
    <div className="space-y-2 relative">
      {syncing && (
        <span className="absolute top-0 right-2 text-[10px] text-navy-600 dark:text-navy-400 z-10">
          Sincronizando {metodoLabel}…
        </span>
      )}
      <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 px-1">
        Diagrama de tornado — «{payload.alternative}»
      </p>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 px-1 leading-relaxed">
        Cada barra muestra el rango del score {metodoLabel} al llevar el peso de esa dimensión
        de 0% a 100% (resto redistribuido desde los pesos actuales del panel).
        Línea roja = score con los pesos que tiene ahora ({plot.baseline.toFixed(4)}).
      </p>
      <Plot
        data={[
          {
            type: 'bar',
            orientation: 'h',
            name: 'Pesimista (peso 0%)',
            y: plot.labels,
            x: plot.leftWidths,
            base: plot.leftBases,
            marker: { color: isDark ? '#34d399' : '#16a34a' },
            hovertemplate: (
              '%{y}<br>Peso 0%: %{customdata[0]}<br>Peso 100%: %{customdata[1]}'
              + '<br>Amplitud: %{customdata[2]}<extra>Pesimista</extra>'
            ),
            customdata: plot.labels.map((_, i) => [
              plot.hoverLow[i],
              plot.hoverHigh[i],
              plot.swings[i],
            ]),
          },
          {
            type: 'bar',
            orientation: 'h',
            name: 'Optimista (peso 100%)',
            y: plot.labels,
            x: plot.rightWidths,
            base: plot.labels.map(() => plot.baseline),
            marker: { color: isDark ? '#60a5fa' : '#2563eb' },
            hovertemplate: (
              '%{y}<br>Peso 0%: %{customdata[0]}<br>Peso 100%: %{customdata[1]}'
              + '<br>Amplitud: %{customdata[2]}<extra>Optimista</extra>'
            ),
            customdata: plot.labels.map((_, i) => [
              plot.hoverLow[i],
              plot.hoverHigh[i],
              plot.swings[i],
            ]),
          },
        ]}
        layout={{
          autosize: true,
          height,
          datarevision: `${plot.baseline}-${plot.labels.join('|')}`,
          uirevision: 'tornado',
          barmode: 'overlay',
          margin: { l: 140, r: 32, t: 28, b: 48 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: plotBgColor,
          font: { color: fontColor, size: 11 },
          xaxis: {
            title: `Score ${metodoLabel}`,
            gridcolor: gridColor,
            zeroline: false,
          },
          yaxis: {
            autorange: 'reversed',
            gridcolor: gridColor,
          },
          legend: {
            orientation: 'h',
            y: 1.12,
            font: { size: 10, color: fontColor },
          },
          shapes: [{
            type: 'line',
            x0: plot.baseline,
            x1: plot.baseline,
            y0: -0.5,
            y1: plot.labels.length - 0.5,
            line: { color: '#dc2626', width: 2, dash: 'dot' },
          }],
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%' }}
      />
    </div>
  );
}
