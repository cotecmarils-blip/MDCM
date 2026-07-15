import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { alternativas, evaluacionApi } from '../../api';
import SplitColumnLayout from '../../layout/SplitColumnLayout';
import { ModalOverlay } from '../../utils/modalBackdrop';
import EvaluacionMatrix from './EvaluacionMatrix';
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
  const [proyectoExportModalOpen, setProyectoExportModalOpen] = useState(false);

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

  const handleExportProyectoWord = async (includeMapWeights) => {
    setProyectoExportModalOpen(false);
    try {
      setExportingProyecto(true);
      const res = await evaluacionApi.exportInformeProyectoWord(
        proyectoId,
        includeMapWeights,
      );
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
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudo exportar el Word del proyecto.');
    } finally {
      setExportingProyecto(false);
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
            para el informe de Felipe (escenario Estandar o Escenario base + desglose).
          </p>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setProyectoExportModalOpen(true)}
            disabled={exportingProyecto || loadingSchema}
            className="btn btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
            title="Informe integral: proyecto, alternativas, árboles/pesos y evaluaciones"
          >
            {exportingProyecto ? 'Generando Word…' : 'Informe proyecto (Word)'}
          </button>
          <button
            type="button"
            onClick={handleExportCostosWord}
            disabled={exportingCostos || loadingSchema}
            className="btn btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
            title="Informe Word OMOC con escenario Estandar (suma sin pesos de escenario)"
          >
            {exportingCostos ? 'Generando Word…' : 'Exportar costos (Word)'}
          </button>
          <button
            type="button"
            onClick={handleExportCurvasWord}
            disabled={exportingCurvasWord || loadingSchema}
            className="btn btn-secondary text-sm py-1.5 px-3 disabled:opacity-50"
            title="Curvas finales por nodo terminal y escenario (Word)"
          >
            {exportingCurvasWord ? 'Generando Word…' : 'Exportar curvas (Word)'}
          </button>
          <button
            type="button"
            onClick={handleExportCurvas}
            disabled={exportingCurvas || loadingSchema}
            className="btn btn-secondary text-sm py-1.5 px-3 disabled:opacity-50"
            title="Curvas finales por nodo terminal y misión (JSON)"
          >
            {exportingCurvas ? 'Exportando…' : 'Exportar curvas (JSON)'}
          </button>
        </div>
      </div>
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

      {proyectoExportModalOpen && (
        <ModalOverlay onClose={() => !exportingProyecto && setProyectoExportModalOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="informe-proyecto-export-title"
            className="bg-white dark:bg-navy-900 rounded-xl shadow-xl max-w-md w-full border border-gray-200 dark:border-navy-800/80 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3
                id="informe-proyecto-export-title"
                className="text-lg font-bold text-gray-800 dark:text-gray-100"
              >
                Exportar informe de proyecto
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Elija si las gráficas de los árboles incluirán los pesos.
                Se genera un solo mapa por escenario.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={exportingProyecto}
                onClick={() => handleExportProyectoWord(false)}
                className="text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700/60 hover:border-navy-500 hover:bg-navy-500/5 transition-colors disabled:opacity-50"
              >
                <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Sin pesos
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Solo estructura del árbol
                </span>
              </button>
              <button
                type="button"
                disabled={exportingProyecto}
                onClick={() => handleExportProyectoWord(true)}
                className="text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700/60 hover:border-navy-500 hover:bg-navy-500/5 transition-colors disabled:opacity-50"
              >
                <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Con pesos
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Estructura + pesos en cada nodo
                </span>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={exportingProyecto}
                onClick={() => setProyectoExportModalOpen(false)}
                className="btn-sm border-gray-200 dark:border-gray-700/60 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

export default EvaluacionPanel;
