import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function MathFormula({ latex, displayMode = true, className = '' }) {
  const html = useMemo(() => {
    if (!latex) return '';
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode,
        trust: false,
      });
    } catch {
      return latex;
    }
  }, [latex, displayMode]);

  if (!html) return null;

  return (
    <div
      className={`math-formula overflow-x-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MathFormula;
