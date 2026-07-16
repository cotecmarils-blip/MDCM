import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { omoeApi, nivelesArbolApi, nodoArbolApi, proyectos, escenarios } from '../../api';
import SplitColumnLayout from '../../layout/SplitColumnLayout';
import CriteriosConceptMap from './CriteriosConceptMap';
import CriteriosTreeSidebar from './CriteriosTreeSidebar';
import CriterioDetailPanel from './CriterioDetailPanel';
import EscenarioGlobalBar from './EscenarioGlobalBar';
import ImportarDimensionModal from './ImportarDimensionModal';
import NivelesArbolConfig from './NivelesArbolConfig';
import TipoNivelPickerModal from './TipoNivelPickerModal';
import { resolveEditSelection } from './treeUtils';
import { CRITERIO_LEVELS } from './constants';
import { normalizeOmoeForest } from './buildCriteriosTree';
import { effectiveOmoeRama, resolveAddChildRama } from './ramaContext';
import { canAddChildNode, filterNivelesForChild } from './nivelArbolRules';
import {
  buildConfigMapFromArbolPayload,
  buildGruposPesoFromArbolPayload,
  enrichForestWithEscenario,
  patchNodeInConfigByOmoe,
} from './escenarioConfigUtils';
import { nodeName } from './conceptMapUtils';

function resolveOmoeIdFromSelection(selection) {
  if (!selection || selection.mode !== 'edit') return null;
  if (selection.level === CRITERIO_LEVELS.OMOE) return selection.node?.id ?? null;
  if (selection.level === CRITERIO_LEVELS.NODO_ARBOL) {
    return selection.node?.omoe_id || selection.node?.omoe || null;
  }
  return null;
}

function CriteriosPanel({ proyectoId }) {
  const [forest, setForest] = useState([]);
  const [nivelesByRama, setNivelesByRama] = useState({});
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState({ mode: 'empty' });
  const [configOpen, setConfigOpen] = useState(false);
  const [typePicker, setTypePicker] = useState({
    open: false,
    parentLevel: null,
    parentNode: null,
    dimensionRama: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [importCatalog, setImportCatalog] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [leftView, setLeftView] = useState('arbol');
  const [mapEditMode, setMapEditMode] = useState(false);
  const [infoCollapsed, setInfoCollapsed] = useState(false);
  const [escenariosByOmoe, setEscenariosByOmoe] = useState({});
  const [escenarioByOmoe, setEscenarioByOmoe] = useState({});
  const [configByOmoe, setConfigByOmoe] = useState({});
  const [gruposPesoByOmoe, setGruposPesoByOmoe] = useState({});

  const loadNiveles = useCallback(async () => {
    try {
      const res = await nivelesArbolApi.getAll(proyectoId);
      const data = res.data || {};
      setNivelesByRama(data);
      return data;
    } catch (err) {
      console.error('Error cargando niveles del árbol:', err);
      return {};
    }
  }, [proyectoId]);

  const nivelesForRama = useCallback(
    (rama) => (rama ? (nivelesByRama[rama] || []) : []),
    [nivelesByRama],
  );

  const resolveChildRama = useCallback(
    (parentLevel, parentNode) => resolveAddChildRama(parentLevel, parentNode, forest),
    [forest],
  );

  const loadTree = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) setLoading(true);
        const [response] = await Promise.all([
          omoeApi.getByProyecto(proyectoId),
          loadNiveles(),
        ]);
        const data = normalizeOmoeForest(response.data);
        setForest(data);
        return data;
      } catch (err) {
        console.error('Error cargando árbol OMOE:', err);
        return [];
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [proyectoId, loadNiveles]
  );

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (!forest.length) {
      setEscenariosByOmoe({});
      setEscenarioByOmoe({});
      return;
    }
    let cancelled = false;
    (async () => {
      const byOmoe = {};
      for (const omoe of forest) {
        try {
          const res = await escenarios.getByOmoe(omoe.id);
          byOmoe[omoe.id] = res.data || [];
        } catch {
          byOmoe[omoe.id] = [];
        }
      }
      if (cancelled) return;
      setEscenariosByOmoe(byOmoe);
      setEscenarioByOmoe((prev) => {
        const next = {};
        for (const omoe of forest) {
          const list = byOmoe[omoe.id] || [];
          const old = prev[omoe.id];
          next[omoe.id] = list.some((e) => e.id === old) ? old : list[0]?.id ?? null;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [forest]);

  const reloadConfigForOmoe = useCallback(async (omoeId, escenarioIdOverride) => {
    const escId = escenarioIdOverride ?? escenarioByOmoe[omoeId];
    if (!omoeId || !escId) return;
    try {
      const res = await escenarios.getConfigArbol(escId);
      setConfigByOmoe((prev) => ({
        ...prev,
        [omoeId]: buildConfigMapFromArbolPayload(res.data),
      }));
      setGruposPesoByOmoe((prev) => ({
        ...prev,
        [omoeId]: buildGruposPesoFromArbolPayload(res.data),
      }));
    } catch {
      setConfigByOmoe((prev) => ({ ...prev, [omoeId]: {} }));
    }
  }, [escenarioByOmoe]);

  useEffect(() => {
    if (!forest.length) {
      setConfigByOmoe({});
      setGruposPesoByOmoe({});
      return;
    }
    let cancelled = false;
    (async () => {
      const configs = {};
      const grupos = {};
      await Promise.all(
        forest.map(async (omoe) => {
          const escId = escenarioByOmoe[omoe.id];
          if (!escId) {
            configs[omoe.id] = {};
            grupos[omoe.id] = {};
            return;
          }
          try {
            const res = await escenarios.getConfigArbol(escId);
            configs[omoe.id] = buildConfigMapFromArbolPayload(res.data);
            grupos[omoe.id] = buildGruposPesoFromArbolPayload(res.data);
          } catch {
            configs[omoe.id] = {};
            grupos[omoe.id] = {};
          }
        }),
      );
      if (!cancelled) {
        setConfigByOmoe(configs);
        setGruposPesoByOmoe(grupos);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forest, escenarioByOmoe]);

  const focusedOmoeId = resolveOmoeIdFromSelection(selection) ?? forest[0]?.id ?? null;
  const focusedOmoe = forest.find((o) => o.id === focusedOmoeId) ?? null;
  const escenariosList = focusedOmoeId ? escenariosByOmoe[focusedOmoeId] || [] : [];
  const escenarioId = focusedOmoeId ? escenarioByOmoe[focusedOmoeId] ?? null : null;
  const gruposPeso = focusedOmoeId ? gruposPesoByOmoe[focusedOmoeId] || {} : {};

  const displayForest = useMemo(
    () => enrichForestWithEscenario(forest, configByOmoe),
    [forest, configByOmoe],
  );

  const handleEscenarioChange = (id) => {
    if (!focusedOmoeId) return;
    setEscenarioByOmoe((prev) => ({ ...prev, [focusedOmoeId]: id }));
  };

  const handleNewDimension = () => {
    setSelection({
      mode: 'create',
      level: CRITERIO_LEVELS.OMOE,
      parentId: null,
      siblings: forest,
    });
  };

  const handleOpenImportDimension = async () => {
    setImportOpen(true);
    setImportError(null);
    try {
      setImportLoading(true);
      const res = await proyectos.catalogoDimensiones(proyectoId);
      setImportCatalog(res.data?.items || []);
    } catch (err) {
      console.error(err);
      setImportCatalog([]);
      setImportError(err.response?.data?.detail || 'No se pudo cargar el catálogo de dimensiones.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportDimension = async ({ fuente_omoe_id, nombre_modelo }) => {
    try {
      setImporting(true);
      setImportError(null);
      const res = await proyectos.importarDimension(proyectoId, {
        fuente_omoe_id,
        nombre_modelo,
      });
      const data = await loadTree();
      const created = res.data?.omoe || data.find((d) => d.id === res.data?.omoe_id);
      setImportOpen(false);
      if (created) {
        setSelection({
          mode: 'edit',
          level: CRITERIO_LEVELS.OMOE,
          node: created,
          siblings: data,
          parentId: null,
          dimensionRama: effectiveOmoeRama(created),
        });
      }
    } catch (err) {
      console.error(err);
      setImportError(
        err.response?.data?.detail
          || err.response?.data?.fuente_omoe_id?.[0]
          || 'No se pudo importar la dimensión.',
      );
    } finally {
      setImporting(false);
    }
  };

  const handleAddChild = (parentLevel, parentNode) => {
    const rama = resolveChildRama(parentLevel, parentNode);
    const nivelesRama = nivelesForRama(rama);
    if (!canAddChildNode(parentLevel, parentNode, nivelesRama)) {
      return;
    }
    setTypePicker({ open: true, parentLevel, parentNode, dimensionRama: rama });
  };

  const handleTypeSelected = (tipoNivel) => {
    const { parentLevel, parentNode, dimensionRama: pickerRama } = typePicker;
    const dimensionRama = pickerRama || resolveChildRama(parentLevel, parentNode);
    setTypePicker({
      open: false, parentLevel: null, parentNode: null, dimensionRama: null,
    });
    setSelection({
      mode: 'create',
      level: CRITERIO_LEVELS.NODO_ARBOL,
      parentId: parentNode?.id ?? null,
      parentLevel,
      parentNode,
      tipoNivelId: tipoNivel.id,
      tipoNivelNombre: tipoNivel.nombre,
      dimensionRama,
    });
  };

  const handleReorderNodes = async (ids) => {
    await nodoArbolApi.reordenar(ids);
    await loadTree({ silent: true });
  };

  const handleSaved = async (meta = {}) => {
    const omoeId =
      meta.omoeId
      ?? resolveOmoeIdFromSelection(selection)
      ?? (meta.level === CRITERIO_LEVELS.NODO_ARBOL ? selection?.node?.omoe_id : null);

    if (meta.escenarioConfigUpdated && omoeId) {
      const needsFullReload =
        meta.escenarioGrupoPesos
        || meta.escenarioPropagados > 0
        || meta.descendientesDesactivados > 0
        || meta.descendientesActivados > 0;
      if (needsFullReload) {
        await reloadConfigForOmoe(omoeId);
      } else if (meta.escenarioNodePatch) {
        const { nodoId, peso, aplica } = meta.escenarioNodePatch;
        setConfigByOmoe((prev) => patchNodeInConfigByOmoe(prev, omoeId, nodoId, { peso, aplica }));
      }
    }

    const data = await loadTree({ silent: true });

    if (meta.deleted) {
      setSelection({ mode: 'empty' });
      return;
    }

    const level = meta.level ?? selection.level;
    const id = meta.id ?? (selection.mode === 'edit' ? selection.node?.id : null);

    if (level && id) {
      setSelection(resolveEditSelection(data, level, id));
    } else if (selection.mode === 'edit' && selection.node?.id) {
      setSelection(resolveEditSelection(data, selection.level, selection.node.id));
    }
  };

  const handleSelect = setSelection;

  const showEscenarioBar = escenariosList.length > 0;
  const isMapView = leftView === 'mapa';
  const mapLeftWidthClass = infoCollapsed
    ? 'flex-1 min-w-0'
    : 'lg:w-[58%] xl:w-[62%]';

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full">
      <SplitColumnLayout
        title="Árbol de dimensiones"
        leftLabel={leftView === 'arbol' ? 'Árbol' : 'Mapa conceptual'}
        rightLabel="Información"
        leftWidthClass={isMapView ? mapLeftWidthClass : 'lg:w-72 xl:w-80'}
        rightPaddingClass={isMapView ? 'p-3' : 'p-4 sm:p-5'}
        rightCollapsible={isMapView}
        rightCollapsed={infoCollapsed}
        onRightCollapsedChange={setInfoCollapsed}
        headerAction={
          <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
            {showEscenarioBar && (
              <EscenarioGlobalBar
                inline
                escenariosList={escenariosList}
                escenarioId={escenarioId}
                onEscenarioChange={handleEscenarioChange}
                dimensionLabel={
                  forest.length > 1 && focusedOmoe ? nodeName(focusedOmoe) : null
                }
              />
            )}
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700/60 p-0.5 bg-gray-50 dark:bg-navy-900/40 shrink-0">
              <button
                type="button"
                onClick={() => setLeftView('arbol')}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                  leftView === 'arbol'
                    ? 'bg-white dark:bg-navy-800 text-navy-700 dark:text-navy-200 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Árbol
              </button>
              <button
                type="button"
                onClick={() => setLeftView('mapa')}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                  leftView === 'mapa'
                    ? 'bg-white dark:bg-navy-800 text-navy-700 dark:text-navy-200 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Mapa
              </button>
            </div>
          </div>
        }
        left={
          leftView === 'arbol' ? (
            <CriteriosTreeSidebar
              forest={displayForest}
              nivelesByRama={nivelesByRama}
              selection={selection}
              onSelect={handleSelect}
              onAddChild={handleAddChild}
              onNewDimension={handleNewDimension}
              onImportDimension={handleOpenImportDimension}
              onConfigureNiveles={() => setConfigOpen(true)}
              onReorder={handleReorderNodes}
              loading={loading}
              gruposPeso={gruposPeso}
            />
          ) : (
            <CriteriosConceptMap
              proyectoId={proyectoId}
              forest={displayForest}
              nivelesByRama={nivelesByRama}
              selection={selection}
              onSelect={handleSelect}
              loading={loading}
              editMode={mapEditMode}
              onEditModeChange={setMapEditMode}
              onAddChild={handleAddChild}
              onReorder={handleReorderNodes}
            />
          )
        }
        right={
          <CriterioDetailPanel
            selection={selection}
            proyectoId={proyectoId}
            onSaved={handleSaved}
            onCancel={() => setSelection({ mode: 'empty' })}
            openInEditMode={leftView === 'mapa'}
            compact={leftView === 'mapa'}
            escenarioId={escenarioId}
            escenariosList={escenariosList}
          />
        }
      />

      <NivelesArbolConfig
        proyectoId={proyectoId}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onSaved={(data) => setNivelesByRama(data || {})}
      />

      <TipoNivelPickerModal
        open={typePicker.open}
        parentLevel={typePicker.parentLevel}
        parentNode={typePicker.parentNode}
        dimensionRama={
          typePicker.dimensionRama
          || resolveChildRama(typePicker.parentLevel, typePicker.parentNode)
        }
        allowedNiveles={filterNivelesForChild(
          nivelesForRama(
            typePicker.dimensionRama
              || resolveChildRama(typePicker.parentLevel, typePicker.parentNode),
          ),
          typePicker.parentLevel,
          typePicker.parentNode,
        )}
        onSelect={handleTypeSelected}
        onCancel={() => setTypePicker({
          open: false, parentLevel: null, parentNode: null, dimensionRama: null,
        })}
      />

      <ImportarDimensionModal
        open={importOpen}
        items={importCatalog}
        loading={importLoading}
        importing={importing}
        error={importError}
        onClose={() => !importing && setImportOpen(false)}
        onImport={handleImportDimension}
      />
    </div>
  );
}

export default CriteriosPanel;
