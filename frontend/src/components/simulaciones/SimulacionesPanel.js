import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { simulacionApi, alternativas as alternativasApi } from '../../api';
import SplitColumnLayout from '../../layout/SplitColumnLayout';
import SimulacionAnalisis from './SimulacionAnalisis';
import SimulacionHistorialSidebar from './SimulacionHistorialSidebar';
import SimulacionWizard from './SimulacionWizard';
import SimulacionOpcionesDropdown from './SimulacionOpcionesDropdown';
import SimulacionResumenGlobal from './SimulacionResumenGlobal';
import SimulacionPipelineTrazabilidad from './SimulacionPipelineTrazabilidad';
import SimulacionGraficosCalculo from './SimulacionGraficosCalculo';
import SimulacionSensibilidadCalculo from './SimulacionSensibilidadCalculo';
import SimulacionExportButtons from './SimulacionExportButtons';
import SimulacionResultadoTabs from './SimulacionResultadoTabs';
import { useSimulacionPlotBg } from './simulacionPlotBg';
import { validatePesosDimensionesPercent } from '../../utils/pesoUtils';
import { createEmptyCalcConfig, buildPreviewPayload, dimensionesSeleccionadas } from './simulacionWizardSteps';
import { parseParetoEpsilonInput, PARETO_EPSILON_VALIDATION_MSG } from './paretoEpsilonUtils';
import { MODAL_BACKDROP_CLASS } from '../../utils/modalBackdrop';

const TIPO_LABELS = {
  valor_evaluacion: 'Valor en evaluación',
  constante: 'Constante del criterio',
  peso: 'Peso',
  configuracion: 'Configuración',
};

function SimulacionResultados({
  resultado,
  proyectoId,
  analisisAltId,
  setAnalisisAltId,
  analisisRef,
  esHistorial,
  showGraficos = false,
}) {
  const [vistaCalculo, setVistaCalculo] = useState('resultados');
  const { plotBgColor, handlePlotBgColorChange } = useSimulacionPlotBg();

  useEffect(() => {
    setVistaCalculo('resultados');
  }, [resultado?.historial_id, resultado?.titulo_historial]);

  if (!resultado?.ok) return null;

  const soloMatriz = Boolean(resultado.solo_matriz);
  const tabsDisponibles = soloMatriz
    ? ['resultados', 'graficos']
    : ['resultados', 'graficos', 'sensibilidad'];
  const vistaGraficos = showGraficos && vistaCalculo === 'graficos';
  const vistaSensibilidad = showGraficos && !soloMatriz && vistaCalculo === 'sensibilidad';

  return (
    <div className="space-y-6">
      {esHistorial && (
        <p className="text-xs text-navy-600 dark:text-navy-400 font-medium">
          {resultado.titulo_historial || 'Cálculo guardado'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-0">
            {resultado.descripcion}
          </p>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {showGraficos && !soloMatriz && <SimulacionExportButtons resultado={resultado} />}
            {!soloMatriz && <SimulacionOpcionesDropdown resultado={resultado} />}
          </div>
        </div>

        {showGraficos && (
          <SimulacionResultadoTabs
            activeTab={vistaCalculo}
            onChange={setVistaCalculo}
            tabs={tabsDisponibles}
          />
        )}
      </div>

      {vistaGraficos ? (
        <SimulacionGraficosCalculo
          resultado={resultado}
          soloMatriz={soloMatriz}
          plotBgColor={plotBgColor}
          onPlotBgColorChange={handlePlotBgColorChange}
        />
      ) : vistaSensibilidad ? (
        <SimulacionSensibilidadCalculo
          proyectoId={proyectoId}
          resultado={resultado}
          plotBgColor={plotBgColor}
          onPlotBgColorChange={handlePlotBgColorChange}
        />
      ) : soloMatriz ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
            Matriz de utilidades por dimensión
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Valores agregados desde el árbol de criterios por alternativa. Comparación solo con
            matriz de utilidades (sin normalización, Pareto ni ranking MADM).
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-navy-900/60">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Alternativa</th>
                  {resultado.alternativas[0]?.dimensiones?.map((d) => (
                    <th
                      key={d.omoe_id}
                      className="px-3 py-2 text-left font-semibold text-gray-500"
                    >
                      {d.omoe_nombre}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Utilidad media</th>
                </tr>
              </thead>
              <tbody>
                {resultado.alternativas.map((alt) => (
                  <tr
                    key={alt.id}
                    className="border-t border-gray-100 dark:border-gray-800/80"
                  >
                    <td className="px-3 py-2 font-medium">{alt.nombre}</td>
                    {alt.dimensiones.map((d) => (
                      <td key={d.omoe_id} className="px-3 py-2 font-mono">
                        {d.valor?.toFixed(4)}
                        {d.escenario_elegido && (
                          <span
                            className="block text-[10px] font-sans text-gray-400 dark:text-gray-500 truncate max-w-[8rem]"
                            title={`Escenario: ${d.escenario_elegido}`}
                          >
                            «{d.escenario_elegido}»
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 font-mono font-semibold text-navy-600">
                      {alt.valor_global?.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <SimulacionResumenGlobal resultado={resultado} />

          <SimulacionPipelineTrazabilidad resultado={resultado} />

          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
              Utilidades por dimensión (entrada al análisis)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Valores agregados desde el árbol de criterios por alternativa, antes de Pareto y MADM.
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-navy-900/60">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Ranking MADM</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Alternativa</th>
                  {resultado.alternativas[0]?.dimensiones?.map((d) => (
                    <th
                      key={d.omoe_id}
                      className="px-3 py-2 text-left font-semibold text-gray-500"
                    >
                      {d.omoe_nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultado.alternativas.map((alt) => (
                  <tr
                    key={alt.id}
                    onClick={() => {
                      setAnalisisAltId(alt.id);
                      analisisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="border-t border-gray-100 dark:border-gray-800/80 cursor-pointer hover:bg-navy-500/5 transition"
                  >
                    <td className="px-3 py-2 font-bold text-navy-600">
                      {alt.excluida_pareto ? '���' : alt.ranking}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {alt.nombre}
                      {alt.excluida_pareto && (
                        <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                          (dominada)
                        </span>
                      )}
                    </td>
                    {alt.dimensiones.map((d) => (
                      <td key={d.omoe_id} className="px-3 py-2 font-mono">
                        {d.valor?.toFixed(4)}
                        {d.escenario_elegido && (
                          <span
                            className="block text-[10px] font-sans text-gray-400 dark:text-gray-500 truncate max-w-[8rem]"
                            title={`Escenario: ${d.escenario_elegido}`}
                          >
                            «{d.escenario_elegido}»
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <p className="text-[10px] text-gray-400">
            Clic en una fila para abrir el análisis detallado del cálculo.
          </p>
          <div ref={analisisRef}>
            <SimulacionAnalisis resultado={resultado} initialAltId={analisisAltId} />
          </div>
        </>
      )}
    </div>
  );
}

function SimulacionesPanel({ proyectoId, canWrite = true }) {
  const [loading, setLoading] = useState(false);
  const [faltantes, setFaltantes] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [validacionOkOpen, setValidacionOkOpen] = useState(false);
  const [analisisAltId, setAnalisisAltId] = useState(null);
  const [historialItems, setHistorialItems] = useState([]);
  const [historialLoading, setHistorialLoading] = useState(true);
  const [selectedHistorialId, setSelectedHistorialId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [opcionesMeta, setOpcionesMeta] = useState(null);
  const [apodoById, setApodoById] = useState({});
  const [calcConfig, setCalcConfig] = useState(null);
  const [stepError, setStepError] = useState(null);
  const [wizardKey, setWizardKey] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [historialCollapsed, setHistorialCollapsed] = useState(() => {
    try {
      return localStorage.getItem('MCDM.simulaciones.historialCollapsed') === '1';
    } catch {
      return false;
    }
  });
  const analisisRef = useRef(null);

  const showConfigPanel = canWrite && !selectedHistorialId && wizardOpen;

  const loadHistorial = useCallback(async () => {
    try {
      setHistorialLoading(true);
      const res = await simulacionApi.listHistorial(proyectoId);
      setHistorialItems(res.data?.items || []);
    } catch {
      setHistorialItems([]);
    } finally {
      setHistorialLoading(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    loadHistorial();
  }, [loadHistorial]);

  useEffect(() => {
    let cancelled = false;
    alternativasApi
      .getByProyecto(proyectoId)
      .then((res) => {
        if (cancelled) return;
        const map = {};
        (res.data || []).forEach((alt) => {
          map[alt.id] = alt.apodo || '';
        });
        setApodoById(map);
      })
      .catch(() => {
        if (!cancelled) setApodoById({});
      });
    return () => {
      cancelled = true;
    };
  }, [proyectoId]);

  useEffect(() => {
    try {
      localStorage.setItem('MCDM.simulaciones.historialCollapsed', historialCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [historialCollapsed]);

  useEffect(() => {
    let cancelled = false;
    simulacionApi
      .getOpciones(proyectoId)
      .then((res) => {
        if (!cancelled) {
          setOpcionesMeta(res.data);
          const dims = res.data?.dimensiones || [];
          setCalcConfig(createEmptyCalcConfig(dims, res.data?.defaults || {}));
        }
      })
      .catch(() => {
        if (!cancelled) setOpcionesMeta({ dimensiones: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [proyectoId]);

  useEffect(() => {
    if (!showConfigPanel) return;
    setStepError(null);
  }, [showConfigPanel]);

  const loadHistorialItem = useCallback(async (historialId) => {
    try {
      setLoading(true);
      setError(null);
      setFaltantes([]);
      const res = await simulacionApi.getHistorial(proyectoId, historialId);
      setSelectedHistorialId(historialId);
      setResultado({
        ...res.data.resultado,
        titulo_historial: res.data.nombre || res.data.titulo,
        historial_id: res.data.id,
      });
      setAnalisisAltId(null);
    } catch {
      setError('No se pudo cargar el cálculo seleccionado.');
    } finally {
      setLoading(false);
    }
  }, [proyectoId]);

  const buildOpcionesPayload = useCallback(() => {
    if (!calcConfig) return {};
    if (calcConfig.solo_matriz) {
      return {
        nombre_calculo: (calcConfig.nombre_calculo || '').trim(),
        solo_matriz: true,
        dimensiones_normalizar: calcConfig.dimensiones_normalizar,
      };
    }
    const allDims = opcionesMeta?.dimensiones || [];
    const activas = dimensionesSeleccionadas(allDims, calcConfig);
    const payload = {
      nombre_calculo: (calcConfig.nombre_calculo || '').trim(),
      aplicar_pareto: calcConfig.aplicar_pareto,
      normalizacion_metodo: calcConfig.normalizacion_metodo,
      dimensiones_normalizar: calcConfig.dimensiones_normalizar,
      direcciones: calcConfig.direcciones || {},
      metodo_pesos: calcConfig.metodo_pesos,
      metodo_madm: calcConfig.metodo_madm,
    };
    const epsilonCheck = parseParetoEpsilonInput(calcConfig.pareto_epsilon);
    if (epsilonCheck.ok) {
      payload.pareto_epsilon = epsilonCheck.value;
    }
    if (calcConfig.metodo_pesos === 'user_defined_weights') {
      const pesosActivos = activas.map((dim) => {
        const idx = allDims.findIndex((d) => d.omoe_id === dim.omoe_id);
        return idx >= 0 ? (calcConfig.pesos_usuario || [])[idx] : '';
      });
      const check = validatePesosDimensionesPercent(pesosActivos, activas.length);
      if (check.ok) {
        payload.pesos_usuario = check.values;
      }
    }
    return payload;
  }, [calcConfig, opcionesMeta?.dimensiones]);

  const previewPayload = useMemo(
    () => buildPreviewPayload(calcConfig, opcionesMeta?.dimensiones || []),
    [calcConfig, opcionesMeta?.dimensiones],
  );

  const executeCalcular = useCallback(async () => {
    if (!calcConfig?.nombre_calculo?.trim()) {
      setStepError('Escriba un nombre para el cálculo.');
      return false;
    }
    if (calcConfig.solo_matriz) {
      if (!calcConfig?.dimensiones_normalizar?.length) {
        setStepError('Seleccione al menos una dimensión para la comparación.');
        return false;
      }
    } else {
      if (calcConfig.aplicar_pareto === null || calcConfig.aplicar_pareto === undefined) {
        setStepError('Seleccione si desea aplicar el filtro Pareto.');
        return false;
      }
      const epsilonCheck = parseParetoEpsilonInput(calcConfig.pareto_epsilon);
      if (!epsilonCheck.ok) {
        setStepError(epsilonCheck.message || PARETO_EPSILON_VALIDATION_MSG);
        return false;
      }
      if (!calcConfig?.dimensiones_normalizar?.length) {
        setStepError('Seleccione al menos una dimensión para el cálculo.');
        return false;
      }
      if (!calcConfig.normalizacion_metodo) {
        setStepError('Seleccione un método de normalización.');
        return false;
      }
      if (!calcConfig.metodo_pesos) {
        setStepError('Seleccione un método de cálculo de pesos.');
        return false;
      }
      if (calcConfig.metodo_pesos === 'user_defined_weights') {
        const allDims = opcionesMeta?.dimensiones || [];
        const activas = dimensionesSeleccionadas(allDims, calcConfig);
        const pesosActivos = activas.map((dim) => {
          const idx = allDims.findIndex((d) => d.omoe_id === dim.omoe_id);
          return idx >= 0 ? (calcConfig.pesos_usuario || [])[idx] : '';
        });
        const pesosCheck = validatePesosDimensionesPercent(pesosActivos, activas.length);
        if (!pesosCheck.ok) {
          setStepError(pesosCheck.message || 'Los pesos por dimensión deben sumar 100 %.');
          return false;
        }
      }
      if (!calcConfig.metodo_madm) {
        setStepError('Seleccione un método MADM de ranking.');
        return false;
      }
    }
    try {
      setLoading(true);
      setStepError(null);
      setError(null);
      setResultado(null);
      setSelectedHistorialId(null);
      const res = await simulacionApi.calcular(proyectoId, buildOpcionesPayload());
      setFaltantes([]);
      setResultado({
        ...res.data,
        historial_id: res.data?.historial_id,
        titulo_historial: calcConfig.nombre_calculo?.trim() || res.data?.titulo_historial,
      });
      setWizardOpen(false);
      if (res.data?.historial_id) {
        setSelectedHistorialId(res.data.historial_id);
        await loadHistorial();
      }
      return true;
    } catch (err) {
      const data = err.response?.data;
      if (data?.faltantes?.length) {
        setFaltantes(data.faltantes);
        setResultado(null);
        setError(
          `Faltan ${data.total_faltantes} dato(s) para calcular. Revise el listado.`,
        );
      } else {
        setStepError(data?.detail || 'No se pudo guardar el cálculo.');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [proyectoId, loadHistorial, calcConfig, buildOpcionesPayload, opcionesMeta?.dimensiones]);

  const handleCancelarCalculo = useCallback(() => {
    setWizardOpen(false);
    setSelectedHistorialId(null);
    setResultado(null);
    setError(null);
    setFaltantes([]);
    setStepError(null);
    setAnalisisAltId(null);
    const dims = opcionesMeta?.dimensiones || [];
    setCalcConfig(createEmptyCalcConfig(dims));
    setWizardKey((k) => k + 1);
  }, [opcionesMeta?.dimensiones]);

  const handleNuevoCalculo = useCallback(() => {
    setWizardOpen(true);
    setSelectedHistorialId(null);
    setResultado(null);
    setError(null);
    setFaltantes([]);
    setStepError(null);
    setAnalisisAltId(null);
    const dims = opcionesMeta?.dimensiones || [];
    setCalcConfig(createEmptyCalcConfig(dims));
    setWizardKey((k) => k + 1);
  }, [opcionesMeta?.dimensiones]);

  const handleValidar = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await simulacionApi.validar(proyectoId);
      if (res.data.ok) {
        setFaltantes([]);
        setError(null);
        setResultado(null);
        setValidacionOkOpen(true);
      } else {
        setFaltantes(res.data.faltantes || []);
        setError(`Faltan ${res.data.total_faltantes} dato(s).`);
      }
    } catch {
      setError('No se pudo validar.');
    } finally {
      setLoading(false);
    }
  }, [proyectoId]);

  const handleDeleteHistorial = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await simulacionApi.deleteHistorial(proyectoId, deleteTarget.id);
      if (selectedHistorialId === deleteTarget.id) {
        setSelectedHistorialId(null);
        setResultado(null);
      }
      await loadHistorial();
    } catch {
      setError('No se pudo eliminar el cálculo.');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, proyectoId, selectedHistorialId, loadHistorial]);

  const headerAction = (
    <div className="flex gap-2 shrink-0">
      <button
        type="button"
        onClick={handleValidar}
        disabled={loading}
        className="btn border-gray-200 dark:border-gray-700/60 text-sm disabled:opacity-50"
      >
        Validar datos
      </button>
      {canWrite && (
        <button
          type="button"
          onClick={showConfigPanel ? handleCancelarCalculo : handleNuevoCalculo}
          disabled={loading}
          className={`btn text-sm disabled:opacity-50 ${
            showConfigPanel
              ? 'border-gray-200 dark:border-gray-700/60'
              : 'btn-primary'
          }`}
        >
          {showConfigPanel ? 'Cancelar' : 'Nuevo cálculo'}
        </button>
      )}
    </div>
  );

  const showGraficosCalculo = Boolean(selectedHistorialId && resultado?.ok);

  const resultadoConApodos = useMemo(() => {
    if (!resultado?.alternativas?.length) return resultado;
    if (!apodoById || Object.keys(apodoById).length === 0) return resultado;
    return {
      ...resultado,
      alternativas: resultado.alternativas.map((alt) => (
        apodoById[alt.id] != null ? { ...alt, apodo: apodoById[alt.id] } : alt
      )),
    };
  }, [resultado, apodoById]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <SplitColumnLayout
        title="Módulo de Simulaciones"
        description="Configure el cálculo paso a paso; al final guárdelo en el historial."
        headerAction={headerAction}
        leftLabel="Historial"
        rightLabel={showConfigPanel ? 'Nuevo cálculo' : resultado?.ok ? 'Cálculo guardado' : 'Resultado'}
        leftWidthClass="lg:w-52 xl:w-56"
        leftCollapsible
        leftCollapsed={historialCollapsed}
        onLeftCollapsedChange={setHistorialCollapsed}
        leftCollapsedBadge={historialItems.length || null}
        left={
          <SimulacionHistorialSidebar
            items={historialItems}
            selectedId={selectedHistorialId}
            loading={historialLoading}
            onSelect={loadHistorialItem}
            onDelete={setDeleteTarget}
            canDelete={canWrite}
          />
        }
        right={(
          <>
            {error && (
              <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                {error}
              </div>
            )}

            {faltantes.length > 0 && (
              <div className="mb-6 flex flex-col">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                  Información faltante ({faltantes.length})
                </h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/60">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-navy-900/60">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Tipo</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Alternativa</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Dimensión</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Escenario</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Criterio</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Detalle</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Ir a</th>
                      </tr>
                    </thead>
                    <tbody>
                      {faltantes.map((f, idx) => (
                        <tr
                          key={`${f.tipo}-${idx}`}
                          className="border-t border-gray-100 dark:border-gray-800/80"
                        >
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {TIPO_LABELS[f.tipo] || f.tipo}
                          </td>
                          <td className="px-3 py-2">{f.alternativa_nombre || '���'}</td>
                          <td className="px-3 py-2">{f.dimension || '���'}</td>
                          <td className="px-3 py-2">{f.escenario || '���'}</td>
                          <td className="px-3 py-2">{f.criterio || '���'}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{f.detalle}</td>
                          <td className="px-3 py-2 text-xs text-navy-600 dark:text-navy-400">
                            {f.modulo || '���'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {showConfigPanel && (
              <div className="mb-6">
                <SimulacionWizard
                  key={wizardKey}
                  proyectoId={proyectoId}
                  opcionesMeta={opcionesMeta}
                  calcConfig={calcConfig}
                  onChange={setCalcConfig}
                  loading={loading}
                  stepError={stepError}
                  onStepError={setStepError}
                  previewPayload={previewPayload}
                  onExecute={executeCalcular}
                />
              </div>
            )}

            {resultado?.ok && (
              <SimulacionResultados
                proyectoId={proyectoId}
                resultado={resultadoConApodos}
                analisisAltId={analisisAltId}
                setAnalisisAltId={setAnalisisAltId}
                analisisRef={analisisRef}
                esHistorial={Boolean(selectedHistorialId)}
                showGraficos={showGraficosCalculo}
              />
            )}

            {!loading && !resultado && !showConfigPanel && faltantes.length === 0 && !error && (
              <p className="text-gray-500 dark:text-gray-400 text-center py-16">
                Seleccione un cálculo del historial o pulse{' '}
                <strong>Nuevo cálculo</strong> para configurar uno.
              </p>
            )}
          </>
        )}
      />

      {validacionOkOpen && (
        <div
          className={MODAL_BACKDROP_CLASS}
          role="dialog"
          aria-modal="true"
          aria-labelledby="simulacion-validacion-ok-title"
          onClick={() => setValidacionOkOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-md w-full border border-gray-200 dark:border-navy-800/80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2
                id="simulacion-validacion-ok-title"
                className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2"
              >
                Validación completada
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Todo listo: puede ejecutar un nuevo cálculo.
              </p>
              <div className="flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => setValidacionOkOpen(false)}
                  className="btn btn-primary text-sm"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className={MODAL_BACKDROP_CLASS}
          role="dialog"
          aria-modal="true"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-md w-full border border-gray-200 dark:border-navy-800/80 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
              Eliminar cálculo
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              ¿Eliminar{' '}
              <strong>{deleteTarget.nombre || deleteTarget.titulo || `cálculo #${deleteTarget.id}`}</strong>
              ? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="btn border-gray-200 dark:border-gray-700/60 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteHistorial}
                className="btn bg-red-600 hover:bg-red-700 text-white text-sm border-transparent"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SimulacionesPanel;
