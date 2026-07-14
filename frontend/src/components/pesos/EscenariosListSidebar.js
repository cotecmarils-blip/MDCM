import { RAMA_EVALUACION_SHORT } from '../criterios/ramaEvaluacionOptions';
import { usesEscenarioPesos } from '../criterios/escenarioAgregacionConstants';

function EscenariosListSidebar({
  items,
  dimensiones = [],
  filterOmoeId = '',
  onFilterOmoeChange,
  pesoTotal = null,
  showPesoSummary = true,
  selectedId,
  isNew,
  onSelect,
  onNew,
  loading,
}) {
  const agregacionByOmoe = Object.fromEntries(
    dimensiones.map((d) => [String(d.id), d.escenario_agregacion]),
  );

  const itemUsesPeso = (item) => usesEscenarioPesos(agregacionByOmoe[String(item.omoe)]);
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
        <button type="button" onClick={onNew} className="btn w-full btn-primary text-sm">
          + Nuevo escenario
        </button>
        {dimensiones.length > 0 && (
          <select
            value={filterOmoeId}
            onChange={(e) => onFilterOmoeChange?.(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-navy-900/40 text-gray-800 dark:text-gray-100"
          >
            <option value="">Todas las dimensiones</option>
            {dimensiones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre_modelo || d.nombre || `Dimensión #${d.id}`}
              </option>
            ))}
          </select>
        )}
        {filterOmoeId && showPesoSummary && pesoTotal != null && (
          <p
            className={`text-xs ${
              Math.abs(pesoTotal - 100) <= 0.05
                ? 'text-green-600 dark:text-green-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            Suma de pesos: {pesoTotal.toFixed(2)}% / 100%
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 px-2">
            No hay escenarios. Cada dimensión crea «Estandar» automáticamente; agrega más aquí.
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const isActive = !isNew && selectedId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition duration-150 ${
                      isActive
                        ? 'bg-gradient-to-r from-navy-500/[0.12] dark:from-navy-500/[0.24] to-navy-500/[0.04] text-navy-600 dark:text-navy-400'
                        : 'text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-navy-800/40'
                    }`}
                  >
                    <span className="font-medium text-sm block truncate">{item.nombre}</span>
                    <span className="text-[10px] uppercase font-semibold text-navy-600 dark:text-navy-300 block truncate">
                      {item.omoe_nombre ? `${item.omoe_nombre} · ` : ''}
                      {item.rama_evaluacion
                        ? RAMA_EVALUACION_SHORT[item.rama_evaluacion] || item.rama_evaluacion
                        : ''}
                      {itemUsesPeso(item) && item.peso != null && item.peso !== ''
                        ? ` · ${item.peso}%`
                        : ''}
                    </span>
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

export default EscenariosListSidebar;
