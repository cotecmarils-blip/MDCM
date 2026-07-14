import React, { useState } from 'react';
import {
  CRITERIO_LEVELS,
  LEVEL_LABELS_SHORT,
  getNodoTipoLabel,
  usesFlexibleTree,
  MODELO_LABEL_PLURAL,
} from './constants';
import { getNodeChildren } from './treeUtils';
import { effectiveOmoeRama, getRamaMeta } from './ramaContext';
import { canAddChildNode } from './nivelArbolRules';
import { hasNodePendingData } from './conceptMapUtils';

const INDENT_PX = 4;

function nodeDisplayName(node) {
  return (
    node.nombre ||
    node.nombre_display ||
    node.nombre_modelo ||
    node.nombre_mision ||
    node.nombre_grupo ||
    node.nombre_mop ||
    node.nombre_dp ||
    '—'
  );
}

function levelBadgeLabel(level, node) {
  if (level === CRITERIO_LEVELS.NODO_ARBOL) {
    return getNodoTipoLabel(node);
  }
  return LEVEL_LABELS_SHORT[level] || level;
}

function TreeItem({
  level,
  node,
  children,
  selection,
  onSelect,
  onAddChild,
  expandedIds,
  toggleExpand,
  canAddChild = true,
  grupoPesoInfo = null,
  omoe = null,
}) {
  const hasActualChildren = children && React.Children.count(children) > 0;
  const nodeKey = `${level}-${node.id}`;
  const isExpanded = expandedIds.has(nodeKey);
  const isSelected =
    selection?.mode === 'edit' &&
    selection.level === level &&
    String(selection.node?.id) === String(node.id);

  const displayName = nodeDisplayName(node);
  const isNodoArbol = level === CRITERIO_LEVELS.NODO_ARBOL;
  const inactive = isNodoArbol && node.aplica === false;
  const dimensionRama =
    level === CRITERIO_LEVELS.OMOE ? effectiveOmoeRama(node) : null;
  const ramaBadge = dimensionRama ? getRamaMeta(dimensionRama) : null;
  const pendingContext = level === CRITERIO_LEVELS.OMOE ? node : omoe;
  const pending = !inactive && hasNodePendingData(level, node, pendingContext);

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-lg mb-0.5 ${
          isSelected
            ? 'bg-gradient-to-r from-navy-500/[0.12] dark:from-navy-500/[0.24] to-navy-500/[0.04]'
            : inactive
              ? 'bg-gray-200/70 dark:bg-gray-700/35'
              : ''
        }`}
      >
        {hasActualChildren ? (
          <button
            type="button"
            onClick={() => toggleExpand(nodeKey)}
            className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
          >
            <svg
              className={`w-3 h-3 fill-current transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              viewBox="0 0 12 12"
            >
              <path d="M4.7 2.3a1 1 0 0 1 1.4 0l3.3 3.3a1 1 0 0 1 0 1.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L7.39 6 4.7 3.3a1 1 0 0 1 0-1.4Z" />
            </svg>
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <button
          type="button"
          onClick={onSelect}
          title={displayName}
          className="flex-1 min-w-0 text-left px-1.5 py-1 text-sm"
        >
          <span className="text-[10px] text-gray-400 uppercase block flex items-center gap-1 truncate">
            <span className="truncate">{levelBadgeLabel(level, node)}</span>
            {pending && (
              <span
                className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
                title="Configuración incompleta (utilidad, constantes o peso)"
              />
            )}
            {ramaBadge && (
              <span className={`normal-case px-1 py-0.5 rounded text-[9px] font-semibold shrink-0 ${ramaBadge.badgeClass}`}>
                {ramaBadge.label}
              </span>
            )}
          </span>
          <span
            className={`text-xs font-medium truncate block leading-tight ${
              inactive
                ? 'text-gray-500 dark:text-gray-400'
                : 'text-gray-800 dark:text-gray-100'
            }`}
          >
            {displayName}
          </span>
          {isNodoArbol && !inactive && node.peso != null && node.peso !== '' && (
            <span className="text-[10px] tabular-nums text-teal-700 dark:text-teal-400 font-semibold">
              {Number(node.peso).toFixed(Number(node.peso) % 1 === 0 ? 0 : 1)} %
            </span>
          )}
          {isNodoArbol && grupoPesoInfo?.modo === 'ahp' && (
            <span
              className={`text-[9px] font-semibold ${
                grupoPesoInfo.consistency_ok === false
                  ? 'text-amber-600'
                  : 'text-indigo-600 dark:text-indigo-400'
              }`}
              title={
                grupoPesoInfo.consistency_ratio != null
                  ? `AHP · CR ${Number(grupoPesoInfo.consistency_ratio).toFixed(3)}`
                  : 'Pesos AHP'
              }
            >
              ⚖ AHP
            </span>
          )}
          {inactive && (
            <span className="text-[9px] uppercase text-gray-400 dark:text-gray-500 font-medium">
              inactivo
            </span>
          )}
        </button>

        {canAddChild && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(level, node);
            }}
            className="shrink-0 p-1.5 text-navy-800 hover:bg-navy-800/10 rounded text-xs font-medium"
            title="Agregar nodo hijo"
          >
            +
          </button>
        )}
      </div>

      {hasActualChildren && isExpanded && (
        <div className="mt-0.5" style={{ marginLeft: INDENT_PX }}>
          {children}
        </div>
      )}
    </div>
  );
}

function renderNodoSubtree(nodes, ctx) {
  if (!nodes?.length) return null;
  return nodes.map((node) => {
    const children = node.hijos || [];
    return (
      <TreeItem
        key={`${CRITERIO_LEVELS.NODO_ARBOL}-${node.id}`}
        level={CRITERIO_LEVELS.NODO_ARBOL}
        node={node}
        selection={ctx.selection}
        onSelect={() =>
          ctx.onSelect({
            mode: 'edit',
            level: CRITERIO_LEVELS.NODO_ARBOL,
            node,
            siblings: nodes,
            parentId: ctx.parentId,
            parentLevel: ctx.parentLevel,
            parentNode: ctx.parentNode,
            dimensionRama: ctx.dimensionRama,
            tipoNivelId: node.tipo_nivel,
            tipoNivelNombre: node.tipo_nivel_nombre,
          })
        }
        onAddChild={ctx.onAddChild}
        expandedIds={ctx.expandedIds}
        toggleExpand={ctx.toggleExpand}
        canAddChild={canAddChildNode(
          CRITERIO_LEVELS.NODO_ARBOL,
          node,
          ctx.nivelesRama,
        )}
        grupoPesoInfo={ctx.gruposPeso?.[String(node.id)]}
        omoe={ctx.omoe}
        children={renderNodoSubtree(children, {
          ...ctx,
          parentId: node.id,
          parentLevel: CRITERIO_LEVELS.NODO_ARBOL,
          parentNode: node,
        })}
      />
    );
  });
}

function renderLegacySubtree(level, nodes, ctx) {
  const childLevel = {
    [CRITERIO_LEVELS.OMOE]: CRITERIO_LEVELS.GRUPO_AFINIDAD,
    [CRITERIO_LEVELS.GRUPO_AFINIDAD]: CRITERIO_LEVELS.MOP,
    [CRITERIO_LEVELS.MOP]: CRITERIO_LEVELS.DP,
  }[level];
  if (!childLevel || !nodes?.length) return null;

  return nodes.map((node) => {
    const children = getNodeChildren(childLevel === CRITERIO_LEVELS.MOP ? level : childLevel, node);
    const nextChildrenKey = childLevel === CRITERIO_LEVELS.MOP ? 'dps' : null;
    const childNodes = nextChildrenKey ? node[nextChildrenKey] || [] : children;
    return (
      <TreeItem
        key={`${childLevel}-${node.id}`}
        level={childLevel}
        node={node}
        selection={ctx.selection}
        onSelect={() =>
          ctx.onSelect({
            mode: 'edit',
            level: childLevel,
            node,
            siblings: nodes,
            parentId: ctx.parentId,
            parentLevel: level,
            parentNode: ctx.parentNode,
            dimensionRama: ctx.dimensionRama,
          })
        }
        onAddChild={ctx.onAddChild}
        expandedIds={ctx.expandedIds}
        toggleExpand={ctx.toggleExpand}
        canAddChild={childLevel !== CRITERIO_LEVELS.DP}
        children={renderLegacySubtree(childLevel, childNodes, {
          ...ctx,
          parentId: node.id,
          parentLevel: childLevel,
          parentNode: node,
        })}
      />
    );
  });
}

function CriteriosTreeSidebar({
  forest,
  nivelesByRama = {},
  selection,
  onSelect,
  onAddChild,
  onNewDimension,
  onImportDimension,
  onConfigureNiveles,
  loading,
  gruposPeso = {},
}) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const toggleExpand = (key) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700/60 space-y-2">
        <button
          type="button"
          onClick={onNewDimension}
          className="btn w-full btn-primary text-sm"
        >
          + Nueva dimensión
        </button>
        <button
          type="button"
          onClick={onImportDimension}
          className="btn w-full border-gray-200 dark:border-gray-700/60 text-sm"
        >
          Importar árbol desde proyecto
        </button>
        <button
          type="button"
          onClick={onConfigureNiveles}
          className="btn w-full border-gray-200 dark:border-gray-700/60 text-sm"
        >
          Configurar niveles del árbol
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {forest.length === 0 ? (
          <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-8 px-2">
            Sin {MODELO_LABEL_PLURAL.toLowerCase()}. Usa el botón superior para crear la primera.
          </p>
        ) : (
          forest.map((omoe) => {
            const flexible = usesFlexibleTree(omoe);
            const nodos = omoe.nodos || [];
            const grupos = omoe.grupos || [];
            const dimensionRama = effectiveOmoeRama(omoe);
            const nivelesRama = nivelesByRama[dimensionRama] || [];

            return (
              <TreeItem
                key={omoe.id}
                level={CRITERIO_LEVELS.OMOE}
                node={omoe}
                selection={selection}
                onSelect={() =>
                  onSelect({
                    mode: 'edit',
                    level: CRITERIO_LEVELS.OMOE,
                    node: omoe,
                    siblings: forest,
                    parentId: null,
                    dimensionRama,
                  })
                }
                onAddChild={onAddChild}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                canAddChild={canAddChildNode(CRITERIO_LEVELS.OMOE, omoe, nivelesRama)}
                grupoPesoInfo={gruposPeso?.root}
                children={
                  flexible ? (
                    <>
                      {nodos.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 py-2 px-2">
                          Sin nodos. Usa + para agregar el primero y elige el tipo de nivel.
                        </p>
                      )}
                      {renderNodoSubtree(nodos, {
                        selection,
                        onSelect,
                        onAddChild,
                        expandedIds,
                        toggleExpand,
                        parentId: omoe.id,
                        parentLevel: CRITERIO_LEVELS.OMOE,
                        parentNode: omoe,
                        omoe,
                        dimensionRama,
                        nivelesRama,
                        gruposPeso,
                      })}
                    </>
                  ) : (
                    <>
                      {grupos.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 py-2 px-2">
                          Sin grupos de afinidad. Usa + para agregar el primero.
                        </p>
                      )}
                      {renderLegacySubtree(CRITERIO_LEVELS.OMOE, grupos, {
                        selection,
                        onSelect,
                        onAddChild,
                        expandedIds,
                        toggleExpand,
                        parentId: omoe.id,
                        parentNode: omoe,
                        dimensionRama: effectiveOmoeRama(omoe),
                      })}
                    </>
                  )
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export default CriteriosTreeSidebar;
