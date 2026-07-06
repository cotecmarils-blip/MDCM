import React, { useMemo, useState, useEffect } from 'react';
import SimulacionPiramideTree from './SimulacionPiramideTree';
import SimulacionRecibo from './SimulacionRecibo';
import { flattenAuditLines, formatValor, traceNodeKey } from './simulacionTraceUtils';

function SimulacionAnalisis({ resultado, initialAltId = null }) {
  const alternativas = useMemo(() => resultado?.alternativas || [], [resultado?.alternativas]);
  const [altId, setAltId] = useState(initialAltId ?? alternativas[0]?.id ?? null);
  const [dimId, setDimId] = useState(null);
  const [view, setView] = useState('piramide');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [showGlobal, setShowGlobal] = useState(false);

  const alt = useMemo(
    () => alternativas.find((a) => a.id === altId) || alternativas[0],
    [alternativas, altId],
  );

  const dimensiones = useMemo(() => alt?.dimensiones || [], [alt?.dimensiones]);

  useEffect(() => {
    if (initialAltId != null) setAltId(initialAltId);
  }, [initialAltId]);

  useEffect(() => {
    if (dimensiones.length && !dimensiones.some((d) => d.omoe_id === dimId)) {
      setDimId(dimensiones[0].omoe_id);
    }
  }, [dimensiones, dimId]);

  const dim = useMemo(
    () => dimensiones.find((d) => d.omoe_id === dimId) || dimensiones[0],
    [dimensiones, dimId],
  );

  const trace = dim?.detalle?.trace;

  useEffect(() => {
    if (trace) {
      const key = traceNodeKey(trace, 'dim');
      setSelectedNode(trace);
      setSelectedKey(key);
      setShowGlobal(false);
    }
  }, [trace, altId, dimId]);

  const auditLines = useMemo(() => flattenAuditLines(trace), [trace]);

  const handleSelectNode = (node, key) => {
    setSelectedNode(node);
    setSelectedKey(key);
    setShowGlobal(false);
  };

  const handleAuditClick = (line) => {
    setSelectedKey(line.key);
    setShowGlobal(false);
    const findInTrace = (t, targetName) => {
      if (!t) return null;
      if (t.nombre === line.nombre && t.kind === line.kind) return t;
      for (const h of t.hijos || []) {
        const child = h.trace || h;
        const found = findInTrace(child, targetName);
        if (found) return found;
      }
      return null;
    };
    setSelectedNode(findInTrace(trace, line.nombre) || trace);
  };

  if (!alternativas.length) return null;

  return (
    <div className="mt-8 border-t border-gray-200 dark:border-gray-700/60 pt-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
            Análisis del cálculo
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-2xl">
            Pirámide de rollup por dimensión: hoja → escenarios → agregación ponderada hacia la raíz.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowGlobal(true);
            setSelectedNode(null);
            setSelectedKey('global');
          }}
          className="btn-sm border-gray-200 dark:border-gray-700/60 text-xs"
        >
          Ver valor global ({formatValor(alt?.valor_global)})
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-gray-500">
          Alternativa
          <select
            value={alt?.id ?? ''}
            onChange={(e) => setAltId(Number(e.target.value))}
            className="form-select text-sm ml-1 min-w-[10rem]"
          >
            {alternativas.map((a) => (
              <option key={a.id} value={a.id}>
                #{a.ranking} {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Dimensión
          <select
            value={dim?.omoe_id ?? ''}
            onChange={(e) => setDimId(Number(e.target.value))}
            className="form-select text-sm ml-1 min-w-[10rem]"
          >
            {dimensiones.map((d) => (
              <option key={d.omoe_id} value={d.omoe_id}>
                {d.omoe_nombre} ({formatValor(d.valor)})
              </option>
            ))}
          </select>
        </label>
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700/60 p-0.5 bg-gray-50 dark:bg-navy-900/40 self-end">
          <button
            type="button"
            onClick={() => setView('piramide')}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
              view === 'piramide'
                ? 'bg-white dark:bg-navy-800 shadow-sm text-navy-700 dark:text-navy-200'
                : 'text-gray-500'
            }`}
          >
            Pirámide
          </button>
          <button
            type="button"
            onClick={() => setView('auditoria')}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
              view === 'auditoria'
                ? 'bg-white dark:bg-navy-800 shadow-sm text-navy-700 dark:text-navy-200'
                : 'text-gray-500'
            }`}
          >
            Auditoría
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-[280px]">
        <div className="rounded-xl border border-gray-200 dark:border-navy-800/80 bg-white dark:bg-navy-900 overflow-hidden flex flex-col min-h-[240px]">
          <div className="text-xs font-semibold uppercase text-gray-400 px-3 py-2 border-b border-gray-100 dark:border-gray-800/80 shrink-0">
            {view === 'piramide' ? 'Pirámide de valores' : 'Auditoría lineal'}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {view === 'piramide' ? (
              <SimulacionPiramideTree
                trace={trace}
                selectedKey={selectedKey}
                onSelect={handleSelectNode}
              />
            ) : (
              <ul className="p-2 space-y-0.5">
                {auditLines.map((line) => (
                  <li key={line.key}>
                    <button
                      type="button"
                      onClick={() => handleAuditClick(line)}
                      className={`w-full text-left rounded-lg px-2 py-1.5 text-xs transition ${
                        selectedKey === line.key
                          ? 'bg-navy-500/15 ring-1 ring-navy-500/40'
                          : 'hover:bg-gray-50 dark:hover:bg-navy-800/40'
                      }`}
                      style={{ paddingLeft: `${8 + line.depth * 12}px` }}
                    >
                      <span className="text-gray-400 uppercase mr-2">{line.levelLabel}</span>
                      <span className="font-medium">{line.nombre}</span>
                      <span className="float-right font-mono font-bold text-navy-600 dark:text-navy-400">
                        {formatValor(line.valor)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-navy-800/80 bg-white dark:bg-navy-900 overflow-hidden flex flex-col min-h-[240px]">
          <div className="text-xs font-semibold uppercase text-gray-400 px-3 py-2 border-b border-gray-100 dark:border-gray-800/80 shrink-0">
            Recibo de cálculo
          </div>
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <SimulacionRecibo
              node={showGlobal ? null : selectedNode}
              globalTrace={showGlobal ? alt?.global_trace : null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SimulacionAnalisis;
