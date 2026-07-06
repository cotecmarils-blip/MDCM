import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { simulacionApi } from '../../api';
import { listDimensionesFromResultado } from './simulacionGraficosUtils';
import {
  applyWeightChange,
  buildSensibilidadBootstrap,
  buildTornadoPreview,
  normalizeWeightsForApi,
  rankingFromScores,
  resolveDisplayWeights,
  sensibilidadRequestBody,
} from './simulacionSensibilidadUtils';
import SimulacionSensibilidadPerformanceChart from './SimulacionSensibilidadPerformanceChart';
import SimulacionSensibilidadDynamicPanel from './SimulacionSensibilidadDynamicPanel';
import SimulacionSensibilidadGradientChart from './SimulacionSensibilidadGradientChart';
import SimulacionSensibilidadTornadoChart from './SimulacionSensibilidadTornadoChart';
import SimulacionSensibilidadRanking from './SimulacionSensibilidadRanking';

const MADM_LABELS = {
  topsis: 'TOPSIS',
  wsm: 'WSM',
  moora: 'MOORA',
  vikor: 'VIKOR',
  copras: 'COPRAS',
  aras: 'ARAS',
  codas: 'CODAS',
  edas: 'EDAS',
  mabac: 'MABAC',
  marcos: 'MARCOS',
  waspas: 'WASPAS',
  wpm: 'WPM',
};

const RANK_DEBOUNCE_MS = 400;
const RANK_LOADING_DELAY_MS = 350;
const TORNADO_SYNC_MS = 280;

function SimulacionSensibilidadCalculo({ proyectoId, resultado }) {
  const historialKey = resultado?.historial_id ?? resultado?.titulo_historial ?? '';

  const bootstrap = useMemo(
    () => buildSensibilidadBootstrap(resultado),
    [resultado],
  );

  const dimensiones = useMemo(
    () => listDimensionesFromResultado(resultado),
    [resultado],
  );

  const [model, setModel] = useState(null);
  const [userWeights, setUserWeights] = useState(null);
  const [scoresByAlt, setScoresByAlt] = useState({});
  const [rankingList, setRankingList] = useState([]);
  const [sweepPayload, setSweepPayload] = useState(null);
  const [tornadoPayload, setTornadoPayload] = useState(null);
  const [gradientDimId, setGradientDimId] = useState(null);
  const [selectedAltId, setSelectedAltId] = useState(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [loadingRank, setLoadingRank] = useState(false);
  const [loadingSweep, setLoadingSweep] = useState(false);
  const [loadingTornado, setLoadingTornado] = useState(false);
  const [error, setError] = useState(null);
  const [rankError, setRankError] = useState(null);
  const [sweepError, setSweepError] = useState(null);
  const [tornadoError, setTornadoError] = useState(null);

  const rankDebounceRef = useRef(null);
  const rankLoadingTimerRef = useRef(null);
  const tornadoSyncRef = useRef(null);
  const tornadoRequestIdRef = useRef(0);
  const sweepRequestIdRef = useRef(0);
  const rankRequestIdRef = useRef(0);

  const view = model?.ok ? model : bootstrap;

  const metodoMadm = MADM_LABELS[view?.metodo_madm]
    || view?.metodo_madm_label
    || MADM_LABELS[resultado?.opciones_calculo?.metodo_madm]
    || 'MADM';

  const criteria = useMemo(() => view?.dimensions || [], [view?.dimensions]);
  const alternatives = useMemo(() => view?.alternatives || [], [view?.alternatives]);
  const localPriorities = useMemo(() => view?.local_priorities || {}, [view?.local_priorities]);

  const weights = useMemo(
    () => resolveDisplayWeights(criteria, bootstrap, model, userWeights),
    [criteria, bootstrap, model, userWeights],
  );

  const weightsKey = useMemo(
    () => criteria.map((c) => `${c}:${Number(weights[c] ?? 0).toFixed(5)}`).join('|'),
    [criteria, weights],
  );

  const ranking = useMemo(
    () => rankingFromScores(alternatives, scoresByAlt, rankingList),
    [alternatives, scoresByAlt, rankingList],
  );

  const selectedAlt = ranking.find((a) => a.id === selectedAltId) || ranking[0];

  useEffect(() => {
    const boot = buildSensibilidadBootstrap(resultado);
    const dims = listDimensionesFromResultado(resultado);
    if (!boot) {
      setUserWeights(null);
      setScoresByAlt({});
      setRankingList([]);
      setSelectedAltId(null);
      setGradientDimId(null);
      return;
    }
    setUserWeights(null);
    setScoresByAlt(boot.scores);
    setSelectedAltId(boot.alternatives[0]?.name ?? null);
    setGradientDimId(dims[0]?.id ?? null);
    setModel(null);
    setSweepPayload(null);
    setTornadoPayload(null);
    setRankError(null);
    setSweepError(null);
    setTornadoError(null);
    setError(null);
  }, [historialKey, resultado]);

  useEffect(() => {
    if (!proyectoId || !resultado || !bootstrap) {
      return undefined;
    }

    let cancelled = false;
    setLoadingModel(true);

    simulacionApi
      .sensibilidad(proyectoId, sensibilidadRequestBody(resultado, { accion: 'init' }))
      .then((res) => {
        if (cancelled) return;
        if (!res.data?.ok) {
          setError(res.data?.mensaje || null);
          return;
        }
        setModel(res.data);
        setScoresByAlt(res.data.scores || bootstrap?.scores || {});
        setRankingList(res.data.ranking_list || []);
        if (res.data.alternatives?.length) {
          setSelectedAltId((prev) => prev || res.data.alternatives[0].name);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err.response?.data?.mensaje
            || err.response?.data?.detail
            || null,
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingModel(false);
      });

    return () => {
      cancelled = true;
    };
  }, [proyectoId, resultado, historialKey, bootstrap]);

  const fetchRanking = useCallback((nextWeights, criteriaList) => {
    if (!proyectoId || !resultado || !criteriaList?.length) return;
    const normalized = normalizeWeightsForApi(nextWeights, criteriaList);
    const requestId = rankRequestIdRef.current + 1;
    rankRequestIdRef.current = requestId;

    if (rankLoadingTimerRef.current) {
      clearTimeout(rankLoadingTimerRef.current);
    }
    rankLoadingTimerRef.current = setTimeout(() => {
      if (rankRequestIdRef.current === requestId) {
        setLoadingRank(true);
      }
    }, RANK_LOADING_DELAY_MS);

    setRankError(null);
    simulacionApi
      .sensibilidad(proyectoId, sensibilidadRequestBody(resultado, {
        accion: 'rank',
        weights: normalized,
      }))
      .then((res) => {
        if (requestId !== rankRequestIdRef.current) return;
        if (!res.data?.ok) {
          setRankError(res.data?.mensaje || 'No se pudo recalcular el ranking.');
          return;
        }
        setScoresByAlt(res.data.scores || {});
        setRankingList(res.data.ranking_list || []);
      })
      .catch((err) => {
        if (requestId !== rankRequestIdRef.current) return;
        setRankError(
          err.response?.data?.mensaje
            || err.response?.data?.detail
            || 'Error al recalcular el ranking.',
        );
      })
      .finally(() => {
        if (requestId !== rankRequestIdRef.current) return;
        if (rankLoadingTimerRef.current) {
          clearTimeout(rankLoadingTimerRef.current);
          rankLoadingTimerRef.current = null;
        }
        setLoadingRank(false);
      });
  }, [proyectoId, resultado]);

  const scheduleRanking = useCallback((nextWeights, criteriaList) => {
    if (rankDebounceRef.current) {
      clearTimeout(rankDebounceRef.current);
    }
    rankDebounceRef.current = setTimeout(() => {
      fetchRanking(nextWeights, criteriaList);
    }, RANK_DEBOUNCE_MS);
  }, [fetchRanking]);

  useEffect(() => () => {
    if (rankDebounceRef.current) clearTimeout(rankDebounceRef.current);
    if (rankLoadingTimerRef.current) clearTimeout(rankLoadingTimerRef.current);
    if (tornadoSyncRef.current) clearTimeout(tornadoSyncRef.current);
  }, []);

  useEffect(() => {
    if (!bootstrap || gradientDimId == null || !proyectoId || !resultado) {
      return undefined;
    }

    const requestId = sweepRequestIdRef.current + 1;
    sweepRequestIdRef.current = requestId;
    setLoadingSweep(true);
    setSweepError(null);

    simulacionApi
      .sensibilidad(proyectoId, sensibilidadRequestBody(resultado, {
        accion: 'sweep',
        dimension: gradientDimId,
        pasos: 21,
      }))
      .then((res) => {
        if (requestId !== sweepRequestIdRef.current) return;
        if (!res.data?.ok) {
          setSweepPayload(null);
          setSweepError(res.data?.mensaje || 'No se pudo calcular el barrido.');
          return;
        }
        setSweepPayload(res.data);
      })
      .catch((err) => {
        if (requestId !== sweepRequestIdRef.current) return;
        setSweepPayload(null);
        setSweepError(
          err.response?.data?.mensaje
            || err.response?.data?.detail
            || 'Error al calcular el barrido.',
        );
      })
      .finally(() => {
        if (requestId !== sweepRequestIdRef.current) return;
        setLoadingSweep(false);
      });

    return undefined;
  }, [gradientDimId, proyectoId, historialKey, bootstrap, resultado]);

  const tornadoAltName = selectedAlt?.name || selectedAlt?.id || selectedAltId;

  const tornadoPreview = useMemo(
    () => buildTornadoPreview(criteria, weights, localPriorities, tornadoAltName),
    [criteria, weights, localPriorities, tornadoAltName],
  );

  const tornadoDisplay = useMemo(() => {
    const baselineFromRank = tornadoAltName ? scoresByAlt?.[tornadoAltName] : null;
    const preview = tornadoPreview || null;
    const synced = tornadoPayload && !tornadoPayload.preview ? tornadoPayload : null;

    if (synced) {
      return {
        ...synced,
        baseline_score: baselineFromRank ?? synced.baseline_score,
      };
    }
    if (preview) {
      return {
        ...preview,
        baseline_score: baselineFromRank ?? preview.baseline_score,
      };
    }
    return null;
  }, [tornadoPreview, tornadoPayload, scoresByAlt, tornadoAltName]);

  const fetchTornado = useCallback((altName, criteriaList, currentWeights) => {
    if (!proyectoId || !resultado || !altName || !criteriaList?.length) return;

    const requestId = tornadoRequestIdRef.current + 1;
    tornadoRequestIdRef.current = requestId;
    setLoadingTornado(true);
    setTornadoError(null);

    const normalized = normalizeWeightsForApi(currentWeights, criteriaList);

    simulacionApi
      .sensibilidad(proyectoId, sensibilidadRequestBody(resultado, {
        accion: 'tornado',
        alternative: altName,
        weights: normalized,
      }))
      .then((res) => {
        if (requestId !== tornadoRequestIdRef.current) return;
        if (!res.data?.ok) {
          setTornadoPayload(null);
          setTornadoError(res.data?.mensaje || 'No se pudo calcular el tornado.');
          return;
        }
        setTornadoPayload(res.data);
      })
      .catch((err) => {
        if (requestId !== tornadoRequestIdRef.current) return;
        setTornadoPayload(null);
        setTornadoError(
          err.response?.data?.mensaje
            || err.response?.data?.detail
            || 'Error al calcular el tornado.',
        );
      })
      .finally(() => {
        if (requestId !== tornadoRequestIdRef.current) return;
        setLoadingTornado(false);
      });
  }, [proyectoId, resultado]);

  useEffect(() => {
    if (!bootstrap || !tornadoAltName || !criteria.length) {
      return undefined;
    }

    if (tornadoSyncRef.current) {
      clearTimeout(tornadoSyncRef.current);
    }

    tornadoSyncRef.current = setTimeout(() => {
      fetchTornado(tornadoAltName, criteria, weights);
    }, TORNADO_SYNC_MS);

    return () => {
      if (tornadoSyncRef.current) clearTimeout(tornadoSyncRef.current);
    };
  }, [
    tornadoAltName,
    weightsKey,
    criteria,
    weights,
    bootstrap,
    historialKey,
    fetchTornado,
  ]);

  const handleWeightChange = useCallback((dimension, newWeight) => {
    setUserWeights((prev) => {
      const base = prev || weights;
      const next = applyWeightChange(base, dimension, newWeight);
      scheduleRanking(next, criteria);
      return next;
    });
  }, [scheduleRanking, criteria, weights]);

  if (dimensiones.length < 2) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        La sensibilidad de pesos requiere al menos 2 dimensiones en el cálculo.
      </p>
    );
  }

  if (!bootstrap) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Este cálculo no incluye matriz normalizada ni pesos por dimensión.
        Vuelva a ejecutar y guardar el cálculo con el pipeline actual.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Análisis de sensibilidad del cálculo
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
          Pesos iniciales tomados del cálculo guardado
          {bootstrap.pesos_metodo ? ` (${bootstrap.pesos_metodo})` : ''}.
          Ajuste las barras o sliders para explorar escenarios; el ranking se recalcula con{' '}
          <strong>{metodoMadm}</strong>.
        </p>
        <div
          className="min-h-[18px] mt-1 text-[10px] leading-snug flex items-center gap-2"
          aria-live="polite"
          aria-atomic="true"
        >
          {loadingRank && (
            <span className="text-navy-600 dark:text-navy-400">Recalculando ranking…</span>
          )}
          {!loadingRank && loadingTornado && (
            <span className="text-navy-600 dark:text-navy-400">Actualizando tornado…</span>
          )}
          {!loadingRank && loadingModel && (
            <span className="text-gray-400">Sincronizando con el servidor…</span>
          )}
          {!loadingRank && !loadingModel && error && (
            <span className="text-amber-700 dark:text-amber-300">{error}</span>
          )}
          {!loadingRank && rankError && (
            <span className="text-amber-700 dark:text-amber-300">{rankError}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <section className="xl:col-span-7 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-900/50 p-3">
          <SimulacionSensibilidadPerformanceChart
            key={`perf-${historialKey}`}
            criteria={criteria}
            weights={weights}
            localPriorities={localPriorities}
            alternatives={alternatives}
            scoresByAlt={scoresByAlt}
            onWeightChange={handleWeightChange}
            metodoLabel={metodoMadm}
          />
        </section>

        <section className="xl:col-span-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-900/50 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="text-[11px] text-gray-500 flex items-center gap-2">
              <span className="font-semibold">Dimensión (Gradient)</span>
              <select
                value={gradientDimId ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = raw === '' ? null : Number(raw);
                  setGradientDimId(Number.isNaN(next) ? raw : next);
                }}
                className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-900 px-2 py-1 text-xs"
              >
                {dimensiones.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </label>
            {loadingSweep && (
              <span className="text-[10px] text-gray-400">Barrido…</span>
            )}
            {sweepError && (
              <span className="text-[10px] text-amber-700 dark:text-amber-300">{sweepError}</span>
            )}
          </div>
          <SimulacionSensibilidadGradientChart
            sweep={sweepPayload?.sweep}
            alternatives={alternatives}
            dimension={sweepPayload?.dimension || dimensiones.find((d) => d.id === gradientDimId)?.nombre}
            metodoLabel={metodoMadm}
            loading={loadingSweep}
            currentWeightPct={
              sweepPayload?.dimension && weights[sweepPayload.dimension] != null
                ? weights[sweepPayload.dimension] * 100
                : sweepPayload?.pesos_base?.peso_dimension_pct
            }
          />
          {sweepPayload?.crossovers?.length > 0 && (
            <ul className="text-[10px] text-amber-800 dark:text-amber-200 mt-2 space-y-0.5 px-1">
              {sweepPayload.crossovers.map((c, idx) => (
                <li key={`${c.peso_dimension_pct}-${idx}`}>
                  ~{c.peso_dimension_pct}%: «{c.de}» → «{c.a}»
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="xl:col-span-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-900/50 p-3">
          <SimulacionSensibilidadDynamicPanel
            criteria={criteria}
            weights={weights}
            alternatives={alternatives}
            scoresByAlt={scoresByAlt}
            onWeightChange={handleWeightChange}
            metodoLabel={metodoMadm}
          />
        </section>

        <aside className="xl:col-span-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-900/50 p-3 min-h-[200px]">
          <SimulacionSensibilidadRanking
            ranking={ranking}
            weights={weights}
            localPriorities={localPriorities}
            selectedAlt={selectedAlt}
            onSelectAlt={setSelectedAltId}
            metodoLabel={metodoMadm}
          />
        </aside>
      </div>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-900/50 p-3">
        {tornadoError && (
          <p className="text-[10px] text-amber-700 dark:text-amber-300 mb-2">{tornadoError}</p>
        )}
        <SimulacionSensibilidadTornadoChart
          payload={tornadoDisplay}
          metodoLabel={metodoMadm}
          loading={loadingTornado}
          syncing={loadingTornado && Boolean(tornadoPreview)}
        />
      </section>
    </div>
  );
}

export default SimulacionSensibilidadCalculo;
