import React, { useMemo } from 'react';
import { getFamiliaFormula } from './mopCriterioFormulas';
import { getFamiliaLabel } from './mopCriterioOptions';
import {
  buildUtilitySpec,
  evaluateUtility,
  sampleUtilityCurve,
} from './utilityCurveUtils';

const STROKE = 'currentColor';
const FILL = 'rgba(59, 130, 246, 0.12)';
const MARKER = '#2563eb';

function DiscreteBars({ categories, width, height, padX, padY }) {
  const n = categories.length || 1;
  const barW = (width - padX * 2) / n;
  const maxU = Math.max(...categories.map((c) => c.u), 0.01);
  const innerH = height - padY * 2;

  return (
    <g>
      {categories.map((cat, i) => {
        const barH = (cat.u / maxU) * innerH;
        const x = padX + i * barW + barW * 0.15;
        const w = barW * 0.7;
        const y = height - padY - barH;
        return (
          <g key={cat.label}>
            <rect x={x} y={y} width={w} height={barH} fill={FILL} stroke={STROKE} strokeWidth="1" rx="1" />
            <title>{`${cat.label}: u=${cat.u.toFixed(3)}`}</title>
          </g>
        );
      })}
    </g>
  );
}

function ContinuousCurve({ points, xMin, xMax, markerX, spec, width, height, padX, padY }) {
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const xToPx = (x) => padX + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const uToPy = (u) => height - padY - clipU(u) * innerH;

  const pathD = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xToPx(pt.x).toFixed(2)},${uToPy(pt.u).toFixed(2)}`)
    .join(' ');

  let marker = null;
  if (markerX != null && Number.isFinite(markerX)) {
    const u = evaluateUtility(markerX, spec);
    if (u != null) {
      const cx = xToPx(markerX);
      const cy = uToPy(u);
      marker = (
        <g>
          <line
            x1={cx}
            y1={height - padY}
            x2={cx}
            y2={cy}
            stroke={MARKER}
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.6"
          />
          <circle cx={cx} cy={cy} r="3.5" fill={MARKER} stroke="white" strokeWidth="1" />
        </g>
      );
    }
  }

  return (
    <g>
      <path d={pathD} fill="none" stroke={STROKE} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      {marker}
    </g>
  );
}

function clipU(u) {
  return Math.max(0, Math.min(1, u));
}

/**
 * Gráfica compacta de la función de utilidad u(x) con marcador opcional del valor x ingresado.
 */
function UtilidadCurveChart({
  familia,
  params = {},
  tipoCriterio = '',
  tipoDato = '',
  xValue,
  compact = true,
  showLabel = true,
  className = '',
}) {
  const spec = useMemo(
    () => buildUtilitySpec({ familia, params, tipoCriterio, tipoDato }),
    [familia, params, tipoCriterio, tipoDato],
  );

  const sample = useMemo(() => sampleUtilityCurve(spec), [spec]);

  const markerX = useMemo(() => {
    if (xValue == null || String(xValue).trim() === '') return null;
    if (sample.discrete) return null;
    const n = Number(xValue);
    return Number.isFinite(n) ? n : null;
  }, [xValue, sample.discrete]);

  const uAtX = useMemo(() => evaluateUtility(xValue, spec), [xValue, spec]);

  const familiaMeta = getFamiliaFormula(familia);
  const familiaLabel = familia ? getFamiliaLabel(tipoCriterio, familia) : '';

  const width = compact ? 120 : 200;
  const height = compact ? 52 : 80;
  const padX = 6;
  const padY = 6;

  if (!familia) return null;

  if (sample.discrete) {
    const cats = sample.categories || [];
    if (!cats.length) return null;
    const activeCat = xValue != null ? String(xValue).trim() : null;
    return (
      <div className={`utilidad-curve-chart ${className}`} title={familiaMeta.hint || familiaLabel}>
        {showLabel && (
          <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight mb-0.5 truncate">
            u(x) · {familiaLabel || familia}
          </p>
        )}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={`w-full ${compact ? 'h-12' : 'h-20'} text-navy-500 dark:text-navy-300`}
          aria-hidden
        >
          <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke={STROKE} strokeWidth="0.5" opacity="0.25" />
          <DiscreteBars categories={cats} width={width} height={height} padX={padX} padY={padY} />
          {activeCat && uAtX != null && (
            <text x={width / 2} y={padY + 4} textAnchor="middle" fontSize="8" fill={MARKER} fontWeight="600">
              u={uAtX.toFixed(3)}
            </text>
          )}
        </svg>
        {activeCat && uAtX != null && (
          <p className="text-[9px] text-navy-600 dark:text-navy-300 tabular-nums text-right mt-0.5">
            u({activeCat}) = {uAtX.toFixed(3)}
          </p>
        )}
      </div>
    );
  }

  if (!sample.points?.length) return null;

  return (
    <div className={`utilidad-curve-chart ${className}`} title={familiaMeta.hint || familiaLabel}>
      {showLabel && (
        <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight mb-0.5 truncate">
          u(x) · {familiaLabel || familia}
        </p>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full ${compact ? 'h-12' : 'h-20'} text-navy-500 dark:text-navy-300`}
        aria-hidden
      >
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke={STROKE} strokeWidth="0.5" opacity="0.25" />
        <line x1={padX} y1={height - padY} x2={padX} y2={padY} stroke={STROKE} strokeWidth="0.5" opacity="0.25" />
        <ContinuousCurve
          points={sample.points}
          xMin={sample.xMin}
          xMax={sample.xMax}
          markerX={markerX}
          spec={spec}
          width={width}
          height={height}
          padX={padX}
          padY={padY}
        />
      </svg>
      {uAtX != null && (
        <p className="text-[9px] text-navy-600 dark:text-navy-300 tabular-nums text-right mt-0.5">
          u = {uAtX.toFixed(3)}
        </p>
      )}
    </div>
  );
}

export default UtilidadCurveChart;
