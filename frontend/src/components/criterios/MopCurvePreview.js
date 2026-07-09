import React from 'react';

const STROKE = 'currentColor';
const FILL = 'rgba(59, 130, 246, 0.15)';

/** Mini gráfica SVG de la forma de la función de utilidad. */
function MopCurvePreview({ type = 'increasing', className = '' }) {
  const paths = {
    increasing: 'M4,44 L56,8',
    decreasing: 'M4,8 L56,44',
    steep_decreasing: 'M4,8 L20,12 L56,44',
    logarithmic: 'M4,44 Q20,40 56,10',
    exponential_inc: 'M4,44 Q30,42 56,8',
    exponential_dec: 'M4,8 Q30,10 56,44',
    sigmoid: 'M4,44 C18,44 38,8 56,8',
    triangular: 'M4,44 L30,8 L56,44 Z',
    trapezoidal: 'M4,44 L16,12 L40,12 L52,44 Z',
    target: 'M4,44 Q30,8 56,44',
    veto: 'M4,8 L40,8 L56,44',
    discrete: 'M8,44 L8,20 M20,44 L20,32 M32,44 L32,14 M44,44 L44,26',
    piecewise: 'M4,44 L20,20 L36,28 L56,8',
  };

  const d = paths[type] || paths.increasing;
  const isArea = type === 'triangular' || type === 'trapezoidal';

  return (
    <svg
      viewBox="0 0 60 48"
      className={`w-full h-12 text-navy-500 dark:text-navy-300 ${className}`}
      aria-hidden
    >
      <line x1="4" y1="44" x2="56" y2="44" stroke={STROKE} strokeWidth="0.5" opacity="0.25" />
      <line x1="4" y1="44" x2="4" y2="4" stroke={STROKE} strokeWidth="0.5" opacity="0.25" />
      {isArea ? (
        <path d={d} fill={FILL} stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      ) : type === 'discrete' ? (
        <g stroke={STROKE} strokeWidth="2" strokeLinecap="round">
          <line x1="8" y1="44" x2="8" y2="20" />
          <line x1="20" y1="44" x2="20" y2="32" />
          <line x1="32" y1="44" x2="32" y2="14" />
          <line x1="44" y1="44" x2="44" y2="26" />
        </g>
      ) : (
        <path d={d} fill="none" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default MopCurvePreview;
