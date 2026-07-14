import React, { useEffect, useMemo, useState } from 'react';
import { ModalOverlay } from '../../utils/modalBackdrop';
import { getEscenarioAgregacionLabel, getModoValorTerminalLabel } from './escenarioAgregacionConstants';

function ImportarDimensionModal({
  open,
  items = [],
  loading = false,
  importing = false,
  error = null,
  onClose,
  onImport,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [nombre, setNombre] = useState('');
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setNombre('');
    setFiltro('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const blob = [
        it.proyecto_nombre,
        it.nombre_modelo,
        it.codigo,
        it.rama_evaluacion,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [items, filtro]);

  if (!open) return null;

  const selected = items.find((it) => it.omoe_id === selectedId);

  const handleConfirm = () => {
    if (!selectedId || importing) return;
    onImport({
      fuente_omoe_id: selectedId,
      nombre_modelo: nombre.trim() || undefined,
    });
  };

  return (
    <ModalOverlay onClose={importing ? undefined : onClose}>
      <div className="bg-white dark:bg-navy-900 rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
        <div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            Importar árbol / dimensión
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Copia la estructura micro (nodos, pesos y curvas) desde un proyecto al que
            tengas acceso. No trae valores de evaluación ni escenarios origen; se crea
            el escenario «Estandar».
          </p>
        </div>

        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por proyecto o dimensión…"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-950 px-3 py-2 text-sm"
          disabled={loading || importing}
        />

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 border border-gray-100 dark:border-gray-800 rounded-lg p-2">
          {loading ? (
            <p className="text-sm text-gray-500 py-6 text-center">Cargando catálogo…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No hay dimensiones disponibles para importar.
            </p>
          ) : (
            filtered.map((it) => {
              const active = it.omoe_id === selectedId;
              return (
                <button
                  key={it.omoe_id}
                  type="button"
                  onClick={() => {
                    setSelectedId(it.omoe_id);
                    if (!nombre) {
                      setNombre(`${it.nombre_modelo} (importada)`);
                    }
                  }}
                  disabled={importing}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    active
                      ? 'border-navy-500 bg-navy-500/10'
                      : 'border-gray-200 dark:border-gray-700/60 hover:border-navy-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium text-sm text-gray-800 dark:text-gray-100 block truncate">
                        {it.nombre_modelo}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block truncate">
                        {it.proyecto_nombre}
                        {it.es_proyecto_actual ? ' · proyecto actual' : ''}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                      {it.rama_evaluacion} · {it.nodos_count} nodos
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {selected && (
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>
              Agregación: {getEscenarioAgregacionLabel(selected.escenario_agregacion) || '—'}
              {' · '}
              Valor: {getModoValorTerminalLabel(selected.modo_valor_terminal) || '—'}
            </p>
            <label className="block text-sm text-gray-700 dark:text-gray-200 font-medium">
              Nombre en este proyecto
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-950 px-3 py-2 text-sm font-normal"
                disabled={importing}
              />
            </label>
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={onClose}
            disabled={importing}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary text-sm disabled:opacity-50"
            onClick={handleConfirm}
            disabled={!selectedId || importing}
          >
            {importing ? 'Importando…' : 'Importar árbol'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

export default ImportarDimensionModal;
