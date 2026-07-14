import {
  ESCENARIO_AGREG_COMPENSATORIO,
  getEscenarioAgregacionLabel,
} from '../criterios/escenarioAgregacionConstants';

/** Filas «alternativa × dimensión → escenario elegido» para el resumen global. */
export function buildEscenarioResumenRows(alternativas = []) {
  const rows = [];
  alternativas.forEach((alt) => {
    (alt.dimensiones || []).forEach((dim) => {
      const resumen = dim.escenarios_resumen || dim.detalle?.escenario_resumen;
      const escenario = dim.escenario_elegido || resumen?.escenario_elegido;
      if (!escenario) return;
      rows.push({
        alternativaId: alt.id,
        alternativa: alt.nombre,
        ranking: alt.ranking,
        excluidaPareto: Boolean(alt.excluida_pareto),
        omoeId: dim.omoe_id,
        dimension: dim.omoe_nombre,
        escenario,
        valor: resumen?.valor_bajo_escenario ?? dim.valor,
        agregacion: dim.escenario_agregacion || resumen?.escenario_agregacion,
        porEscenario: resumen?.por_escenario || [],
      });
    });
  });
  return rows;
}

export function hasEscenarioResumen(resultado) {
  return buildEscenarioResumenRows(resultado?.alternativas).length > 0;
}

export function escenarioResumenLabel(agregacion) {
  if (!agregacion || agregacion === ESCENARIO_AGREG_COMPENSATORIO) {
    return 'Compensatorio';
  }
  return getEscenarioAgregacionLabel(agregacion);
}
