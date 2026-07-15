import React, { useEffect, useMemo, useState } from 'react';
import UtilidadCurveChart from '../criterios/UtilidadCurveChart';
import { usesEscenarioPesos } from '../criterios/escenarioAgregacionConstants';
import { valorCellKey } from './evaluacionUtils';

const inputClass =
  'w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-navy-900/40 text-gray-800 dark:text-gray-100 input-focus';

const RAMA_BADGE = {
  omoe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  omoc: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  omor: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200',
};

function CellInput({ meta, value, onChange, disabled }) {
  if (!meta) return null;
  const {
    input_kind,
    select_options,
    prob_options = [],
    cons_options = [],
  } = meta;

  if (input_kind === 'riesgo') {
    const raw = String(value ?? '');
    const sep = raw.indexOf('|');
    const p = sep >= 0 ? raw.slice(0, sep) : '';
    const c = sep >= 0 ? raw.slice(sep + 1) : '';
    const emit = (np, nc) => {
      if (!np && !nc) {
        onChange('');
        return;
      }
      onChange(`${np}|${nc}`);
    };
    const selCls = `${inputClass} py-1 text-xs`;
    return (
      <div className="space-y-1">
        <select
          value={p}
          onChange={(e) => emit(e.target.value, c)}
          disabled={disabled}
          className={selCls}
          title="Probabilidad"
        >
          <option value="">Probabilidad…</option>
          {prob_options.map((opt) => (
            <option key={`p-${opt.value}`} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={c}
          onChange={(e) => emit(p, e.target.value)}
          disabled={disabled}
          className={selCls}
          title="Consecuencia"
        >
          <option value="">Consecuencia…</option>
          {cons_options.map((opt) => (
            <option key={`c-${opt.value}`} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {p && c && (
          <p className="text-[9px] text-rose-600 dark:text-rose-400 text-right tabular-nums">
            riesgo = {(Number(p) * Number(c)).toFixed(3)}
          </p>
        )}
      </div>
    );
  }

  if (input_kind === 'select' && select_options.length) {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClass}
      >
        <option value="">—</option>
        {select_options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={input_kind === 'number' ? 'number' : 'text'}
      step={input_kind === 'number' ? 'any' : undefined}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={inputClass}
    />
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-4 h-4 shrink-0 text-gray-500 transition-transform duration-200 ${
        open ? 'rotate-180' : ''
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function dimensionKey(matrix) {
  return String(matrix.omoe_id ?? matrix.omoe_nombre ?? 'dim');
}

function EvaluacionDimensionTable({ matrix, valores, onChange, disabled, previewMode }) {
  const { filas, columnas, columnasMeta } = matrix;
  const esValorBruto = matrix.modo_valor_terminal === 'valor_bruto';
  const showEscenarioPesos = usesEscenarioPesos(matrix.escenario_agregacion);

  if (!columnas.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-3">
        Sin nodos terminales en esta dimensión.
      </p>
    );
  }

  if (!filas.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-3">
        Sin escenarios en esta dimensión.
      </p>
    );
  }

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        {esValorBruto
          ? 'Dimensión de costos: ingrese el valor x (bruto). Se suma sin curvas de utilidad ni pesos entre escenarios.'
          : previewMode
            ? 'Vista de referencia: pesos, constantes y curvas u(x) por misión. Los campos x se habilitan al elegir una alternativa.'
            : 'Filas = criterios · Columnas = escenarios (misión) · Ingrese x; la curva muestra u(x) según la función del nodo.'}
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-navy-900/60">
              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-navy-900/60 px-3 py-2 text-left text-xs font-semibold text-gray-500 border-b border-r border-gray-200 dark:border-gray-700/60 min-w-[12rem] max-w-[18rem]">
                Criterio / variable
              </th>
              {filas.map((esc, idx) => (
                <th
                  key={esc.id}
                  className="px-2 py-2 text-center border-b border-gray-200 dark:border-gray-700/60 min-w-[6.5rem]"
                  title={
                    showEscenarioPesos && esc.peso != null
                      ? `${esc.nombre} (${esc.peso}%)`
                      : esc.nombre
                  }
                >
                  <span className="block text-xs font-bold text-navy-600 dark:text-navy-400">
                    {esc.label || `M${idx + 1}`}
                  </span>
                  <span className="block text-[11px] font-normal text-gray-600 dark:text-gray-400 leading-tight mt-0.5">
                    {esc.nombre}
                  </span>
                  {showEscenarioPesos && esc.peso != null && (
                    <span className="block text-[10px] text-gray-400 mt-0.5">{esc.peso}%</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columnas.map((col) => {
              const colTitle = [
                col.nombre,
                col.unidad && `Unidad: ${col.unidad}`,
                col.familia_funciones && `Función: ${col.familia_funciones}`,
              ]
                .filter(Boolean)
                .join(' · ');

              return (
                <tr
                  key={`${col.nivel}-${col.nodo_id}`}
                  className="border-b border-gray-100 dark:border-gray-800/80 last:border-0 hover:bg-gray-50/40 dark:hover:bg-navy-800/20"
                >
                  <td
                    className="sticky left-0 z-10 bg-white dark:bg-navy-900 px-3 py-2 border-r border-gray-100 dark:border-gray-800/80 align-top"
                    title={colTitle}
                  >
                    <span className="font-medium text-gray-800 dark:text-gray-100 leading-snug block">
                      {col.nombre}
                    </span>
                    {col.unidad && (
                      <span className="text-[11px] text-gray-400 block mt-0.5">{col.unidad}</span>
                    )}
                  </td>
                  {filas.map((esc) => {
                    const key = valorCellKey(col.nivel, col.nodo_id, esc.id);
                    const colMeta = columnasMeta && columnasMeta[key];
                    // Sin meta de columna = nodo desactivado en este escenario.
                    if (!colMeta) {
                      return (
                        <td
                          key={key}
                          className="px-2 py-1.5 align-middle min-w-[7rem] bg-gray-50/70 dark:bg-navy-950/40"
                          title="Este nodo no aplica en este escenario"
                        >
                          <span className="block text-center text-[10px] text-gray-400 dark:text-gray-500 italic">
                            No aplica
                          </span>
                        </td>
                      );
                    }
                    const constantesDisplay = colMeta.constantes_display
                      || (colMeta.constantes && Object.keys(colMeta.constantes).length
                        ? Object.entries(colMeta.constantes)
                          .filter(([, v]) => v != null && String(v).trim() !== '')
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')
                        : '');
                    const pesoNodo = colMeta.peso_nodo;

                    return (
                      <td key={key} className="px-2 py-1.5 align-top min-w-[7rem]">
                        {constantesDisplay ? (
                          <p
                            className="text-[9px] leading-tight text-amber-700 dark:text-amber-300/90 mb-1 font-mono"
                            title={`Constantes: ${constantesDisplay}`}
                          >
                            {constantesDisplay}
                          </p>
                        ) : null}
                        {pesoNodo != null && (
                          <p className="text-[9px] text-teal-600 dark:text-teal-400 mb-1">
                            w={pesoNodo}%
                          </p>
                        )}
                        <CellInput
                          meta={colMeta}
                          value={valores[key] ?? ''}
                          onChange={(v) => onChange(key, v)}
                          disabled={disabled}
                        />
                        {colMeta.modo_evaluacion !== 'incertidumbre'
                          && !esValorBruto
                          && (colMeta.familia_funciones || col.familia_funciones)
                          && colMeta.input_kind !== 'riesgo' && (
                          <UtilidadCurveChart
                            familia={colMeta.familia_funciones || col.familia_funciones}
                            params={colMeta.constantes || col.constantes || {}}
                            tipoCriterio={colMeta.tipo_criterio || col.tipo_criterio || ''}
                            tipoDato={colMeta.tipo_dato || col.tipo_dato || ''}
                            xValue={valores[key]}
                            compact
                            className="mt-1.5"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvaluacionDimensionAccordion({
  matrix,
  expanded,
  onToggle,
  valores,
  onChange,
  disabled,
  previewMode,
}) {
  const { omoe_nombre, rama_evaluacion, columnas, filas, columnasMeta } = matrix;
  const ramaClass = RAMA_BADGE[rama_evaluacion] || RAMA_BADGE.omoe;
  const { filledCount, totalCells } = useMemo(() => {
    if (!columnas.length || !filas.length) {
      return { filledCount: 0, totalCells: 0 };
    }
    let filled = 0;
    let total = 0;
    columnas.forEach((col) => {
      filas.forEach((esc) => {
        const key = valorCellKey(col.nivel, col.nodo_id, esc.id);
        // Solo celdas activas en el escenario (presentes en el schema).
        if (!(columnasMeta && columnasMeta[key])) return;
        total += 1;
        const v = valores[key];
        if (v != null && String(v).trim() !== '') filled += 1;
      });
    });
    return { filledCount: filled, totalCells: total };
  }, [columnas, filas, columnasMeta, valores]);

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-navy-900/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50/80 dark:hover:bg-navy-800/40 transition-colors"
        aria-expanded={expanded}
      >
        <ChevronIcon open={expanded} />
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
            {omoe_nombre || 'Dimensión'}
          </span>
          {rama_evaluacion && (
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${ramaClass}`}>
              {rama_evaluacion}
            </span>
          )}
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {columnas.length} criterios · {filas.length} misiones
            {totalCells > 0 && !previewMode && (
              <span className="text-gray-400">
                {' '}
                · {filledCount}/{totalCells} celdas
              </span>
            )}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800/80 pt-2">
          <EvaluacionDimensionTable
            matrix={matrix}
            valores={valores}
            onChange={onChange}
            disabled={disabled}
            previewMode={previewMode}
          />
        </div>
      )}
    </section>
  );
}

function EvaluacionMatrix({ matrices, valores, onChange, disabled, previewMode = false }) {
  const list = Array.isArray(matrices) ? matrices : [matrices].filter(Boolean);
  const dimensionIds = useMemo(() => list.map(dimensionKey), [list]);

  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    setExpanded((prev) => {
      const valid = new Set(dimensionIds);
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size === 0 && dimensionIds.length > 0) {
        next.add(dimensionIds[0]);
      }
      return next;
    });
  }, [dimensionIds]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(dimensionIds));
  const collapseAll = () => setExpanded(new Set());

  const jumpTo = (id) => {
    if (!id) return;
    setExpanded((prev) => new Set(prev).add(id));
    requestAnimationFrame(() => {
      document.getElementById(`eval-dim-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (!list.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">
        No hay dimensiones en el árbol. Crea al menos una en{' '}
        <strong>Árbol de dimensiones</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {list.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 sticky top-0 z-20 bg-white/95 dark:bg-navy-900/95 backdrop-blur-sm py-1 -mx-1 px-1 border-b border-gray-100 dark:border-gray-800/60">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 min-w-0 flex-1">
            <span className="shrink-0">Ir a dimensión</span>
            <select
              className="form-select text-xs py-1 min-w-0 max-w-full flex-1"
              defaultValue=""
              onChange={(e) => {
                jumpTo(e.target.value);
                e.target.value = '';
              }}
            >
              <option value="">Seleccionar…</option>
              {list.map((m) => {
                const id = dimensionKey(m);
                return (
                  <option key={id} value={id}>
                    {m.omoe_nombre || 'Dimensión'}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            onClick={expandAll}
            className="btn-sm text-xs border-gray-200 dark:border-gray-700/60 shrink-0"
          >
            Expandir todo
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="btn-sm text-xs border-gray-200 dark:border-gray-700/60 shrink-0"
          >
            Contraer todo
          </button>
        </div>
      )}

      {list.map((m) => {
        const id = dimensionKey(m);
        return (
          <div key={id} id={`eval-dim-${id}`}>
            <EvaluacionDimensionAccordion
              matrix={m}
              expanded={expanded.has(id)}
              onToggle={() => toggle(id)}
              valores={valores}
              onChange={onChange}
              disabled={disabled}
              previewMode={previewMode}
            />
          </div>
        );
      })}
    </div>
  );
}

export default EvaluacionMatrix;
