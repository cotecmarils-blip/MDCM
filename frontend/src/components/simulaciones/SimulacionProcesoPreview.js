import React, { useEffect, useMemo, useState } from 'react';
import { simulacionApi } from '../../api';
import { PipelineTimeline } from './SimulacionPipelineSteps';
import {
  getActiveProcessingStepId,
  getUnlockedStepIds,
  mergePipelineSteps,
} from './simulacionPipelineMeta';

function SimulacionProcesoPreview({
  proyectoId,
  previewPayload,
  calcConfig,
  dimCount,
  enabled,
  focusStepId,
}) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const payloadKey = useMemo(() => JSON.stringify(previewPayload || {}), [previewPayload]);

  const unlockedIds = useMemo(
    () => getUnlockedStepIds(calcConfig, dimCount),
    [calcConfig, dimCount],
  );

  const processingStepId = getActiveProcessingStepId(unlockedIds, loading);

  useEffect(() => {
    if (!enabled || !proyectoId || !previewPayload) {
      setPreview(null);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setFetchError(null);
      simulacionApi
        .preview(proyectoId, previewPayload)
        .then((res) => {
          if (!cancelled) setPreview(res.data);
        })
        .catch((err) => {
          if (!cancelled) {
            const data = err.response?.data;
            if (data && typeof data === 'object') {
              setPreview(data);
              setFetchError(data.detail || null);
            } else if (!err.response) {
              setPreview(null);
              setFetchError(
                'Sin conexión con la API. Compruebe que el backend Django esté en ejecución.',
              );
            } else {
              setPreview(null);
              setFetchError(
                `Error al calcular la vista previa (${err.response.status || 'desconocido'}).`,
              );
            }
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [proyectoId, payloadKey, enabled, previewPayload]);

  const steps = useMemo(
    () => mergePipelineSteps(preview?.pasos, unlockedIds),
    [preview?.pasos, unlockedIds],
  );

  useEffect(() => {
    if (!steps.length) return;
    if (focusStepId) {
      setExpandedIds(new Set([focusStepId]));
    } else {
      setExpandedIds(
        new Set(
          steps
            .filter((s) => ['completo', 'error', 'omitido'].includes(s.estado))
            .map((s) => s.id),
        ),
      );
    }
  }, [focusStepId, steps]);

  const onToggleStep = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!enabled) return null;

  const completedCount = steps.filter((s) => s.estado === 'completo').length;
  const progressPct = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="pipeline-panel">
      <div className="pipeline-panel-grid" aria-hidden />
      <div className="relative z-[1]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="pipeline-live-dot" aria-hidden />
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-tight">
                Cálculo en vivo
              </h3>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Clic en cada paso para desplegar u ocultar el detalle (flecha ▼).
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
              Progreso
            </p>
            <p className="text-lg font-bold tabular-nums text-navy-600 dark:text-navy-300">
              {progressPct}%
            </p>
          </div>
        </div>

        <div className="pipeline-progress-track mb-4" aria-hidden>
          <div className="pipeline-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {fetchError && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-3 pipeline-fade-in">
            {fetchError}
          </p>
        )}

        {preview?.detail && !preview?.faltantes?.length && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-3 pipeline-fade-in">
            {preview.detail}
          </p>
        )}

        <PipelineTimeline
          steps={steps}
          processingStepId={processingStepId}
          loading={loading}
          expandedIds={expandedIds}
          onToggleStep={onToggleStep}
          highlightStepId={focusStepId}
          className="max-h-[70vh] overflow-y-auto pr-1"
        />

        {!loading && !preview && (
          <p className="text-xs text-gray-500 text-center py-6 pipeline-fade-in">
            Cargando matriz de utilidades…
          </p>
        )}
      </div>
    </div>
  );
}

export default SimulacionProcesoPreview;
