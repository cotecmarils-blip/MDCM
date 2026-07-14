import React, { useEffect, useMemo, useState } from 'react';
import TradeoffCharts from '../resultados/TradeoffCharts';
import SimulacionPiramideTree from './SimulacionPiramideTree';
import {
  buildSiblingComparisonFromResultado,
  listDimensionesFromResultado,
} from './simulacionNivelUtils';
import {
  comparisonGroupLabel,
  findPathToTraceNode,
  formatValor,
  resolveComparisonNodes,
  traceNodeKey,
} from './simulacionTraceUtils';

function SimulacionComparacionNivel({
  resultado,
  plotBgColor = '#f7f7ef',
  onPlotBgColorChange,
}) {
  const dimensiones = useMemo(
    () => listDimensionesFromResultado(resultado),
    [resultado],
  );
  const [dimId, setDimId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedAltId, setSelectedAltId] = useState(null);

  const trace = useMemo(() => {
    const alt = resultado?.alternativas?.[0];
    if (!alt || dimId == null) return null;
    return alt.dimensiones?.find((d) => d.omoe_id === dimId)?.detalle?.trace ?? null;
  }, [resultado, dimId]);

  useEffect(() => {
    if (dimensiones.length && !dimensiones.some((d) => d.id === dimId)) {
      setDimId(dimensiones[0].id);
    }
  }, [dimensiones, dimId]);

  useEffect(() => {
    if (!trace) {
      setSelectedNode(null);
      setSelectedKey(null);
      return;
    }
    const key = traceNodeKey(trace, 'dim');
    setSelectedNode(trace);
    setSelectedKey(key);
  }, [trace, dimId]);

  const comparisonNodes = useMemo(
    () => resolveComparisonNodes(selectedNode, trace),
    [selectedNode, trace],
  );

  const groupLabel = useMemo(
    () => comparisonGroupLabel(selectedNode, comparisonNodes, trace),
    [selectedNode, comparisonNodes, trace],
  );

  const breadcrumb = useMemo(() => {
    if (!trace || !selectedNode?.nodo_id) return [];
    return findPathToTraceNode(trace, selectedNode.nodo_id) || [];
  }, [trace, selectedNode]);

  const chartData = useMemo(
    () => buildSiblingComparisonFromResultado(resultado, dimId, comparisonNodes),
    [resultado, dimId, comparisonNodes],
  );

  const sortedPuntos = useMemo(() => {
    const pts = [...chartData.puntos];
    pts.sort(
      (a, b) => (a.ranking ?? 999) - (b.ranking ?? 999) || b.overall - a.overall,
    );
    return pts;
  }, [chartData.puntos]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedAltId && sortedPuntos.some((p) => p.id === selectedAltId)) {
      return selectedAltId;
    }
    return sortedPuntos[0]?.id ?? null;
  }, [selectedAltId, sortedPuntos]);

  const selected = sortedPuntos.find((p) => p.id === effectiveSelectedId);
  const fmt = (val) => (val == null ? '—' : Number(val).toFixed(4));

  const handleSelectNode = (node, key) => {
    setSelectedNode(node);
    setSelectedKey(key);
  };

  if (!dimensiones.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
        No hay dimensiones con trace de cálculo en este resultado.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Navegue el árbol y compare alternativas solo entre{' '}
        <strong>nodos hermanos</strong> (mismo padre en la rama). Los valores provienen
        del rollup ya calculado; no se mezclan ramas ni dimensiones distintas.
        {chartData.aplicarPareto && (
          <span className="text-amber-700 dark:text-amber-400">
            {' '}
            Solo alternativas del frente Pareto.
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs text-gray-500">
          Dimensión
          <select
            value={dimId ?? ''}
            onChange={(e) => setDimId(Number(e.target.value))}
            className="form-select text-sm ml-1 min-w-[12rem]"
          >
            {dimensiones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
        {breadcrumb.length > 0 && (
          <nav
            className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-1 min-w-0"
            aria-label="Ruta en el árbol"
          >
            {breadcrumb.map((crumb, i) => (
              <span key={`${crumb.nodo_id}-${i}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">›</span>}
                <span className={i === breadcrumb.length - 1 ? 'font-medium text-navy-700 dark:text-navy-300' : ''}>
                  {crumb.nombre}
                </span>
              </span>
            ))}
          </nav>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4 rounded-xl border border-gray-200 dark:border-navy-800/80 bg-white dark:bg-navy-900 overflow-hidden flex flex-col min-h-[260px] max-h-[420px]">
          <div className="text-xs font-semibold uppercase text-gray-400 px-3 py-2 border-b border-gray-100 dark:border-gray-800/80 shrink-0">
            Árbol de la dimensión
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <SimulacionPiramideTree
              trace={trace}
              selectedKey={selectedKey}
              onSelect={handleSelectNode}
            />
          </div>
        </div>

        <div className="xl:col-span-8 space-y-4">
          {comparisonNodes.length < 2 ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-200">
              Seleccione un nodo con al menos <strong>dos hijos o hermanos</strong> en la
              misma rama para comparar alternativas (por ejemplo, un grupo de afinidad o
              la raíz de la dimensión).
            </div>
          ) : (
            <>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {groupLabel}
                {' · '}
                {comparisonNodes.length} criterio(s) en comparación
              </p>

              <TradeoffCharts
                key={`nivel-${dimId}-${comparisonNodes.map((n) => n.nodo_id).join('-')}-${plotBgColor}`}
                puntos={sortedPuntos}
                selectedId={effectiveSelectedId}
                onSelect={setSelectedAltId}
                chartDimensions={chartData.chartDimensions}
                madmLabel="Utilidad en nodo"
                plotBgColor={plotBgColor}
                onPlotBgColorChange={onPlotBgColorChange}
              />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-navy-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-navy-800">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Alt.</th>
                        <th className="px-4 py-3 text-left font-semibold">Alternativa</th>
                        {chartData.columns.map((col) => (
                          <th key={col.nodo_id} className="px-4 py-3 text-right font-semibold">
                            <span className="block truncate max-w-[8rem]" title={col.nombre}>
                              {col.nombre}
                            </span>
                            {col.level_label && (
                              <span className="block text-[10px] font-normal text-gray-400 truncate">
                                {col.level_label}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPuntos.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedAltId(p.id)}
                          className={`border-t border-gray-100 dark:border-navy-800 cursor-pointer ${
                            p.id === effectiveSelectedId
                              ? 'bg-navy-50 dark:bg-navy-800/60'
                              : 'hover:bg-gray-50 dark:hover:bg-navy-900'
                          }`}
                        >
                          <td className="px-4 py-2 font-bold">{p.label}</td>
                          <td className="px-4 py-2">{p.nombre}</td>
                          {chartData.columns.map((col) => (
                            <td key={col.nodo_id} className="px-4 py-2 text-right tabular-nums">
                              {fmt(p.valores?.[col.nodo_id])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selected && (
                  <div className="rounded-lg border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 p-4">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                      {selected.label} — {selected.nombre}
                    </h4>
                    <p className="text-xs text-gray-500 mb-3">{groupLabel}</p>
                    <dl className="space-y-2 text-sm">
                      {chartData.columns.map((col) => (
                        <div key={col.nodo_id} className="flex justify-between gap-2">
                          <dt className="text-gray-500 truncate" title={col.nombre}>
                            {col.nombre}
                          </dt>
                          <dd className="font-medium tabular-nums shrink-0">
                            {fmt(selected.valores?.[col.nodo_id])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-[11px] text-gray-400 mt-3 border-t border-gray-100 dark:border-navy-800 pt-2">
                      Estos valores son parciales en la rama. El ranking global combina
                      todo el árbol con pesos TOPSIS/MADM.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {comparisonNodes.length === 1 && selectedNode && (
            <p className="text-xs text-gray-500">
              Nodo único en este nivel: {formatValor(comparisonNodes[0].valor)} (
              {comparisonNodes[0].nombre}). Suba un nivel o elija un nodo con más hermanos.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default SimulacionComparacionNivel;
