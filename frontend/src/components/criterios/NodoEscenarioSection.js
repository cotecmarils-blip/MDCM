import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { escenarios } from '../../api';
import PesoGrupoAhpPanel from './PesoGrupoAhpPanel';
import { parsePesoPercent, sumPesosPercent } from './nodeFormSchemas';

const NodoEscenarioSection = forwardRef(function NodoEscenarioSection(
  {
    nodoId,
    omoeId,
    escenarioId,
    escenariosList,
    compact = false,
    disabled = false,
    onDirtyChange,
    onCanSaveChange,
    onGrupoPesosApplied,
  },
  ref,
) {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({});
  const [propagarATodos, setPropagarATodos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [modoGrupo, setModoGrupo] = useState('manual');

  const inputClass =
    'w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-navy-900/40 text-gray-800 dark:text-gray-100 input-focus';

  const effectiveEscenarioId = useMemo(() => {
    if (!escenariosList?.length) return null;
    if (escenarioId && escenariosList.some((e) => e.id === escenarioId)) {
      return escenarioId;
    }
    return escenariosList[0]?.id ?? null;
  }, [escenariosList, escenarioId]);

  const loadConfig = useCallback(async () => {
    if (!effectiveEscenarioId || !nodoId) {
      setConfig(null);
      setForm({});
      setDirty(false);
      setPropagarATodos(false);
      setModoGrupo('manual');
      onDirtyChange?.(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await escenarios.getConfigNodo(effectiveEscenarioId, nodoId);
      const data = res.data || {};
      setConfig(data);
      setForm({
        peso: data.peso ?? 0,
        aplica: data.aplica !== false,
      });
      setModoGrupo(data.peso_grupo_ahp?.modo || 'manual');
      setDirty(false);
      setPropagarATodos(false);
      onDirtyChange?.(false);
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      let detail = null;
      if (data && typeof data === 'object' && data.detail) {
        detail = data.detail;
      } else if (typeof data === 'string' && data.includes('Page not found')) {
        detail = 'Reinicie el servidor backend (python manage.py runserver).';
      }
      setError(
        detail ||
          (Array.isArray(data?.errors) ? data.errors[0] : null) ||
          (status === 404
            ? 'No se encontró la configuración (reinicie el servidor backend).'
            : 'No se pudo cargar la configuración del escenario.'),
      );
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveEscenarioId, nodoId, onDirtyChange]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const canSaveEscenario =
      dirty || (propagarATodos && (escenariosList?.length ?? 0) > 1);
    onCanSaveChange?.(canSaveEscenario);
  }, [dirty, propagarATodos, escenariosList?.length, onCanSaveChange]);

  const patchForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    onDirtyChange?.(true);
  };

  const hermanosView = useMemo(() => {
    if (!config?.hermanos?.length) return [];
    const ahpPesos = config.peso_grupo_ahp?.pesos_calculados || [];
    const ahpMap = Object.fromEntries(ahpPesos.map((p) => [p.nodo_id, p.peso]));
    return config.hermanos.map((h) => {
      const esEste = h.nodo_id === nodoId;
      const aplica = esEste ? form.aplica : h.aplica;
      let peso = esEste ? form.peso : h.peso;
      if (modoGrupo === 'ahp' && aplica && ahpMap[h.nodo_id] != null) {
        peso = ahpMap[h.nodo_id];
      }
      return { ...h, esEste, aplica, peso };
    });
  }, [config, form, nodoId, modoGrupo]);

  const grupoResumen = useMemo(() => {
    const activos = hermanosView.filter((h) => h.aplica);
    if (!activos.length) {
      return { count: 0, total: 0, hint: 'Ningún hermano activo en este escenario.' };
    }
    if (activos.length === 1) {
      return {
        count: 1,
        total: activos[0].peso ?? 0,
        hint: 'Un solo hermano activo: el peso no restringe el cálculo.',
      };
    }
    const total = sumPesosPercent(activos.map((h) => h.peso));
    const ok = Math.abs(total - 100) <= 0.05;
    return {
      count: activos.length,
      total,
      hint: ok
        ? modoGrupo === 'ahp'
          ? 'Pesos AHP aplicados (Σ ≈ 100 %).'
          : 'Proporciones listas para simular.'
        : 'No hace falta sumar 100 %: la simulación normaliza con Σ(u·w)/Σw.',
    };
  }, [hermanosView, modoGrupo]);

  const applyResponse = useCallback((data) => {
    setConfig(data);
    setForm({
      peso: data.peso ?? 0,
      aplica: data.aplica !== false,
    });
    setModoGrupo(data.peso_grupo_ahp?.modo || 'manual');
    setDirty(false);
    setPropagarATodos(false);
    onDirtyChange?.(false);
    return {
      peso: data.peso ?? 0,
      aplica: data.aplica !== false,
      propagados: data.propagados ?? 0,
      descendientesDesactivados: data.descendientes_desactivados ?? 0,
      descendientesActivados: data.descendientes_activados ?? 0,
      grupoPesosAplicados: false,
    };
  }, [onDirtyChange]);

  const handleGrupoApplied = (grupoData) => {
    setModoGrupo(grupoData.modo || 'ahp');
    loadConfig();
    onGrupoPesosApplied?.(grupoData);
  };

  const save = useCallback(async () => {
    if (!effectiveEscenarioId || !nodoId) return null;
    const propagar = propagarATodos && (escenariosList?.length ?? 0) > 1;
    if (!dirty && !propagar) return null;
    setError(null);
    const payload = propagar ? { ...form, propagar_a_todos: true } : form;
    const res = await escenarios.setConfigNodo(effectiveEscenarioId, nodoId, payload);
    return applyResponse(res.data || {});
  }, [
    dirty,
    effectiveEscenarioId,
    escenariosList?.length,
    form,
    nodoId,
    propagarATodos,
    applyResponse,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => dirty,
      shouldSave: () =>
        dirty || (propagarATodos && (escenariosList?.length ?? 0) > 1),
      save,
      discard: loadConfig,
    }),
    [dirty, escenariosList?.length, loadConfig, propagarATodos, save],
  );

  const parentId = config?.parent_id ?? null;
  const pesoGrupoAhp = config?.peso_grupo_ahp;
  const showPesoManual = form.aplica && modoGrupo !== 'ahp';

  if (!omoeId) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Este nodo no está vinculado a una dimensión con escenarios.
      </p>
    );
  }

  if (!escenariosList?.length) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-300">
        Cree escenarios en esta dimensión para configurar pesos.
      </p>
    );
  }

  return (
    <section
      className={`rounded-lg border border-teal-500/30 bg-teal-500/[0.04] ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
      <h4 className="text-xs font-bold text-teal-800 dark:text-teal-300 mb-2">
        Peso y activación (escenario actual)
      </h4>

      {loading && <p className="text-[11px] text-gray-500">Cargando…</p>}

      {!loading && config && (
        <div className="space-y-2">
          <div className="rounded-md border border-gray-200/80 dark:border-gray-700/50 bg-white/60 dark:bg-navy-900/30 p-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(form.aplica)}
                  disabled={disabled}
                  onChange={(e) => patchForm({ aplica: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Activo
              </label>
              {!form.aplica && config?.tiene_hijos && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  Al guardar, los hijos también quedarán inactivos.
                </span>
              )}
              {form.aplica && config?.tiene_hijos && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  Al guardar, los hijos también quedarán activos.
                </span>
              )}

              {showPesoManual && (
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                  <span className="text-gray-500">Peso</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    disabled={disabled}
                    value={form.peso ?? 0}
                    onChange={(e) => patchForm({ peso: parsePesoPercent(e.target.value) })}
                    className={`${inputClass} w-16 text-right tabular-nums`}
                  />
                  <span className="text-gray-400">%</span>
                </label>
              )}
              {form.aplica && modoGrupo === 'ahp' && (
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                  Peso vía AHP (ver panel abajo)
                </span>
              )}
            </div>

            {escenariosList.length > 1 && !disabled && (
              <label className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={propagarATodos}
                  onChange={(e) => setPropagarATodos(e.target.checked)}
                  className="rounded border-gray-300 text-teal-600"
                />
                Igual en todos los escenarios (solo este nodo)
              </label>
            )}
          </div>

          {effectiveEscenarioId && (
            <PesoGrupoAhpPanel
              escenarioId={effectiveEscenarioId}
              parentId={parentId}
              initialPayload={pesoGrupoAhp}
              disabled={disabled}
              onApplied={handleGrupoApplied}
              onModoChange={setModoGrupo}
            />
          )}

          {hermanosView.length > 1 && (
            <div className="rounded-md border border-gray-200/80 dark:border-gray-700/50 bg-white/40 dark:bg-navy-900/20 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                Hermanos en este escenario
              </p>
              <ul className="space-y-0.5">
                {hermanosView.map((h) => (
                  <li
                    key={h.nodo_id}
                    className={`flex items-center justify-between gap-2 text-[11px] rounded px-1.5 py-0.5 ${
                      h.esEste
                        ? 'bg-teal-500/10 text-teal-900 dark:text-teal-200 font-medium'
                        : h.aplica
                          ? 'text-gray-600 dark:text-gray-400'
                          : 'text-gray-400 dark:text-gray-500 bg-gray-100/80 dark:bg-gray-800/40'
                    }`}
                  >
                    <span className="truncate min-w-0">
                      {h.esEste ? '▸ ' : '  '}
                      {h.nombre}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {h.aplica ? `${Number(h.peso ?? 0).toFixed(1)} %` : 'inactivo'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 leading-snug">
                {grupoResumen.count > 1 && (
                  <span className="tabular-nums mr-1">Σ {grupoResumen.total.toFixed(1)} % ·</span>
                )}
                {grupoResumen.hint}
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </section>
  );
});

export default NodoEscenarioSection;
