import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { useTheme } from '../../ThemeContext';
import { getAlternativaChartLabel, getAlternativaHoverTitle } from '../../utils/alternativaDisplay';

const CHART_FONT = 'Arial, Helvetica, sans-serif';
const MIN_AXES_2D = 2;
const MIN_AXES_3D = 3;
const MIN_RADAR_DIMENSIONS = 2;

const ONE_D_VIEWS = {
  BARS_H: '1d-bars-h',
  BARS_V: '1d-bars-v',
  LINE: '1d-line',
  DUAL: '1d-dual',
};

const MARKER_COLORS_LIGHT = [
  '#047857', '#b45309', '#c2410c', '#b91c1c', '#1d4ed8', '#7c3aed',
];

const MARKER_COLORS_DARK = [
  '#34d399', '#fbbf24', '#fb923c', '#f87171', '#60a5fa', '#a78bfa',
];

function buildChartTheme(isDark) {
  if (isDark) {
    return {
      paper_bgcolor: 'rgba(15, 23, 42, 0)',
      plot_bgcolor: '#1e293b',
      fontColor: '#e2e8f0',
      titleColor: '#f8fafc',
      gridColor: '#475569',
      axisLineColor: '#64748b',
      zeroLineColor: '#64748b',
      sceneBg: '#0f172a',
      markerLine: '#f8fafc',
      textColor: '#f8fafc',
      markerColors: MARKER_COLORS_DARK,
    };
  }
  return {
    paper_bgcolor: 'rgba(255, 255, 255, 0)',
    plot_bgcolor: '#f4f4f5',
    fontColor: '#0f172a',
    titleColor: '#0f172a',
    gridColor: '#a1a1aa',
    axisLineColor: '#52525b',
    zeroLineColor: '#71717a',
    sceneBg: '#e4e4e7',
    markerLine: '#ffffff',
    textColor: '#0f172a',
    markerColors: MARKER_COLORS_LIGHT,
  };
}

function axisStyle2d(theme, title) {
  return {
    title: { text: title, font: { color: theme.fontColor, size: 13 } },
    tickfont: { color: theme.fontColor, size: 11 },
    gridcolor: theme.gridColor,
    gridwidth: 1,
    linecolor: theme.axisLineColor,
    linewidth: 1.5,
    zerolinecolor: theme.zeroLineColor,
    zerolinewidth: 1.5,
    showgrid: true,
  };
}

function axisStyle3d(theme, title) {
  const label = abbreviateAxisLabel(title, 22);
  return {
    title: {
      text: label,
      font: {
        size: 22,
        color: theme.fontColor,
        family: CHART_FONT,
      },
    },
    tickfont: {
      size: 14,
      color: theme.fontColor,
      family: CHART_FONT,
    },
    gridcolor: theme.gridColor,
    gridwidth: 1,
    linecolor: theme.axisLineColor,
    linewidth: 1.5,
    zerolinecolor: theme.zeroLineColor,
    zerolinewidth: 1.5,
    showgrid: true,
    showbackground: true,
    backgroundcolor: theme.plot_bgcolor,
  };
}

function SceneAxisLegend({ dimX, dimY, dimZ }) {
  if (!dimX || !dimY || !dimZ) return null;
  const items = [
    { axis: 'X', label: dimX.label, color: 'text-emerald-700 dark:text-emerald-400' },
    { axis: 'Y', label: dimY.label, color: 'text-amber-700 dark:text-amber-400' },
    { axis: 'Z', label: dimZ.label, color: 'text-violet-700 dark:text-violet-400' },
  ];
  return (
    <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 px-4 pb-3 pt-2 border-t border-gray-200/80 dark:border-gray-700/60">
      {items.map(({ axis, label, color }) => (
        <div key={axis} className="flex items-baseline gap-2 max-w-xs">
          <span className={`text-sm font-bold tabular-nums ${color}`}>{axis}</span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function abbreviateAxisLabel(text, maxChars = 22) {
  const s = String(text ?? '').trim();
  if (s.length <= maxChars) return s;
  const slice = s.slice(0, maxChars - 1);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > (maxChars - 1) * 0.45) return `${slice.slice(0, lastSpace)}…`;
  return `${slice}…`;
}

function defaultDecision2dRoles(dims) {
  if (!dims?.length || dims.length < 2) {
    return { x: null, y: null, color: null };
  }
  if (dims.length === 2) {
    return { x: dims[0].key, y: dims[1].key, color: null };
  }
  return { x: dims[0].key, y: dims[1].key, color: dims[2].key };
}

function isValidDecision2dRoles(roles, dims) {
  if (!dims?.length || dims.length < 2) return false;
  if (dims.length === 2) {
    return Boolean(
      roles.x && roles.y && roles.x !== roles.y
      && dims.some((d) => d.key === roles.x)
      && dims.some((d) => d.key === roles.y),
    );
  }
  const { x, y, color } = roles;
  if (!x || !y || !color) return false;
  if (new Set([x, y, color]).size !== 3) return false;
  return [x, y, color].every((key) => dims.some((d) => d.key === key));
}

function assignDecision2dRole(roles, role, newKey) {
  const previous = roles[role];
  const next = { ...roles, [role]: newKey };
  (['x', 'y', 'color']).forEach((slot) => {
    if (slot !== role && next[slot] === newKey) {
      next[slot] = previous;
    }
  });
  return next;
}

function buildDecisionSpaceColorscale() {
  return [
    [0, '#7f0000'],
    [0.25, '#b30000'],
    [0.5, '#fd8d3c'],
    [0.75, '#fed976'],
    [1, '#ffffcc'],
  ];
}

function pickDefaultView(axisCount) {
  if (axisCount >= MIN_AXES_3D) return '3d';
  if (axisCount === MIN_AXES_2D) return '2d';
  if (axisCount === 1) return ONE_D_VIEWS.BARS_H;
  return null;
}

function isOneDView(mode) {
  return Object.values(ONE_D_VIEWS).includes(mode);
}

function isViewAvailable(mode, axisCount) {
  if (mode === 'radar') return axisCount >= MIN_RADAR_DIMENSIONS;
  if (mode === '2d') return axisCount >= MIN_AXES_2D;
  if (mode === '2d-dims') return axisCount === MIN_AXES_2D;
  if (mode === '3d') return axisCount >= MIN_AXES_3D;
  if (isOneDView(mode)) return axisCount === 1;
  return false;
}

function TradeoffCharts({
  puntos,
  selectedId,
  onSelect,
  madmLabel = 'MADM',
  chartDimensions = [],
}) {
  const { isDark } = useTheme();
  const theme = useMemo(() => buildChartTheme(isDark), [isDark]);

  const axisDims = useMemo(() => chartDimensions || [], [chartDimensions]);
  const axisKeys = axisDims.map((d) => d.key).join('|');
  const axisCount = axisDims.length;
  const canPlot1d = axisCount === 1;
  const canPlotDecision2d = axisCount >= MIN_AXES_2D;
  const canPlot2dDims = axisCount === MIN_AXES_2D;
  const canPlot3d = axisCount >= MIN_AXES_3D;
  const canPlotRadar = axisCount >= MIN_RADAR_DIMENSIONS;
  const canPickColorDimension = axisCount >= MIN_AXES_3D;
  const showMultiViewButtons = canPlotDecision2d || canPlot3d || canPlotRadar;

  const [viewMode, setViewMode] = useState(() => pickDefaultView(axisCount));
  const [decision2dRoles, setDecision2dRoles] = useState(() => defaultDecision2dRoles([]));

  useEffect(() => {
    setDecision2dRoles((prev) => (
      isValidDecision2dRoles(prev, axisDims) ? prev : defaultDecision2dRoles(axisDims)
    ));
  }, [axisKeys, axisDims]);

  useEffect(() => {
    setViewMode((prev) => (
      isViewAvailable(prev, axisCount) ? prev : pickDefaultView(axisCount)
    ));
  }, [axisKeys, axisCount]);

  const effectiveView = useMemo(() => {
    if (viewMode === 'radar' && canPlotRadar) return 'radar';
    if (viewMode === '2d' && canPlotDecision2d) return '2d';
    if (viewMode === '2d-dims' && canPlot2dDims) return '2d-dims';
    if (viewMode === '3d' && canPlot3d) return '3d';
    if (isOneDView(viewMode) && canPlot1d) return viewMode;
    return pickDefaultView(axisCount);
  }, [viewMode, canPlot1d, canPlotDecision2d, canPlot2dDims, canPlot3d, canPlotRadar, axisCount]);

  const plotData = useMemo(
    () => puntos.map((p, i) => ({
      ...p,
      chartLabel: p.chartLabel || getAlternativaChartLabel(p),
      color: theme.markerColors[i % theme.markerColors.length],
      size: p.id === selectedId ? 16 : 12,
    })),
    [puntos, selectedId, theme.markerColors],
  );

  const chartLabels = plotData.map((p) => p.chartLabel);

  const buildHover = () => plotData.map((p) => {
    const parts = [getAlternativaHoverTitle(p)];
    axisDims.forEach((d) => {
      parts.push(`${d.label}: ${d.get(p) ?? '—'}`);
    });
    parts.push(`Puntuación ${madmLabel}: ${Number(p.overall ?? 0).toFixed(4)}`);
    if (p.ranking != null) parts.push(`Ranking: #${p.ranking}`);
    return parts.join('<br>');
  });

  const hover = buildHover();

  const commonLayout = {
    paper_bgcolor: theme.paper_bgcolor,
    plot_bgcolor: theme.plot_bgcolor,
    font: { family: 'inherit', color: theme.fontColor },
    margin: { l: 56, r: 24, t: 48, b: 56 },
    title: { font: { color: theme.titleColor, size: 15 } },
  };

  const markerStyle = {
    size: plotData.map((p) => p.size),
    color: plotData.map((p) => p.color),
    line: { color: theme.markerLine, width: 2.5 },
    opacity: 0.95,
    symbol: plotData.map((p) => (p.id === selectedId ? 'diamond' : 'circle')),
  };

  const textStyle = {
    textposition: 'top center',
    textfont: { color: theme.textColor, size: 13, family: 'inherit' },
  };

  const handleClick = (event) => {
    const idx = event?.points?.[0]?.pointIndex;
    if (idx != null && plotData[idx]) onSelect(plotData[idx].id);
  };

  const [dimX, dimY, dimZ] = axisDims;

  const decisionXDim = useMemo(
    () => axisDims.find((d) => d.key === decision2dRoles.x) ?? axisDims[0] ?? null,
    [axisDims, decision2dRoles.x],
  );
  const decisionYDim = useMemo(
    () => axisDims.find((d) => d.key === decision2dRoles.y) ?? axisDims[1] ?? axisDims[0] ?? null,
    [axisDims, decision2dRoles.y],
  );
  const colorDim = useMemo(() => {
    if (!canPickColorDimension || !decision2dRoles.color) return null;
    return axisDims.find((d) => d.key === decision2dRoles.color) ?? null;
  }, [axisDims, decision2dRoles.color, canPickColorDimension]);

  const assignDecisionRole = (role, newKey) => {
    setDecision2dRoles((prev) => assignDecision2dRole(prev, role, newKey));
  };

  const scatter2dData = useMemo(() => {
    if (!canPlotDecision2d || !decisionXDim || !decisionYDim) return [];
    return plotData
      .map((p) => {
        const x = decisionXDim.get(p);
        const y = decisionYDim.get(p);
        if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) return null;
        const colorVal = canPickColorDimension && colorDim
          ? colorDim.get(p)
          : p.overall;
        if (colorVal == null || Number.isNaN(Number(colorVal))) return null;
        return {
          ...p,
          x: Number(x),
          y: Number(y),
          zColor: Number(colorVal),
          size: p.id === selectedId ? 14 : 11,
          symbol: p.id === selectedId ? 'diamond' : 'circle',
        };
      })
      .filter(Boolean);
  }, [
    plotData,
    decisionXDim,
    decisionYDim,
    colorDim,
    canPlotDecision2d,
    canPickColorDimension,
    selectedId,
  ]);

  const scatter2dColorRange = useMemo(() => {
    if (!scatter2dData.length) return { cmin: 0, cmax: 1 };
    const vals = scatter2dData.map((p) => p.zColor);
    const cmin = Math.min(...vals);
    const cmax = Math.max(...vals);
    const pad = cmin === cmax ? 0.05 : 0;
    return { cmin: cmin - pad, cmax: cmax + pad };
  }, [scatter2dData]);

  const scatter2dHover = useMemo(
    () => scatter2dData.map((p) => {
      const parts = [
        getAlternativaHoverTitle(p),
        `${decisionXDim.label}: ${p.x.toFixed(4)}`,
        `${decisionYDim.label}: ${p.y.toFixed(4)}`,
      ];
      if (canPickColorDimension && colorDim) {
        parts.push(`${colorDim.label}: ${p.zColor.toFixed(4)}`);
      } else {
        parts.push(`Puntuación ${madmLabel}: ${Number(p.overall ?? 0).toFixed(4)}`);
      }
      if (p.ranking != null) parts.push(`Ranking: #${p.ranking}`);
      return parts.join('<br>');
    }),
    [scatter2dData, decisionXDim, decisionYDim, colorDim, canPickColorDimension, madmLabel],
  );

  const handleScatter2dClick = (event) => {
    const idx = event?.points?.[0]?.pointIndex;
    if (idx != null && scatter2dData[idx]) onSelect(scatter2dData[idx].id);
  };

  const radarTheta = useMemo(
    () => axisDims.map((d) => abbreviateAxisLabel(d.label, axisDims.length > 8 ? 16 : 22)),
    [axisDims],
  );

  const radarRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    plotData.forEach((p) => {
      axisDims.forEach((d) => {
        const v = Number(d.get(p));
        if (!Number.isNaN(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      });
    });
    if (!Number.isFinite(min)) return [0, 1];
    const pad = max === min ? 0.05 : (max - min) * 0.08;
    return [Math.max(0, min - pad), max + pad];
  }, [plotData, axisDims]);

  const radarTraces = useMemo(
    () => plotData.map((p) => {
      const rValues = axisDims.map((d) => Number(d.get(p) ?? 0));
      const closedR = rValues.length > 0 ? [...rValues, rValues[0]] : rValues;
      const closedTheta = radarTheta.length > 0 ? [...radarTheta, radarTheta[0]] : radarTheta;
      return {
      type: 'scatterpolar',
      r: closedR,
      theta: closedTheta,
      name: p.chartLabel,
      fill: 'none',
      line: {
        color: p.color,
        width: p.id === selectedId ? 2.5 : 1.8,
      },
      marker: {
        color: p.color,
        size: p.id === selectedId ? 9 : 6,
        line: { color: isDark ? '#0f172a' : '#fff', width: 1 },
      },
      opacity: p.id === selectedId ? 1 : 0.82,
      hovertemplate: `${getAlternativaHoverTitle(p)}<extra></extra>`,
    };
    }),
    [plotData, axisDims, radarTheta, selectedId, isDark],
  );

  const handleRadarClick = (event) => {
    const curve = event?.points?.[0]?.curveNumber;
    if (curve != null && plotData[curve]) onSelect(plotData[curve].id);
  };

  const rankingSorted = useMemo(() => {
    if (!canPlot1d) return plotData;
    return [...plotData].sort(
      (a, b) => (a.ranking ?? 999) - (b.ranking ?? 999) || b.overall - a.overall,
    );
  }, [plotData, canPlot1d]);

  if (!plotData.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No hay alternativas para graficar en este cálculo.
      </p>
    );
  }

  if (!canPlot1d && !canPlotDecision2d && !canPlot3d && !canPlotRadar) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Seleccione al menos una dimensión arriba para graficar.
      </p>
    );
  }

  const dim1 = axisDims[0];
  const dimValues = (p) => dim1?.get(p) ?? 0;
  const altLabels = plotData.map((p) => p.chartLabel);

  const oneDButtonClass = (mode) => `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
    effectiveView === mode
      ? 'bg-navy-700 text-white'
      : 'bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-200'
  }`;
  const chartButtonClass = (active) => `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    active
      ? 'bg-navy-700 text-white'
      : 'bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-200'
  }`;
  const title2d = 'ESPACIO DE DECISIÓN 2D';
  const titleDimsVs = dimX && dimY ? `${dimX.label} vs ${dimY.label}` : 'Dimensión A vs Dimensión B';
  const colorbarLabel = canPickColorDimension && colorDim
    ? colorDim.label
    : `Score ${madmLabel}`;
  const title3d = dimX && dimY && dimZ
    ? `Espacio 3D: ${dimX.label} · ${dimY.label} · ${dimZ.label}`
    : '';

  const chartBoxClass = `rounded-xl border p-2 min-h-[480px] ${
    isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50 shadow-inner'
  }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {showMultiViewButtons && (
          <>
            {canPlotDecision2d && (
              <button
                type="button"
                onClick={() => setViewMode('2d')}
                className={chartButtonClass(effectiveView === '2d')}
              >
                Espacio de decisión 2D
              </button>
            )}
            {canPlot2dDims && (
              <button
                type="button"
                onClick={() => setViewMode('2d-dims')}
                className={chartButtonClass(effectiveView === '2d-dims')}
              >
                {titleDimsVs}
              </button>
            )}
            {canPlot3d && (
              <button
                type="button"
                onClick={() => setViewMode('3d')}
                className={chartButtonClass(effectiveView === '3d')}
              >
                Espacio 3D
              </button>
            )}
            {canPlotRadar && (
              <button
                type="button"
                onClick={() => setViewMode('radar')}
                className={chartButtonClass(effectiveView === 'radar')}
              >
                Diagrama de araña
              </button>
            )}
          </>
        )}
        {canPlot1d && (
          <>
            <button type="button" onClick={() => setViewMode(ONE_D_VIEWS.BARS_H)} className={oneDButtonClass(ONE_D_VIEWS.BARS_H)}>
              Barras horizontales
            </button>
            <button type="button" onClick={() => setViewMode(ONE_D_VIEWS.BARS_V)} className={oneDButtonClass(ONE_D_VIEWS.BARS_V)}>
              Barras verticales
            </button>
            <button type="button" onClick={() => setViewMode(ONE_D_VIEWS.LINE)} className={oneDButtonClass(ONE_D_VIEWS.LINE)}>
              Línea por ranking
            </button>
            <button type="button" onClick={() => setViewMode(ONE_D_VIEWS.DUAL)} className={oneDButtonClass(ONE_D_VIEWS.DUAL)}>
              Utilidad vs {madmLabel}
            </button>
          </>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {effectiveView === 'radar'
            ? 'Clic en una serie para seleccionar alternativa'
            : effectiveView === '2d'
            ? (canPickColorDimension
              ? 'Clic en un punto para seleccionar · ◇ = alternativa activa · color = dimensión'
              : 'Clic en un punto para seleccionar · ◇ = alternativa activa · color = score')
            : effectiveView === '2d-dims'
            ? 'Clic en un punto para seleccionar · ◇ = alternativa activa · color por alternativa'
            : effectiveView === '3d'
            ? 'Arrastra para rotar · Clic para seleccionar'
            : isOneDView(effectiveView)
                ? 'Clic en una barra o punto para seleccionar'
                : 'Clic en un punto para seleccionar'}
        </p>
      </div>

      {effectiveView === 'radar' && canPlotRadar && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Diagrama de araña — {axisCount} dimensión{axisCount !== 1 ? 'es' : ''}, una serie por alternativa.
        </p>
      )}

      {effectiveView === '2d' && canPlotDecision2d && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
          {canPickColorDimension ? (
            <>
              <label className="flex items-center gap-1.5 shrink-0">
                <span className="font-medium text-gray-600 dark:text-gray-300">Eje X:</span>
                <select
                  value={decision2dRoles.x ?? ''}
                  onChange={(e) => assignDecisionRole('x', e.target.value)}
                  className="text-xs py-1 px-2 rounded-md border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 max-w-[11rem] truncate"
                  aria-label="Dimensión del eje X"
                >
                  {axisDims.map((dim) => (
                    <option key={dim.key} value={dim.key}>{dim.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 shrink-0">
                <span className="font-medium text-gray-600 dark:text-gray-300">Eje Y:</span>
                <select
                  value={decision2dRoles.y ?? ''}
                  onChange={(e) => assignDecisionRole('y', e.target.value)}
                  className="text-xs py-1 px-2 rounded-md border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 max-w-[11rem] truncate"
                  aria-label="Dimensión del eje Y"
                >
                  {axisDims.map((dim) => (
                    <option key={dim.key} value={dim.key}>{dim.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 shrink-0">
                <span className="font-medium text-gray-600 dark:text-gray-300">Barra de color:</span>
                <select
                  value={decision2dRoles.color ?? ''}
                  onChange={(e) => assignDecisionRole('color', e.target.value)}
                  className="text-xs py-1 px-2 rounded-md border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 max-w-[11rem] truncate"
                  aria-label="Dimensión para la barra de color"
                >
                  {axisDims.map((dim) => (
                    <option key={dim.key} value={dim.key}>{dim.label}</option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Cada dimensión solo puede usarse en un rol; al repetir, se intercambian automáticamente.
              </p>
            </>
          ) : (
            <p>
              Eje X = «{decisionXDim?.label}», eje Y = «{decisionYDim?.label}», color = puntuación {madmLabel}.
            </p>
          )}
        </div>
      )}

      {effectiveView === '2d-dims' && canPlot2dDims && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Comparación directa «{dimX?.label}» vs «{dimY?.label}» — una letra y color por alternativa.
        </p>
      )}

      {effectiveView === '3d' && canPlot3d && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Espacio 3D: «{dimX?.label}» · «{dimY?.label}» · «{dimZ?.label}».
        </p>
      )}

      {isOneDView(effectiveView) && canPlot1d && dim1 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          1D sobre la 1.ª dimensión seleccionada: «{dim1.label}».
        </p>
      )}

      <div className={chartBoxClass}>
        {effectiveView === 'radar' && canPlotRadar ? (
          <Plot
            key={`radar-${isDark}-${axisKeys}`}
            data={radarTraces}
            layout={{
              ...commonLayout,
              title: { ...commonLayout.title, text: 'Diagrama de araña' },
              polar: {
                bgcolor: theme.plot_bgcolor,
                radialaxis: {
                  visible: true,
                  range: radarRange,
                  gridcolor: theme.gridColor,
                  linecolor: theme.axisLineColor,
                  tickfont: { color: theme.fontColor, size: 10 },
                },
                angularaxis: {
                  tickfont: { color: theme.fontColor, size: axisCount > 10 ? 9 : 11 },
                  gridcolor: theme.gridColor,
                  linecolor: theme.axisLineColor,
                  direction: 'clockwise',
                },
              },
              legend: {
                orientation: 'h',
                y: -0.12,
                font: { color: theme.fontColor, size: 11 },
              },
              height: Math.max(480, 420 + Math.floor(axisCount / 4) * 24),
              margin: { l: 48, r: 48, t: 56, b: axisCount > 6 ? 100 : 80 },
            }}
            config={{ responsive: true, displayModeBar: true }}
            style={{ width: '100%' }}
            onClick={handleRadarClick}
          />
        ) : effectiveView === '2d' && canPlotDecision2d && scatter2dData.length > 0 ? (
          <Plot
            key={`2d-${isDark}-${axisKeys}-${decision2dRoles.x}-${decision2dRoles.y}-${decision2dRoles.color ?? 'madm'}`}
            data={[{
              type: 'scatter',
              mode: 'markers+text',
              x: scatter2dData.map((p) => p.x),
              y: scatter2dData.map((p) => p.y),
              text: scatter2dData.map((p) => p.chartLabel),
              ...textStyle,
              hovertext: scatter2dHover,
              hoverinfo: 'text',
              marker: {
                size: scatter2dData.map((p) => p.size),
                symbol: scatter2dData.map((p) => p.symbol),
                color: scatter2dData.map((p) => p.zColor),
                colorscale: buildDecisionSpaceColorscale(),
                cmin: scatter2dColorRange.cmin,
                cmax: scatter2dColorRange.cmax,
                showscale: true,
                colorbar: {
                  title: {
                    text: colorbarLabel,
                    font: { color: theme.fontColor, size: 11 },
                  },
                  tickfont: { color: theme.fontColor, size: 10 },
                  len: 0.85,
                  thickness: 14,
                },
                line: { color: isDark ? '#1e293b' : '#0f172a', width: 1.2 },
                opacity: 0.92,
              },
            }]}
            layout={{
              ...commonLayout,
              title: { ...commonLayout.title, text: title2d },
              xaxis: axisStyle2d(theme, decisionXDim.label),
              yaxis: axisStyle2d(theme, decisionYDim.label),
              height: 480,
              margin: { l: 64, r: 72, t: 56, b: 56 },
            }}
            config={{ responsive: true, displayModeBar: true }}
            style={{ width: '100%' }}
            onClick={handleScatter2dClick}
          />
        ) : effectiveView === '2d' && canPlotDecision2d ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 p-8 text-center">
            No hay valores para las dos dimensiones seleccionadas.
          </p>
        ) : effectiveView === '2d-dims' && canPlot2dDims && scatter2dData.length > 0 ? (
          <Plot
            key={`2d-dims-${isDark}-${axisKeys}`}
            data={[{
              type: 'scatter',
              mode: 'markers+text',
              x: scatter2dData.map((p) => p.x),
              y: scatter2dData.map((p) => p.y),
              text: scatter2dData.map((p) => p.chartLabel),
              textposition: 'middle right',
              textfont: {
                color: isDark ? '#f8fafc' : '#0f172a',
                size: 14,
                family: 'inherit',
              },
              hovertext: scatter2dHover,
              hoverinfo: 'text',
              marker: {
                size: scatter2dData.map((p) => p.size),
                symbol: scatter2dData.map((p) => p.symbol),
                color: scatter2dData.map((p) => p.color),
                line: { color: isDark ? '#e2e8f0' : '#0f172a', width: 1.5 },
                opacity: 0.95,
              },
            }]}
            layout={{
              ...commonLayout,
              title: { ...commonLayout.title, text: titleDimsVs },
              xaxis: axisStyle2d(theme, dimX.label),
              yaxis: axisStyle2d(theme, dimY.label),
              height: 480,
              margin: { l: 64, r: 32, t: 56, b: 56 },
            }}
            config={{ responsive: true, displayModeBar: true }}
            style={{ width: '100%' }}
            onClick={handleScatter2dClick}
          />
        ) : effectiveView === '2d-dims' && canPlot2dDims ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 p-8 text-center">
            No hay valores para las dos dimensiones seleccionadas.
          </p>
        ) : effectiveView === ONE_D_VIEWS.BARS_H && canPlot1d ? (
          <Plot
            key={`1dh-${isDark}`}
            data={[{
              type: 'bar',
              orientation: 'h',
              y: altLabels,
              x: plotData.map(dimValues),
              text: plotData.map((p) => Number(dimValues(p)).toFixed(3)),
              textposition: 'outside',
              textfont: { color: theme.textColor, size: 12 },
              marker: {
                color: plotData.map((p) => p.color),
                line: { color: theme.markerLine, width: 1.5 },
              },
              hovertext: hover,
              hoverinfo: 'text',
            }]}
            layout={{
              ...commonLayout,
              title: { ...commonLayout.title, text: `${dim1.label} por alternativa` },
              xaxis: axisStyle2d(theme, dim1.label),
              yaxis: { ...axisStyle2d(theme, 'Alternativa'), automargin: true },
              height: Math.max(320, plotData.length * 56 + 80),
              margin: { l: 160, r: 48, t: 48, b: 48 },
            }}
            config={{ responsive: true, displayModeBar: true }}
            style={{ width: '100%' }}
            onClick={handleClick}
          />
        ) : effectiveView === ONE_D_VIEWS.BARS_V && canPlot1d ? (
          <Plot
            key={`1dv-${isDark}`}
            data={[{
              type: 'bar',
              x: plotData.map((p) => p.chartLabel),
              y: plotData.map(dimValues),
              text: plotData.map((p) => Number(dimValues(p)).toFixed(3)),
              textposition: 'outside',
              marker: { color: plotData.map((p) => p.color) },
              hovertext: hover,
              hoverinfo: 'text',
            }]}
            layout={{
              ...commonLayout,
              title: { ...commonLayout.title, text: `${dim1.label} por alternativa` },
              xaxis: axisStyle2d(theme, 'Alternativa'),
              yaxis: axisStyle2d(theme, dim1.label),
              height: 460,
            }}
            config={{ responsive: true, displayModeBar: true }}
            style={{ width: '100%' }}
            onClick={handleClick}
          />
        ) : effectiveView === ONE_D_VIEWS.LINE && canPlot1d ? (
          <Plot
            key={`1dl-${isDark}`}
            data={[{
              type: 'scatter',
              mode: 'lines+markers+text',
              x: rankingSorted.map((p) => p.chartLabel),
              y: rankingSorted.map(dimValues),
              text: rankingSorted.map((p) => p.chartLabel),
              textposition: 'top center',
              textfont: { color: theme.textColor, size: 12 },
              line: { color: isDark ? '#60a5fa' : '#2563eb', width: 2 },
              marker: {
                size: rankingSorted.map((p) => (p.id === selectedId ? 14 : 10)),
                color: rankingSorted.map((p) => p.color),
              },
              hovertext: rankingSorted.map((p) => hover[plotData.indexOf(p)]),
              hoverinfo: 'text',
            }]}
            layout={{
              ...commonLayout,
              title: {
                ...commonLayout.title,
                text: `${dim1.label} — ordenadas por ranking ${madmLabel}`,
              },
              xaxis: axisStyle2d(theme, 'Ranking MADM →'),
              yaxis: axisStyle2d(theme, dim1.label),
              height: 460,
            }}
            config={{ responsive: true, displayModeBar: true }}
            style={{ width: '100%' }}
            onClick={handleClick}
          />
        ) : effectiveView === ONE_D_VIEWS.DUAL && canPlot1d ? (
          <Plot
            key={`1dd-${isDark}`}
            data={[
              {
                type: 'bar',
                name: dim1.label,
                x: plotData.map((p) => p.chartLabel),
                y: plotData.map(dimValues),
                marker: { color: isDark ? '#38bdf8' : '#0284c7' },
              },
              {
                type: 'bar',
                name: `Score ${madmLabel}`,
                x: plotData.map((p) => p.chartLabel),
                y: plotData.map((p) => p.overall ?? 0),
                marker: { color: isDark ? '#a78bfa' : '#7c3aed' },
              },
            ]}
            layout={{
              ...commonLayout,
              barmode: 'group',
              title: {
                ...commonLayout.title,
                text: `${dim1.label} y puntuación ${madmLabel}`,
              },
              xaxis: axisStyle2d(theme, 'Alternativa'),
              yaxis: axisStyle2d(theme, 'Valor'),
              legend: { font: { color: theme.fontColor } },
              height: 460,
            }}
            config={{ responsive: true, displayModeBar: true }}
            style={{ width: '100%' }}
            onClick={handleClick}
          />
        ) : effectiveView === '3d' && canPlot3d ? (
          <>
            <Plot
              key={`3d-${isDark}-${axisKeys}`}
              data={[{
                type: 'scatter3d',
                mode: 'markers+text',
                x: plotData.map((p) => dimX.get(p) ?? 0),
                y: plotData.map((p) => dimY.get(p) ?? 0),
                z: plotData.map((p) => dimZ.get(p) ?? 0),
                text: chartLabels,
                textfont: { color: theme.textColor, size: 14, family: CHART_FONT },
                marker: markerStyle,
                hovertext: hover,
                hoverinfo: 'text',
              }]}
              layout={{
                paper_bgcolor: theme.paper_bgcolor,
                font: { color: theme.fontColor, size: 14, family: CHART_FONT },
                title: {
                  text: title3d,
                  font: { color: theme.titleColor, size: 16, family: CHART_FONT },
                },
                scene: {
                  bgcolor: theme.sceneBg,
                  aspectmode: 'cube',
                  xaxis: axisStyle3d(theme, dimX.label),
                  yaxis: axisStyle3d(theme, dimY.label),
                  zaxis: axisStyle3d(theme, dimZ.label),
                },
                height: 540,
                margin: { l: 0, r: 0, t: 56, b: 0 },
              }}
              config={{ responsive: true, displayModeBar: true }}
              style={{ width: '100%' }}
              onClick={handleClick}
            />
            <SceneAxisLegend dimX={dimX} dimY={dimY} dimZ={dimZ} />
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 p-8 text-center">
            Seleccione al menos una dimensión para graficar.
          </p>
        )}
      </div>
    </div>
  );
}

export default TradeoffCharts;
