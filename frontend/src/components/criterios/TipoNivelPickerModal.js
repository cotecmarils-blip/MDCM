import React from 'react';
import { MODAL_BACKDROP_CLASS } from '../../utils/modalBackdrop';
import { childLevelHint } from './nivelArbolRules';

function TipoNivelPickerModal({
  open,
  niveles,
  parentLevel,
  parentNode,
  allowedNiveles,
  dimensionRama = null,
  onSelect,
  onCancel,
}) {
  if (!open) return null;

  const activos = allowedNiveles ?? (niveles || []).filter((n) => n.activo !== false);
  const hint = childLevelHint(parentLevel, parentNode, niveles);
  const ramaLabel = dimensionRama ? String(dimensionRama).toUpperCase() : null;

  return (
    <div className={MODAL_BACKDROP_CLASS}>
      <div className="bg-white dark:bg-navy-900 rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            Tipo de nodo hijo
            {ramaLabel ? ` · ${ramaLabel}` : ''}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Elige un nivel inferior al padre
            {ramaLabel ? ` de la dimensión ${ramaLabel}` : ''}
            . No puedes repetir el mismo nivel ni crear uno superior.
          </p>
          {hint && (
            <p className="text-xs text-navy-600 dark:text-navy-400 mt-2 font-medium">{hint}</p>
          )}
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {activos.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay un nivel hijo válido para este padre. Revisa la configuración del árbol
              o el nivel del nodo padre.
            </p>
          ) : (
            activos.map((nivel) => (
              <button
                key={nivel.id}
                type="button"
                onClick={() => onSelect(nivel)}
                className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700/60 hover:border-navy-500 hover:bg-navy-500/5 transition-colors"
              >
                <span className="text-xs text-gray-400 uppercase block">
                  Orden {nivel.orden}
                  {ramaLabel ? ` · ${ramaLabel}` : ''}
                </span>
                <span className="font-medium text-gray-800 dark:text-gray-100">{nivel.nombre}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={onCancel} className="btn-sm border-gray-200 dark:border-gray-700/60">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default TipoNivelPickerModal;
