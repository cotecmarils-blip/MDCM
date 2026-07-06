import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { escenarios } from '../../api';
import {
  formatMatrixCellDisplay,
  formatSaatyValue,
  getImportanceRowOverCol,
  juiciosAreEqual,
  parseMatrixCellInput,
  sanitizeMatrixCellDraft,
  setImportanceRowOverCol,
} from './ahpConstants';
import { computeAhpPreview, crStatusMessage } from './ahpPreview';

const TABS = [
  { id: 'matriz', label: 'Matriz' },
  { id: 'resultado', label: 'Resultado' },
];

const cellInputClass =
  'w-full min-w-[2.75rem] max-w-[4.5rem] text-center text-[11px] px-1 py-1 rounded border border-indigo-300/60 bg-white dark:bg-navy-900/50 text-gray-800 dark:text-gray-100 font-semibold tabular-nums input-focus';

function AhpMatrixCell({ value, disabled, saving, title, onCommit }) {
  const [draft, setDraft] = useState(formatMatrixCellDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatMatrixCellDisplay(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled || saving}
      value={focused ? draft : formatMatrixCellDisplay(value)}
      title={title}
      onFocus={() => {
        setFocused(true);
        setDraft(formatMatrixCellDisplay(value));
      }}
      onChange={(e) => setDraft(sanitizeMatrixCellDraft(e.target.value))}
      onBlur={() => {
        setFocused(false);
        const parsed = parseMatrixCellInput(draft, value);
        setDraft(formatMatrixCellDisplay(parsed));
        if (!juiciosAreEqual(parsed, value)) onCommit(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={cellInputClass}
    />
  );
}

function AhpHalfMatrix({ matrizIds, nombresById, juicios, disabled, saving, onCellChange }) {
  if (matrizIds.length < 2) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
        Complete el <span className="font-semibold text-indigo-700 dark:text-indigo-300">triángulo superior</span>
        {' '}con la intensidad relativa entre criterios (p. ej. 1,49 · 1,74 · 2,35 · 5,00).
        El triángulo inferior se completa automáticamente con el recíproco (1/1,49 ≈ 0,67).
      </p>
      <div className="overflow-x-auto -mx-0.5">
        <table className="w-full text-[10px] border-collapse min-w-[12rem]">
          <thead>
            <tr>
              <th className="p-1 w-20" />
              {matrizIds.map((id) => (
                <th
                  key={id}
                  className="p-1 font-semibold text-gray-600 dark:text-gray-300 text-center align-bottom"
                  title={nombresById[id]}
                >
                  <span className="block truncate max-w-[4.5rem] mx-auto leading-tight">
                    {(nombresById[id] || id).slice(0, 10)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrizIds.map((idRow, i) => (
              <tr key={idRow}>
                <td
                  className="p-1 font-semibold text-gray-600 dark:text-gray-300 text-right align-middle"
                  title={nombresById[idRow]}
                >
                  <span className="block truncate max-w-[5rem] ml-auto leading-tight">
                    {(nombresById[idRow] || idRow).slice(0, 12)}
                  </span>
                </td>
                {matrizIds.map((idCol, j) => {
                  if (i === j) {
                    return (
                      <td
                        key={idCol}
                        className="p-0.5 text-center tabular-nums bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/50"
                      >
                        <span className="text-gray-500 font-bold">1</span>
                      </td>
                    );
                  }
                  if (i < j) {
                    const val = getImportanceRowOverCol(juicios, idRow, idCol);
                    return (
                      <td
                        key={idCol}
                        className="p-0.5 border border-indigo-200/70 dark:border-indigo-700/40 bg-indigo-50/50 dark:bg-indigo-950/20"
                      >
                        <AhpMatrixCell
                          value={val}
                          disabled={disabled}
                          saving={saving}
                          title={`Importancia de «${nombresById[idRow]}» respecto a «${nombresById[idCol]}»`}
                          onCommit={(next) => onCellChange(idRow, idCol, next)}
                        />
                      </td>
                    );
                  }
                  const reciprocal = getImportanceRowOverCol(juicios, idRow, idCol);
                  return (
                    <td
                      key={idCol}
                      className="p-0.5 text-center tabular-nums bg-gray-50 dark:bg-gray-900/40 border border-gray-200/60 dark:border-gray-800 text-gray-400 dark:text-gray-500"
                      title="Recíproco (calculado automáticamente)"
                    >
                      {formatSaatyValue(reciprocal)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CrStatusBanner({ cr, crOk }) {
  if (cr == null) return null;
  const msg = crStatusMessage(cr, crOk);
  return (
    <div
      className={`rounded-md px-2 py-1.5 text-[10px] leading-snug ${
        crOk
          ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25'
          : 'bg-amber-500/10 text-amber-900 dark:text-amber-200 border border-amber-500/30'
      }`}
    >
      <span className="font-bold tabular-nums mr-1">Incon: {Number(cr).toFixed(3)}</span>
      {msg}
    </div>
  );
}

function PesoGrupoAhpPanel({
  escenarioId,
  parentId,
  initialPayload = null,
  disabled = false,
  onApplied,
  onModoChange,
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [juicios, setJuicios] = useState(initialPayload?.juicios || {});
  const [modo, setModo] = useState(initialPayload?.modo || 'manual');
  const [tab, setTab] = useState('matriz');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const saveTimerRef = useRef(null);

  const load = useCallback(async () => {
    if (!escenarioId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await escenarios.getPesoGrupo(escenarioId, parentId);
      const data = res.data || {};
      setPayload(data);
      setJuicios(data.juicios || {});
      setModo(data.modo || 'manual');
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar el grupo de pesos.');
    } finally {
      setLoading(false);
    }
  }, [escenarioId, parentId]);

  useEffect(() => {
    if (initialPayload) {
      setPayload(initialPayload);
      setJuicios(initialPayload.juicios || {});
      setModo(initialPayload.modo || 'manual');
      setDirty(false);
      return;
    }
    load();
  }, [initialPayload, load]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const ahpDisponible = payload?.ahp_disponible;
  const activos = useMemo(() => payload?.hermanos_activos || [], [payload?.hermanos_activos]);
  const nombresById = useMemo(() => {
    const map = {};
    for (const h of activos) map[h.nodo_id] = h.nombre;
    return map;
  }, [activos]);

  const matrizIds = payload?.matriz_nodo_ids || activos.map((h) => h.nodo_id);

  const preview = useMemo(
    () => computeAhpPreview(matrizIds, juicios, nombresById),
    [matrizIds, juicios, nombresById],
  );

  const cr = preview.consistency_ratio ?? payload?.consistency_ratio;
  const crOk = preview.consistency_ok;
  const pesosVista = preview.pesos_calculados?.length
    ? preview.pesos_calculados
    : payload?.pesos_calculados || [];

  const scheduleSave = useCallback(
    (nextJuicios) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        if (!escenarioId) return;
        setSaving(true);
        try {
          const res = await escenarios.setPesoGrupo(escenarioId, parentId, {
            modo: 'ahp',
            juicios: nextJuicios,
          });
          setPayload(res.data || {});
          setDirty(false);
        } catch (err) {
          setError(err.response?.data?.detail || 'No se pudo guardar la matriz.');
        } finally {
          setSaving(false);
        }
      }, 600);
    },
    [escenarioId, parentId],
  );

  const patchCell = (idRow, idCol, value) => {
    setJuicios((prev) => {
      const next = setImportanceRowOverCol(prev, idRow, idCol, value);
      setDirty(true);
      scheduleSave(next);
      return next;
    });
  };

  const handleModo = async (nextModo) => {
    if (disabled || nextModo === modo) return;
    setSaving(true);
    setError(null);
    try {
      const res = await escenarios.setPesoGrupo(escenarioId, parentId, {
        modo: nextModo,
        juicios,
      });
      const data = res.data || {};
      setPayload(data);
      setModo(data.modo);
      setDirty(false);
      onModoChange?.(data.modo);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cambiar el modo.');
    } finally {
      setSaving(false);
    }
  };

  const handleAplicar = async () => {
    setSaving(true);
    setError(null);
    try {
      if (dirty) {
        await escenarios.setPesoGrupo(escenarioId, parentId, { modo: 'ahp', juicios });
      }
      const res = await escenarios.aplicarPesoGrupo(escenarioId, parentId);
      const data = res.data || {};
      setPayload(data);
      setJuicios(data.juicios || {});
      setDirty(false);
      onApplied?.(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudieron aplicar los pesos AHP.');
    } finally {
      setSaving(false);
    }
  };

  if (!ahpDisponible) return null;

  return (
    <div className="rounded-md border border-indigo-500/30 bg-indigo-500/[0.04] p-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300">
            Comparación pareada (AHP)
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            Grupo bajo «{payload?.parent_nombre || '—'}» · escenario «{payload?.escenario_nombre || '—'}»
          </p>
        </div>
        <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700/60 p-0.5 bg-white/60 dark:bg-navy-900/30">
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => handleModo('manual')}
            className={`text-[10px] font-semibold px-2 py-1 rounded ${
              modo === 'manual'
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Manual
          </button>
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => handleModo('ahp')}
            className={`text-[10px] font-semibold px-2 py-1 rounded ${
              modo === 'ahp'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            AHP
          </button>
        </div>
      </div>

      {loading && <p className="text-[11px] text-gray-500">Cargando AHP…</p>}

      {modo === 'ahp' && !loading && (
        <>
          <div className="flex gap-1 border-b border-gray-200/80 dark:border-gray-700/50 pb-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-t ${
                  tab === t.id
                    ? 'bg-indigo-600/15 text-indigo-800 dark:text-indigo-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
            {saving && (
              <span className="ml-auto text-[10px] text-gray-400 self-center">Guardando…</span>
            )}
          </div>

          <CrStatusBanner cr={cr} crOk={crOk} />

          {tab === 'matriz' && (
            <AhpHalfMatrix
              matrizIds={matrizIds}
              nombresById={nombresById}
              juicios={juicios}
              disabled={disabled}
              saving={saving}
              onCellChange={patchCell}
            />
          )}

          {tab === 'resultado' && (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Pesos calculados automáticamente a partir de la matriz (no se escriben a mano).
              </p>
              <ul className="space-y-0.5">
                {pesosVista.map((p) => (
                  <li
                    key={p.nodo_id}
                    className="flex justify-between gap-2 text-[11px] text-gray-700 dark:text-gray-300"
                  >
                    <span className="truncate">{p.nombre}</span>
                    <span className="shrink-0 tabular-nums font-semibold text-indigo-700 dark:text-indigo-300">
                      {Number(p.peso).toFixed(1)} %
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!disabled && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={handleAplicar}
                className="text-[10px] font-semibold px-2 py-1 rounded bg-indigo-600 text-white disabled:opacity-50"
                title={
                  crOk
                    ? 'Guardar pesos calculados en el escenario'
                    : 'CR > 0,10: revise la matriz antes de aplicar'
                }
              >
                Aplicar pesos calculados
              </button>
              {!crOk && (
                <span className="text-[10px] text-amber-700 dark:text-amber-300 self-center">
                  Revise comparaciones (CR &gt; 0,10)
                </span>
              )}
            </div>
          )}
        </>
      )}

      {modo === 'manual' && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
          Modo manual: edite el peso de cada hermano activo arriba. En modo AHP los pesos salen de la
          matriz de comparación pareada; el umbral 0,10 aplica solo a la razón de consistencia (CR), no a
          cada celda.
        </p>
      )}

      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

export default PesoGrupoAhpPanel;
