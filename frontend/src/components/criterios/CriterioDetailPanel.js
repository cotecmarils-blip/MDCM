import React, { useState, useEffect, useRef } from 'react';
import {
  LEVEL_LABELS,
  CRITERIO_LEVELS,
  getDeleteConfirmMessage,
  getDeleteModalTitle,
} from './constants';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import CriterioDynamicForm from './CriterioDynamicForm';
import NodoEscenarioSection from './NodoEscenarioSection';
import { buildDefaultFormValues, buildPayloadFromForm, validateNodeForm } from './nodeFormSchemas';
import { getNodeApi, buildCreateContext } from './nodeFormApi';
import { getParentLabel } from './treeUtils';
import { resolveDimensionRama } from './ramaContext';
import { getCriterioDisplayName } from './displayNameUtils';
import OmoeTerminalesInfo from './OmoeTerminalesInfo';

function CriterioDetailPanel({
  selection,
  proyectoId,
  onSaved,
  onCancel,
  openInEditMode = false,
  compact = false,
  escenarioId = null,
  escenariosList = [],
}) {
  const isCreate = selection?.mode === 'create';
  const isEdit = selection?.mode === 'edit';
  const level = selection?.level;
  const item = selection?.node;
  const parentId = selection?.parentId;
  const parentNode = selection?.parentNode;
  const parentLevel = selection?.parentLevel;
  const siblings = selection?.siblings || [];

  const nodeApi = level ? getNodeApi(level) : null;

  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [nodeDirty, setNodeDirty] = useState(false);
  const [, setEscenarioDirty] = useState(false);
  const [escenarioCanSave, setEscenarioCanSave] = useState(false);
  const escenarioRef = useRef(null);

  const dimensionRama = resolveDimensionRama(selection);
  const omoeId = (() => {
    if (level !== CRITERIO_LEVELS.NODO_ARBOL || !item) return null;
    if (item.omoe_id != null) return item.omoe_id;
    if (item.omoe != null) return item.omoe;
    if (parentLevel === CRITERIO_LEVELS.OMOE && parentNode?.id) return parentNode.id;
    if (parentNode?.omoe_id != null) return parentNode.omoe_id;
    return null;
  })();

  useEffect(() => {
    if (isEdit && item) {
      setFormData(buildDefaultFormValues(level, item, { dimensionRama, parentNode }));
      setViewMode(!openInEditMode);
    } else if (isCreate) {
      setFormData(buildDefaultFormValues(level, null, { dimensionRama, parentNode }));
      setViewMode(false);
    }
    setError(null);
    setNodeDirty(false);
    setEscenarioDirty(false);
    setEscenarioCanSave(false);
  }, [selection, isEdit, isCreate, item, level, dimensionRama, parentNode, openInEditMode]);

  const handleFormChange = (data) => {
    setFormData(data);
    setNodeDirty(true);
  };

  if (!selection || selection.mode === 'empty') {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center py-16 text-sm">
        Selecciona un nodo en el árbol o en el mapa. Arriba elige el escenario; árbol y mapa muestran
        pesos e inactivos (gris) de ese escenario.
      </p>
    );
  }

  const handleGrupoPesosApplied = () => {
    if (!isEdit || !item?.id) return;
    onSaved({
      level,
      id: item.id,
      omoeId,
      escenarioConfigUpdated: true,
      escenarioGrupoPesos: true,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const hasEscenario =
      level === CRITERIO_LEVELS.NODO_ARBOL
      && isEdit
      && escenarioRef.current?.shouldSave?.();
    const hasNode = isCreate || nodeDirty;

    if (!hasEscenario && !hasNode) {
      setViewMode(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let escenarioResult = null;
      if (hasEscenario) {
        escenarioResult = await escenarioRef.current.save();
      }

      if (hasNode) {
        const validationErrors = validateNodeForm(level, formData, isEdit ? item : null, { siblings });
        if (validationErrors.length) {
          setError(validationErrors[0]);
          return;
        }
        const payload = {
          ...buildPayloadFromForm(level, formData, isEdit ? item : null),
          ...buildCreateContext(level, {
            proyectoId,
            parentId,
            parentLevel,
            parentNode,
            tipoNivelId: selection.tipoNivelId,
          }),
        };

        if (isEdit) {
          await nodeApi.update(item.id, payload);
        } else {
          const res = await nodeApi.create(payload);
          onSaved({ level, id: res.data.id, omoeId });
          setViewMode(true);
          setNodeDirty(false);
          return;
        }
      }

      onSaved({
        level,
        id: item.id,
        omoeId,
        escenarioConfigUpdated: Boolean(escenarioResult),
        escenarioNodePatch: escenarioResult
          ? { nodoId: item.id, peso: escenarioResult.peso, aplica: escenarioResult.aplica }
          : null,
        escenarioPropagados: escenarioResult?.propagados ?? 0,
        descendientesDesactivados: escenarioResult?.descendientesDesactivados ?? 0,
        descendientesActivados: escenarioResult?.descendientesActivados ?? 0,
      });
      setViewMode(true);
      setNodeDirty(false);
      setEscenarioDirty(false);
    } catch (err) {
      const data = err.response?.data || {};
      const flat = Object.entries(data).flatMap(([k, v]) => {
        if (Array.isArray(v)) return v.map((m) => `${k}: ${m}`);
        if (typeof v === 'string') return [`${k}: ${v}`];
        return [];
      });
      setError(flat[0] || data.detail || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    if (escenarioRef.current?.discard) {
      escenarioRef.current.discard();
    }
    if (isEdit && item) {
      setFormData(buildDefaultFormValues(level, item, { dimensionRama, parentNode }));
    }
    setNodeDirty(false);
    setEscenarioDirty(false);
    setEscenarioCanSave(false);
    setViewMode(true);
    setError(null);
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await nodeApi.delete(item.id);
      setDeleteModalOpen(false);
      onSaved({ deleted: true });
    } catch {
      setDeleteError('No se pudo eliminar. Puede tener elementos dependientes.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const inputClass =
    'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-navy-900/40 text-gray-800 dark:text-gray-100 input-focus';

  const title = isCreate
    ? (level === CRITERIO_LEVELS.OMOE
      ? 'Nueva dimensión'
      : level === CRITERIO_LEVELS.NODO_ARBOL
        ? `Nuevo ${selection.tipoNivelNombre || 'nodo'}`
        : level === CRITERIO_LEVELS.GRUPO_AFINIDAD
          ? `Nuevo ${LEVEL_LABELS[level]}`
          : `Nuevo ${LEVEL_LABELS[level]}`)
    : (level === CRITERIO_LEVELS.OMOE
      ? 'Editar dimensión'
      : level === CRITERIO_LEVELS.NODO_ARBOL
        ? `Editar ${selection.tipoNivelNombre || item?.tipo_nivel_nombre || 'nodo'}`
        : level === CRITERIO_LEVELS.GRUPO_AFINIDAD
          ? `Editar ${LEVEL_LABELS[level]}`
          : `Editar ${LEVEL_LABELS[level]}`);

  const parentLabel =
    isCreate && parentNode
      ? getParentLabel(parentLevel, parentNode)
      : null;

  const displayName = isEdit ? getCriterioDisplayName(item) : '';
  const compactLevelLabel = isEdit
    ? (level === CRITERIO_LEVELS.NODO_ARBOL
      ? (selection.tipoNivelNombre || item?.tipo_nivel_nombre || LEVEL_LABELS[level])
      : LEVEL_LABELS[level] || level)
  : '';

  const canSave = isCreate || nodeDirty || escenarioCanSave;

  const headerActions = (
    <div className="flex gap-2 shrink-0">
      {isEdit && viewMode && (
        <button type="button" onClick={() => setViewMode(false)} className="btn-sm btn-secondary">
          ✎ Editar
        </button>
      )}
      {isEdit && !viewMode && (
        <>
          <button type="button" onClick={handleCancelEdit} className="btn-sm border-gray-200 dark:border-gray-700/60">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !canSave}
            className="btn-sm btn-primary disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      )}
      {isCreate && onCancel && (
        <button type="button" onClick={onCancel} className="btn-sm border-gray-200 dark:border-gray-700/60">
          Cancelar
        </button>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className={compact ? 'space-y-2' : 'space-y-4'}>
      {compact && isEdit && (
        <div className="sticky top-0 z-10 -mx-3 px-3 py-2 mb-1 bg-white/95 dark:bg-navy-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-navy-700/60">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {compactLevelLabel}
              </p>
              <p className="text-base font-bold text-gray-900 dark:text-gray-100 truncate leading-tight" title={displayName}>
                {displayName || '—'}
              </p>
            </div>
            {headerActions}
          </div>
        </div>
      )}

      <div className={`flex flex-wrap justify-between items-start gap-2 ${compact ? 'pt-0' : ''}`}>
        {!compact && (
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{title}</h3>
          </div>
        )}
        {compact && isCreate && (
          <div className="flex w-full items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</h3>
            {headerActions}
          </div>
        )}
        {!compact && headerActions}
      </div>

      {level === CRITERIO_LEVELS.NODO_ARBOL && isEdit && item?.id && (
        <NodoEscenarioSection
          ref={escenarioRef}
          nodoId={item.id}
          omoeId={omoeId}
          proyectoId={proyectoId}
          escenarioId={escenarioId}
          escenariosList={escenariosList}
          compact={compact}
          disabled={viewMode}
          onDirtyChange={setEscenarioDirty}
          onCanSaveChange={setEscenarioCanSave}
          onGrupoPesosApplied={handleGrupoPesosApplied}
        />
      )}

      <CriterioDynamicForm
        level={level}
        item={isEdit ? item : null}
        formData={formData}
        onChange={handleFormChange}
        disabled={viewMode && isEdit}
        inputClass={inputClass}
        parentLabel={parentLabel}
        dimensionRama={dimensionRama}
        siblings={siblings}
        isCreate={isCreate}
        proyectoId={proyectoId}
        omoeId={level === CRITERIO_LEVELS.OMOE && isEdit ? item?.id : null}
        compact={compact}
        omitPesoEvaluacion={isCreate || level === CRITERIO_LEVELS.NODO_ARBOL}
      />

      {error && (
        <div className="text-sm text-red-500 space-y-1">
          <p>{error}</p>
        </div>
      )}

      {isCreate && (
        <div className="flex justify-end gap-2 pt-2">
          <button type="submit" disabled={loading} className="btn btn-primary disabled:opacity-50">
            {loading ? 'Creando...' : 'Crear'}
          </button>
        </div>
      )}

      {level === CRITERIO_LEVELS.OMOE && isEdit && item && (
        <OmoeTerminalesInfo omoe={item} compact={compact} />
      )}

      {isEdit && (
        <div className="pt-3 mt-1 border-t border-gray-200 dark:border-navy-700/60">
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="text-xs text-red-600/80 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline-offset-2 hover:underline"
          >
            Eliminar este elemento…
          </button>
        </div>
      )}

      <ConfirmDeleteModal
        open={deleteModalOpen && isEdit}
        title={getDeleteModalTitle(level)}
        message={
          isEdit
            ? getDeleteConfirmMessage(
                level,
                item?.nombre ||
                  item?.nombre_modelo ||
                  item?.nombre_grupo ||
                  item?.nombre_mop ||
                  item?.nombre_dp
              )
            : ''
        }
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          if (!deleteLoading) {
            setDeleteModalOpen(false);
            setDeleteError(null);
          }
        }}
        loading={deleteLoading}
        error={deleteError}
      />
    </form>
  );
}

export default CriterioDetailPanel;
