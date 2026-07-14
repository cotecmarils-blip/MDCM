import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { alternativas as alternativasApi, escenarios as escenariosApi } from '../../api';
import {
  CALC_METHOD_MAUT,
  CALC_METHOD_UTA,
  DEFAULT_CALCULATION_CONFIG,
  PRIMARY_CALCULATION_METHODS,
} from './calculationMethodConstants';
import { usesEscenarioPesos } from './escenarioAgregacionConstants';

const STATUS_STYLES = {
  recommended: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  advanced: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  experimental: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  basic: 'bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300',
  complement: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  validation: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
};

function MethodCard({ card, selected, onSelect, disabled }) {
  const isSelected = selected === card.id;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(card.id)}
      className={`text-left w-full rounded-xl border-2 p-4 transition-all ${
        isSelected
          ? 'border-navy-500 bg-navy-500/5 shadow-sm ring-1 ring-navy-500/30'
          : 'border-gray-200 dark:border-gray-700/60 hover:border-navy-400/50'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      aria-pressed={isSelected}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{card.name}</h4>
        <span
          className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
            STATUS_STYLES[card.statusTone] || STATUS_STYLES.basic
          }`}
        >
          {card.status}
        </span>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{card.description}</p>
      <p className="text-xs text-gray-500 dark:text-gray-500">
        <span className="font-medium">Uso:</span> {card.recommendedUse}
      </p>
    </button>
  );
}

function MAUTEscenariosInfo({ omoeId, showPesos = true }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!omoeId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    escenariosApi
      .getByOmoe(omoeId)
      .then((res) => {
        if (cancelled) return;
        setRows(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [omoeId]);

  const totalPeso = rows.reduce((acc, esc) => acc + (Number(esc.peso) || 0), 0);

  return (
    <div className="rounded-lg border border-blue-200/60 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-2">
      <h5 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
        Escenarios usados por MAUT
      </h5>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        MAUT usa únicamente los escenarios <strong>de esta dimensión</strong> (módulo{' '}
        <strong>Definición de escenarios</strong>) y los valores en{' '}
        <strong>Evaluación</strong>.
        {showPesos
          ? ' El peso de cada escenario actúa como probabilidad (se normaliza al calcular si no suman 100 %).'
          : ' En esta dimensión no se usan pesos entre escenarios (mínimo-mejor / máximo-mejor).'}
      </p>
      {!omoeId && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Guarde la dimensión primero; se creará el escenario «Estandar» automáticamente.
        </p>
      )}
      {omoeId && loading && (
        <p className="text-xs text-gray-500">Cargando escenarios…</p>
      )}
      {omoeId && !loading && rows.length === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          No hay escenarios para esta dimensión. Agréguelos en Definición de escenarios.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="text-xs space-y-1">
          {rows.map((esc) => (
            <li
              key={esc.id}
              className="flex justify-between gap-2 rounded-md bg-white/70 dark:bg-navy-900/40 px-2 py-1.5"
            >
              <span className="font-medium text-gray-800 dark:text-gray-200">{esc.nombre}</span>
              {showPesos && (
                <span className="text-gray-500">Peso {Number(esc.peso || 0).toFixed(2)} %</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {showPesos && rows.length > 1 && (
        <p className="text-xs text-gray-500">
          Suma de pesos: {totalPeso.toFixed(2)} %
          {Math.abs(totalPeso - 100) > 0.05 ? ' (se normalizarán al calcular)' : ''}
        </p>
      )}
      {rows.length === 1 && (
        <p className="text-xs text-gray-500">
          Con un solo escenario, MAUT equivale a MAVT para esa dimensión.
        </p>
      )}
    </div>
  );
}

function mergeRankingWithAlternatives(savedRanking, alternativas) {
  const names = (alternativas || []).map((a) => a.nombre).filter(Boolean);
  if (!names.length) return [];
  if (!savedRanking?.length) return names;
  const kept = savedRanking.filter((n) => names.includes(n));
  const added = names.filter((n) => !kept.includes(n));
  return [...kept, ...added];
}

function UTAConfig({ config, onChange, disabled, proyectoId }) {
  const [alternativas, setAlternativas] = useState([]);
  const [loading, setLoading] = useState(false);

  const prefs = useMemo(
    () => config.preferences || {
      ranking: [],
      preferred_pairs: [],
      indifference_pairs: [],
    },
    [config.preferences],
  );

  const setRanking = useCallback((ranking) => {
    onChange({
      ...config,
      preferences: {
        ...prefs,
        ranking,
        preferred_pairs: [],
      },
    });
  }, [config, onChange, prefs]);

  useEffect(() => {
    if (!proyectoId) {
      setAlternativas([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    alternativasApi
      .getByProyecto(proyectoId)
      .then((res) => {
        if (cancelled) return;
        const list = (res.data || []).slice().sort((a, b) => (a.id || 0) - (b.id || 0));
        setAlternativas(list);
      })
      .catch(() => {
        if (!cancelled) setAlternativas([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [proyectoId]);

  const ranking = mergeRankingWithAlternatives(prefs.ranking, alternativas);

  useEffect(() => {
    if (!alternativas.length || disabled) return;
    const merged = mergeRankingWithAlternatives(prefs.ranking, alternativas);
    if (JSON.stringify(merged) !== JSON.stringify(prefs.ranking || [])) {
      setRanking(merged);
    }
  }, [alternativas, disabled, prefs.ranking, setRanking]);

  const move = (index, direction) => {
    const next = [...ranking];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRanking(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-4">
      <h5 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        Ranking del decisor (UTA)
      </h5>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Orden de preferencia de las alternativas del proyecto (1 = mejor). Se cargan desde{' '}
        <strong>Gestión de alternativas</strong>.
      </p>

      {!proyectoId && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          No se pudo identificar el proyecto para cargar alternativas.
        </p>
      )}

      {proyectoId && loading && (
        <p className="text-xs text-gray-500">Cargando alternativas…</p>
      )}

      {proyectoId && !loading && alternativas.length === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          No hay alternativas en el proyecto. Créelas en Gestión de alternativas antes de usar UTA.
        </p>
      )}

      {ranking.length > 0 && (
        <ol className="space-y-2">
          {ranking.map((nombre, index) => (
            <li
              key={`${nombre}-${index}`}
              className="flex items-center gap-2 rounded-md bg-white/80 dark:bg-navy-900/40 px-3 py-2 border border-amber-200/40 dark:border-amber-800/30"
            >
              <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full bg-amber-200/80 dark:bg-amber-900/50 text-xs font-bold text-amber-900 dark:text-amber-100">
                {index + 1}
              </span>
              <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                {nombre}
              </span>
              {!disabled && ranking.length > 1 && (
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="btn-sm px-2 py-0.5 text-xs disabled:opacity-30"
                    title="Subir (más preferida)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === ranking.length - 1}
                    className="btn-sm px-2 py-0.5 text-xs disabled:opacity-30"
                    title="Bajar (menos preferida)"
                  >
                    ↓
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {ranking.length >= 2 && (
        <p className="text-xs text-gray-500">
          El orden define las restricciones U(A) ≥ U(B) + ε entre alternativas consecutivas.
        </p>
      )}
    </div>
  );
}

function CalculationMethodSelector({
  calculationMethod,
  calculationConfig,
  onChange,
  disabled = false,
  inputClass = '',
  omoeId = null,
  proyectoId = null,
  escenarioAgregacion = null,
}) {
  const showEscenarioPesos = usesEscenarioPesos(escenarioAgregacion);
  const handleMethodSelect = (methodId) => {
    onChange({
      calculation_method: methodId,
      calculation_config: { ...(DEFAULT_CALCULATION_CONFIG[methodId] || {}) },
    });
  };

  const handleConfigChange = (nextConfig) => {
    onChange({
      calculation_method: calculationMethod,
      calculation_config: nextConfig,
    });
  };

  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Método de cálculo de la dimensión
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Por defecto se usa MAVT jerárquico. Cambie solo si el proyecto requiere otro método.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PRIMARY_CALCULATION_METHODS.map((card) => (
          <MethodCard
            key={card.id}
            card={card}
            selected={calculationMethod || 'MAVT'}
            onSelect={handleMethodSelect}
            disabled={disabled}
          />
        ))}
      </div>

      {calculationMethod === CALC_METHOD_MAUT && (
        <MAUTEscenariosInfo omoeId={omoeId} showPesos={showEscenarioPesos} />
      )}
      {calculationMethod === CALC_METHOD_UTA && (
        <UTAConfig
          config={calculationConfig || {}}
          onChange={handleConfigChange}
          disabled={disabled}
          proyectoId={proyectoId}
        />
      )}
    </section>
  );
}

export default CalculationMethodSelector;
