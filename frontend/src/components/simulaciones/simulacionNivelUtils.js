import { getAlternativaChartLabel } from '../../utils/alternativaDisplay';
import { listDimensionesFromResultado } from './simulacionGraficosUtils';
import {
  findTraceNodeByNodoId,
  getTraceNodeValor,
} from './simulacionTraceUtils';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Construye puntos para gráficos comparando alternativas en nodos hermanos.
 * Reutiliza valores ya calculados en detalle.trace (sin recalcular).
 */
export function buildSiblingComparisonFromResultado(resultado, omoeId, comparisonNodes) {
  const alternativas = resultado?.alternativas || [];
  const aplicarPareto = Boolean(resultado?.opciones_calculo?.aplicar_pareto);
  const cols = (comparisonNodes || []).filter((n) => n.nodo_id != null);

  if (!cols.length) {
    return { puntos: [], chartDimensions: [], columns: [], aplicarPareto };
  }

  const puntos = alternativas.map((alt, idx) => {
    const dim = (alt.dimensiones || []).find((d) => d.omoe_id === omoeId);
    const trace = dim?.detalle?.trace;
    const valores = {};
    cols.forEach((col) => {
      const node = findTraceNodeByNodoId(trace, col.nodo_id);
      valores[col.nodo_id] = getTraceNodeValor(node);
    });
    return {
      id: alt.id,
      nombre: alt.nombre,
      apodo: alt.apodo || '',
      chartLabel: getAlternativaChartLabel(alt),
      label: LABELS[idx] || String(idx + 1),
      valores,
      overall: alt.score_madm ?? alt.valor_global ?? 0,
      ranking: alt.excluida_pareto ? null : alt.ranking,
      excluida_pareto: Boolean(alt.excluida_pareto),
    };
  });

  const paraGrafico = aplicarPareto
    ? puntos.filter((p) => !p.excluida_pareto)
    : puntos;

  const chartDimensions = cols.map((c) => ({
    key: String(c.nodo_id),
    label: c.nombre,
    get: (p) => p.valores?.[c.nodo_id] ?? null,
  }));

  return {
    puntos: paraGrafico.length ? paraGrafico : puntos,
    todosLosPuntos: puntos,
    chartDimensions,
    columns: cols,
    aplicarPareto,
  };
}

export { listDimensionesFromResultado };
