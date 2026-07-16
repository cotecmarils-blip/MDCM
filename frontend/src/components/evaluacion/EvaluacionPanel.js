import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { alternativas, evaluacionApi } from '../../api';
import SplitColumnLayout from '../../layout/SplitColumnLayout';
import EvaluacionMatrix from './EvaluacionMatrix';
import ExportablesDropdown from './ExportablesDropdown';
import { buildDimensionMatrices } from './evaluacionUtils';

function AlternativasEvalSidebar({ items, selectedId, onSelect, loading }) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 px-2">
            No hay alternativas. Créalas en el módulo Alternativas.
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const isActive = selectedId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    title={item.referencia ? `${item.nombre} — ${item.referencia}` : item.nombre}
                    className={`w-full text-left px-2.5 py-2 rounded-lg transition duration-150 ${
                      isActive
                        ? 'bg-gradient-to-r from-navy-500/[0.12] dark:from-navy-500/[0.24] to-navy-500/[0.04] text-navy-600 dark:text-navy-400'
                        : 'text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-navy-800/40'
                    }`}
                  >
                    <span className="font-medium text-sm block truncate leading-tight">{item.nombre}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function informeProyectoJobStorageKey(proyectoId) {
  return `mdcm:informe-proyecto-job:${proyectoId}`;
}

function EvaluacionPanel({ proyectoId, canWrite = true }) {
  const [alternativasList, setAlternativasList] = useState([]);
  const [schema, setSchema] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [valores, setValores] = useState({});
  const [loadingAlt, setLoadingAlt] = useState(true);
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [loadingValores, setLoadingValores] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);
  const [exportingCurvas, setExportingCurvas] = useState(false);
  const [exportingCurvasWord, setExportingCurvasWord] = useState(false);
  const [exportingCostos, setExportingCostos] = useState(false);
  const [exportingProyecto, setExportingProyecto] = useState(false);
  const [proyectoExportProgress, setProyectoExportProgress] = useState(null);
  const watchGenerationRef = useRef(0);

  const persistInformeJobId = useCallback((jobId) => {
    try {
      sessionStorage.setItem(informeProyectoJobStorageKey(proyectoId), String(jobId));
    } catch {
      /* ignore quota / private mode */
    }
  }, [proyectoId]);

  const clearPersistedInformeJobId = useCallback(() => {
    try {
      sessionStorage.removeItem(informeProyectoJobStorageKey(proyectoId));
    } catch {
      /* ignore */
    }
  }, [proyectoId]);

  const readPersistedInformeJobId = useCallback(() => {
    try {
      return sessionStorage.getItem(informeProyectoJobStorageKey(proyectoId));
    } catch {
      return null;
    }
  }, [proyectoId]);

  const downloadInformeProyectoBlob = useCallback(async (jobId) => {
    const res = await evaluacionApi.downloadInformeProyectoWord(proyectoId, jobId);
    const blob = res.data instanceof Blob
      ? res.data
      : new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    if (blob.type && blob.type.includes('json')) {
      const text = await blob.text();
      const parsed = JSON.parse(text);
      throw new Error(parsed.detail || 'No se pudo generar el informe de proyecto.');
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-proyecto-${proyectoId}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [proyectoId]);

  const watchInformeProyectoJob = useCallback(async (jobId, initialStatus = null) => {
    const generation = ++watchGenerationRef.current;
    const stillActive = () => generation === watchGenerationRef.current;

    persistInformeJobId(jobId);
    setExportingProyecto(true);
    setError(null);
    if (initialStatus) {
      setProyectoExportProgress({
        porcentaje: initialStatus.progreso ?? 0,
        etapa: initialStatus.etapa || 'Generando informe…',
      });
    } else {
      setProyectoExportProgress({ porcentaje: 0, etapa: 'Reanudando generación…' });
    }

    try {
      let statusData = initialStatus;
      if (!statusData || !['completed', 'error'].includes(statusData.estado)) {
        if (!statusData) {
          const { data } = await evaluacionApi.getInformeProyectoWordProgress(
            proyectoId,
            jobId,
          );
          if (!stillActive()) return;
          statusData = data;
          setProyectoExportProgress({
            porcentaje: data.progreso,
            etapa: data.etapa,
          });
        }

        while (!['completed', 'error'].includes(statusData.estado)) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (!stillActive()) return;
          const { data } = await evaluacionApi.getInformeProyectoWordProgress(
            proyectoId,
            jobId,
          );
          if (!stillActive()) return;
          statusData = data;
          setProyectoExportProgress({
            porcentaje: data.progreso,
            etapa: data.etapa,
          });
        }
      }

      if (!stillActive()) return;

      if (statusData.estado === 'error') {
        clearPersistedInformeJobId();
        throw new Error(statusData.error || 'No se pudo generar el informe de proyecto.');
      }

      await downloadInformeProyectoBlob(jobId);
      if (!stillActive()) return;
      clearPersistedInformeJobId();
    } catch (err) {
      if (!stillActive()) return;
      console.error(err);
      setError(err.message || 'No se pudo exportar el Word del proyecto.');
      clearPersistedInformeJobId();
    } finally {
      if (stillActive()) {
        setExportingProyecto(false);
        setProyectoExportProgress(null);
      }
    }
  }, [
    clearPersistedInformeJobId,
    downloadInformeProyectoBlob,
    persistInformeJobId,
    proyectoId,
  ]);

  // Al volver al módulo, restaurar la barra si el job sigue en curso.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: activo } = await evaluacionApi.getInformeProyectoWordActivo(proyectoId);
        if (cancelled) return;
        if (activo?.activo && activo.job_id) {
          await watchInformeProyectoJob(activo.job_id, activo);
          return;
        }
      } catch (err) {
        console.error(err);
      }

      const storedJobId = readPersistedInformeJobId();
      if (cancelled || !storedJobId) return;

      try {
        const { data } = await evaluacionApi.getInformeProyectoWordProgress(
          proyectoId,
          storedJobId,
        );
        if (cancelled) return;
        if (['pending', 'processing', 'completed'].includes(data.estado)) {
          await watchInformeProyectoJob(storedJobId, data);
        } else {
          clearPersistedInformeJobId();
        }
      } catch {
        clearPersistedInformeJobId();
      }
    })();

    return () => {
      cancelled = true;
      watchGenerationRef.current += 1;
    };
  }, [
    clearPersistedInformeJobId,
    proyectoId,
    readPersistedInformeJobId,
    watchInformeProyectoJob,
  ]);

  const handleExportCurvas = async () => {
    try {
      setExportingCurvas(true);
      const { data } = await evaluacionApi.exportCurvas(proyectoId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `curvas-utilidad-proyecto-${proyectoId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError('No se pudieron exportar las curvas de utilidad.');
    } finally {
      setExportingCurvas(false);
    }
  };

  const handleExportCurvasWord = async () => {
    try {
      setExportingCurvasWord(true);
      const res = await evaluacionApi.exportInformeCurvasWord(proyectoId);
      const blob = res.data instanceof Blob
        ? res.data
        : new Blob([res.data], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
      if (blob.type && blob.type.includes('json')) {
        const text = await blob.text();
        const parsed = JSON.parse(text);
        throw new Error(parsed.detail || 'No se pudo generar el informe de curvas.');
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe-curvas-utilidad-proyecto-${proyectoId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudo exportar el Word de curvas.');
    } finally {
      setExportingCurvasWord(false);
    }
  };

  const handleExportCostosWord = async () => {
    try {
      setExportingCostos(true);
      const res = await evaluacionApi.exportInformeCostosWord(proyectoId);
      const blob = res.data instanceof Blob
        ? res.data
        : new Blob([res.data], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
      if (blob.type && blob.type.includes('json')) {
        const text = await blob.text();
        const parsed = JSON.parse(text);
        throw new Error(parsed.detail || 'No se pudo generar el informe de costos.');
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe-costos-proyecto-${proyectoId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudo exportar el Word de costos (¿hay dimensión OMOC?).');
    } finally {
      setExportingCostos(false);
    }
  };

  const handleExportProyectoWord = async () => {
    if (exportingProyecto) return;
    try {
      setExportingProyecto(true);
      setProyectoExportProgress({ porcentaje: 0, etapa: 'Iniciando generación' });
      const { data: started } = await evaluacionApi.startInformeProyectoWord(proyectoId);
      await watchInformeProyectoJob(started.job_id, started);
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudo exportar el Word del proyecto.');
      setExportingProyecto(false);
      setProyectoExportProgress(null);
    }
  };

  const loadAlternativas = useCallback(async () => {
    try {
      setLoadingAlt(true);
      const res = await alternativas.getByProyecto(proyectoId);
      setAlternativasList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAlt(false);
    }
  }, [proyectoId]);

  const loadSchema = useCallback(async () => {
    try {
      setLoadingSchema(true);
      const res = await evaluacionApi.getSchema(proyectoId);
      setSchema(res.data);
    } catch (err) {
      console.error(err);
      setError('No se pudo cargar la matriz de evaluación.');
    } finally {
      setLoadingSchema(false);
    }
  }, [proyectoId]);

  const loadValores = useCallback(async (alternativaId) => {
    if (!alternativaId) {
      setValores({});
      return;
    }
    try {
      setLoadingValores(true);
      const res = await evaluacionApi.getValores(proyectoId, alternativaId);
      setValores(res.data.valores || {});
      setDirty(false);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar los valores de evaluación.');
    } finally {
      setLoadingValores(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    loadAlternativas();
    loadSchema();
  }, [loadAlternativas, loadSchema]);

  useEffect(() => {
    if (selectedId) loadValores(selectedId);
    else setValores({});
  }, [selectedId, loadValores]);

  const dimensionMatrices = useMemo(() => buildDimensionMatrices(schema), [schema]);
  const hasOmoc = useMemo(
    () => (schema?.dimensiones || []).some((d) => d.rama_evaluacion === 'omoc'),
    [schema],
  );

  const selectedAlt = alternativasList.find((a) => a.id === selectedId);

  const handleCellChange = (key, value) => {
    setValores((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      setSaving(true);
      const res = await evaluacionApi.saveValores(proyectoId, selectedId, valores);
      setValores(res.data.valores || {});
      setDirty(false);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar la evaluación.');
    } finally {
      setSaving(false);
    }
  };

  const rightContent = () => {
    if (loadingAlt || loadingSchema) {
      return (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-500" />
        </div>
      );
    }

    if (alternativasList.length === 0) {
      return (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center px-4">
          No hay alternativas en este proyecto. Créalas en el módulo{' '}
          <strong>Alternativas</strong> para diligenciar la evaluación.
        </p>
      );
    }

    if (!selectedId) {
      return (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center px-4">
          Selecciona una alternativa para diligenciar la variable <strong>x</strong> por criterio
          y misión.
        </p>
      );
    }

    if (loadingValores) {
      return (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-500" />
        </div>
      );
    }

    return (
      <div className="flex flex-col min-h-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 sticky top-0 z-20 bg-white dark:bg-navy-900 pb-2 mb-1 border-b border-gray-100 dark:border-gray-800/60">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 truncate">
              {selectedAlt?.nombre || 'Alternativa'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Valor ofertado (x) por criterio y escenario
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="btn btn-primary text-sm py-2 px-4 disabled:opacity-50 shrink-0"
            >
              {saving ? 'Guardando…' : 'Guardar evaluación'}
            </button>
          )}
        </div>

        <EvaluacionMatrix
          matrices={dimensionMatrices}
          valores={valores}
          onChange={handleCellChange}
          disabled={!canWrite}
        />

        {error && <p className="text-xs text-red-500 shrink-0">{error}</p>}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 pt-2 shrink-0">
        {hasOmoc ? (
          <p className="text-xs text-gray-600 dark:text-gray-400 max-w-xl leading-snug">
            Flujo de costos (OMOC): carga el valor <strong>x</strong> bruto por ítem;
            se suma sin curvas ni pesos de escenario. Use «Exportar costos (Word)»
            para el informe OMOC (escenario Estandar y desglose por ítem).
          </p>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <ExportablesDropdown
            label={
              exportingProyecto
                ? `Generando ${proyectoExportProgress?.porcentaje ?? 0}%`
                : 'Exportables'
            }
            disabled={loadingSchema}
            items={[
              {
                key: 'informe-proyecto',
                label: exportingProyecto
                  ? `Informe proyecto (Word) · ${proyectoExportProgress?.porcentaje ?? 0}%`
                  : 'Informe proyecto (Word)',
                description:
                  'Informe integral: árbol estándar sin pesos y escenarios con pesos, alternativas y evaluaciones.',
                onClick: handleExportProyectoWord,
                disabled: exportingProyecto || loadingSchema,
              },
              {
                key: 'costos-word',
                label: exportingCostos ? 'Generando costos…' : 'Exportar costos (Word)',
                description:
                  'Informe OMOC con escenario Estandar (suma sin pesos de escenario).',
                onClick: handleExportCostosWord,
                disabled: exportingCostos || loadingSchema,
              },
              {
                key: 'curvas-word',
                label: exportingCurvasWord ? 'Generando curvas…' : 'Exportar curvas (Word)',
                description: 'Curvas finales por nodo terminal y escenario (Word).',
                onClick: handleExportCurvasWord,
                disabled: exportingCurvasWord || loadingSchema,
              },
              {
                key: 'curvas-json',
                label: exportingCurvas ? 'Exportando…' : 'Exportar curvas (JSON)',
                description: 'Curvas finales por nodo terminal y misión (JSON).',
                onClick: handleExportCurvas,
                disabled: exportingCurvas || loadingSchema,
              },
            ]}
          />
        </div>
      </div>
      {exportingProyecto && proyectoExportProgress && (
        <div className="px-3 sm:px-4 pt-2 shrink-0" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-300 mb-1">
            <span>{proyectoExportProgress.etapa}</span>
            <span className="font-semibold tabular-nums">
              {proyectoExportProgress.porcentaje}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-navy-800">
            <div
              className="h-full rounded-full bg-navy-600 transition-[width] duration-500"
              style={{ width: `${proyectoExportProgress.porcentaje}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Puede continuar trabajando; la descarga comenzará automáticamente al finalizar.
          </p>
        </div>
      )}
      <SplitColumnLayout
        title="Evaluación"
        description="Variable x por alternativa, escenario y criterio terminal."
        leftLabel="Alternativas"
        rightLabel="Matriz"
        leftWidthClass="lg:w-48 xl:w-52"
        rightPaddingClass="p-3 sm:p-4"
        left={
          <AlternativasEvalSidebar
            items={alternativasList}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loadingAlt}
          />
        }
        right={rightContent()}
      />

    </div>
  );
}

export default EvaluacionPanel;
