import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { proyectos } from '../../api';
import SensitivityTree from './SensitivityTree';
import SensitivityChart from './SensitivityChart';
import SensitivityRanking from './SensitivityRanking';
import {
  calculateAllOveralls,
  redistributeWeights,
  validateSensitivityModel,
} from '../../utils/sensitivityCalculations';

function SensitivityPanel({ proyectoId }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState('root');
  const [weights, setWeights] = useState({});
  const [selectedAltId, setSelectedAltId] = useState(null);

  const loadData = useCallback(async (nodeKey) => {
    try {
      setLoading(true);
      const { data } = await proyectos.getSensibilidad(proyectoId, { node: nodeKey });
      setPayload(data);
      setError(data.mensaje || null);
      if (data.weights) {
        setWeights(data.weights);
      }
      if (data.alternatives?.length) {
        setSelectedAltId(data.alternatives[0].id);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar la sensibilidad');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    loadData(selectedKey);
  }, [selectedKey, loadData]);

  const handleWeightChange = (criterion, newWeight) => {
    setWeights((prev) => redistributeWeights(prev, criterion, newWeight));
  };

  const alternatives = useMemo(() => payload?.alternatives || [], [payload?.alternatives]);
  const criteria = useMemo(() => payload?.criteria || [], [payload?.criteria]);
  const localPriorities = useMemo(() => payload?.localPriorities || {}, [payload?.localPriorities]);

  const ranking = useMemo(
    () => calculateAllOveralls(alternatives, weights, localPriorities),
    [alternatives, weights, localPriorities],
  );

  const selectedAlt = ranking.find((a) => a.id === selectedAltId) || ranking[0];

  const validationErrors = useMemo(
    () => validateSensitivityModel(criteria, weights, localPriorities, alternatives),
    [criteria, weights, localPriorities, alternatives],
  );

  if (loading && !payload) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0 overflow-hidden">
      <div className="shrink-0">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Sensibilidad de desempeño
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          Ajuste los pesos de los criterios hijos y observe cómo cambia el ranking.
          Los puntajes locales provienen de las alternativas y funciones de utilidad del OMOE.
        </p>
        {payload?.selectedNodeName && (
          <p className="text-xs text-navy-600 dark:text-navy-300 mt-2">
            Nodo: <strong>{payload.selectedNodeName}</strong>
            {payload.motor && (
              <span className="ml-2 px-2 py-0.5 rounded bg-navy-100 dark:bg-navy-800">
                Motor: {payload.motor}
              </span>
            )}
          </p>
        )}
      </div>

      {error && (
        <div className="shrink-0 p-3 rounded-lg bg-amber-500/10 border border-amber-500 text-amber-800 dark:text-amber-200 text-sm">
          {error}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="shrink-0 p-3 rounded-lg bg-red-500/10 border border-red-400 text-red-800 dark:text-red-200 text-xs">
          {validationErrors.map((msg) => (
            <p key={msg}>{msg}</p>
          ))}
        </div>
      )}

      {criteria.length > 0 && alternatives.length > 0 && (
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-3 overflow-hidden">
          <aside className="xl:col-span-3 flex flex-col min-h-0 max-h-[30vh] xl:max-h-none">
            <div className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-1.5 px-1">
              Árbol OMOE
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-gray-200 dark:border-navy-800 bg-white dark:bg-navy-900 p-2">
              <SensitivityTree
                tree={payload?.tree}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
              />
            </div>
          </aside>

          <section className="xl:col-span-6 flex flex-col min-h-0 overflow-y-auto">
            <div className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-1.5 px-1">
              Gráfica de sensibilidad
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-navy-800 bg-white dark:bg-navy-900 p-4">
              <SensitivityChart
                criteria={criteria}
                weights={weights}
                localPriorities={localPriorities}
                alternatives={alternatives}
                onWeightChange={handleWeightChange}
              />
            </div>
          </section>

          <aside className="xl:col-span-3 flex flex-col min-h-0 overflow-y-auto">
            <div className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-1.5 px-1">
              Ranking
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-navy-800 bg-white dark:bg-navy-900 p-4">
              <SensitivityRanking
                ranking={ranking}
                weights={weights}
                localPriorities={localPriorities}
                selectedAlt={selectedAlt}
                onSelectAlt={setSelectedAltId}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default SensitivityPanel;
