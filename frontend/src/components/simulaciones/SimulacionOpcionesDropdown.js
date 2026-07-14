import React, { useEffect, useRef, useState } from 'react';

const NORM_LABELS = {
  directional_minmax: 'Min-max direccional',
  vector: 'Vectorial',
  directional_vector: 'Vectorial direccional',
  sum: 'Por suma',
};

const WEIGHT_LABELS = {
  equal_weights: 'Pesos iguales',
  user_defined_weights: 'Pesos definidos por el usuario',
  entropy: 'Entropía',
  critic: 'CRITIC',
};

const MADM_LABELS = {
  topsis: 'TOPSIS',
  wsm: 'WSM (suma ponderada)',
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

function labelFrom(map, value, fallback = '—') {
  if (!value) return fallback;
  return map[value] || value;
}

function Row({ label, children }) {
  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-800/80 last:border-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
        {label}
      </dt>
      <dd className="text-sm text-gray-800 dark:text-gray-100">{children}</dd>
    </div>
  );
}

function SimulacionOpcionesDropdown({ resultado }) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  const opciones = resultado?.opciones_calculo;
  const tieneOpciones = Boolean(opciones);

  const updatePanelPosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 12;
    const maxWidth = Math.min(512, rect.right - margin, window.innerWidth - margin * 2);
    setPanelStyle({
      top: rect.bottom + 8,
      right: Math.max(margin, window.innerWidth - rect.right),
      width: Math.max(280, maxWidth),
      maxHeight: Math.min(window.innerHeight - rect.bottom - 24, 448),
    });
  };

  const toggleOpen = () => {
    if (!open) updatePanelPosition();
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePanelPosition();
    const onResize = () => updatePanelPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (!tieneOpciones) return null;

  const pesosCalc = resultado?.pesos?.weights_by_dimension || {};
  const pesosUsuario = opciones.pesos_usuario;
  const pareto = resultado?.pareto;

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="btn-sm border border-gray-200 dark:border-gray-700/60 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-navy-800/40 inline-flex items-center gap-1.5"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Opciones del cálculo
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed z-[100] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-navy-900 shadow-xl"
          style={panelStyle}
          role="region"
          aria-label="Opciones usadas en el cálculo"
        >
          <div className="sticky top-0 z-10 px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-white/95 dark:bg-navy-900/95 backdrop-blur-sm">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
              Configuración aplicada
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Parámetros con los que se ejecutó este cálculo.
            </p>
          </div>

          <dl className="px-4 py-2">
            <Row label="Filtro Pareto">
              {opciones.aplicar_pareto ? (
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">Activado</span>
              ) : (
                <span className="text-gray-500">No aplicado</span>
              )}
            </Row>

            {opciones.aplicar_pareto && opciones.pareto_epsilon != null && (
              <Row label="Tolerancia Pareto (epsilon)">
                <span className="font-mono text-sm">{opciones.pareto_epsilon}</span>
              </Row>
            )}

            {opciones.aplicar_pareto && pareto && (
              <Row label="Frente no dominado">
                <ul className="list-disc list-inside space-y-0.5 text-sm">
                  {(pareto.pareto_alternatives || []).map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
                {(pareto.dominated_alternatives || []).length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    Excluidas: {(pareto.dominated_alternatives || []).join(', ')}
                  </p>
                )}
              </Row>
            )}

            <Row label="Dirección por dimensión (min / max)">
              {opciones.direcciones_por_dimension &&
              Object.keys(opciones.direcciones_por_dimension).length ? (
                <ul className="space-y-1 text-sm">
                  {Object.entries(opciones.direcciones_por_dimension).map(([dim, dir]) => (
                    <li key={dim}>
                      <span className="font-medium">{dim}:</span>{' '}
                      {dir === 'min' ? 'Menor es mejor (MIN)' : 'Mayor es mejor (MAX)'}
                    </li>
                  ))}
                </ul>
              ) : Array.isArray(opciones.direcciones) ? (
                <ul className="space-y-1 text-sm font-mono">
                  {opciones.direcciones.map((dir, i) => (
                    <li key={i}>
                      C{i + 1}: {dir}
                    </li>
                  ))}
                </ul>
              ) : (
                '—'
              )}
            </Row>

            <Row label="Dimensiones normalizadas">
              {(opciones.dimensiones_normalizar || []).length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {opciones.dimensiones_normalizar.map((d) => (
                    <li
                      key={d}
                      className="text-xs px-2 py-0.5 rounded-full bg-navy-500/10 text-navy-800 dark:text-navy-200"
                    >
                      {d}
                    </li>
                  ))}
                </ul>
              ) : (
                '—'
              )}
            </Row>

            <Row label="Método de normalización">
              {labelFrom(NORM_LABELS, opciones.normalizacion_metodo)}
            </Row>

            <Row label="Método de pesos">
              {labelFrom(WEIGHT_LABELS, opciones.metodo_pesos)}
            </Row>

            {opciones.metodo_pesos === 'user_defined_weights' && Array.isArray(pesosUsuario) && (
              <Row label="Pesos ingresados">
                <ul className="space-y-1 text-sm font-mono">
                  {(opciones.dimensiones_normalizar || []).map((dim, i) => (
                    <li key={dim}>
                      {dim}: {pesosUsuario[i] != null ? Number(pesosUsuario[i]).toFixed(4) : '—'}
                    </li>
                  ))}
                </ul>
              </Row>
            )}

            {Object.keys(pesosCalc).length > 0 && (
              <Row label="Pesos calculados">
                <ul className="space-y-1 text-sm font-mono">
                  {Object.entries(pesosCalc).map(([dim, w]) => (
                    <li key={dim}>
                      {dim}: {Number(w).toFixed(4)}
                    </li>
                  ))}
                </ul>
              </Row>
            )}

            <Row label="Método MADM">
              {labelFrom(MADM_LABELS, opciones.metodo_madm)}
            </Row>

            {resultado?.madm?.best_alternative && (
              <Row label="Mejor alternativa (MADM)">
                <span className="font-semibold text-navy-700 dark:text-navy-300">
                  {resultado.madm.best_alternative}
                </span>
              </Row>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

export default SimulacionOpcionesDropdown;
