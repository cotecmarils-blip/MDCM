import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { configTrazabilidadApi, omoeApi } from '../../api';

const ESTADO_STYLES = {
  completo: {
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    dot: 'bg-green-500',
    label: 'Completo',
  },
  pendiente: {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    dot: 'bg-amber-500',
    label: 'Pendiente',
  },
  sin_datos: {
    badge: 'bg-gray-100 text-gray-600 dark:bg-navy-800 dark:text-gray-400',
    dot: 'bg-gray-400',
    label: 'Sin datos',
  },
};

const MOMENTO_OPTIONS = [
  { value: 'estructura', label: 'Estructura del árbol' },
  { value: 'utilidad', label: 'Funciones de utilidad' },
  { value: 'pesos', label: 'Pesos y escenarios' },
  { value: 'evaluacion', label: 'Matriz de evaluación' },
];

function EstadoBadge({ estado }) {
  const style = ESTADO_STYLES[estado] || ESTADO_STYLES.sin_datos;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function TrazabilidadConfigPanel({ proyectoId, canWrite = false, embedded = false }) {
  const [data, setData] = useState(null);
  const [dimensiones, setDimensiones] = useState([]);
  const [omoeFilter, setOmoeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sesionMomento, setSesionMomento] = useState('utilidad');
  const [sesionNotas, setSesionNotas] = useState('');
  const [sesionSaving, setSesionSaving] = useState(false);
  const [sesionError, setSesionError] = useState(null);

  const loadDimensiones = useCallback(async () => {
    try {
      const response = await omoeApi.getByProyecto(proyectoId);
      setDimensiones(response.data || []);
    } catch {
      setDimensiones([]);
    }
  }, [proyectoId]);

  const loadTrazabilidad = useCallback(async () => {
    try {
      setLoading(true);
      const params = omoeFilter ? { omoe: omoeFilter } : {};
      const { data: payload } = await configTrazabilidadApi.get(proyectoId, params);
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar la trazabilidad.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [proyectoId, omoeFilter]);

  useEffect(() => {
    loadDimensiones();
  }, [loadDimensiones]);

  useEffect(() => {
    loadTrazabilidad();
  }, [loadTrazabilidad]);

  const resumen = useMemo(() => {
    if (!data?.momentos) return null;
    const completos = data.momentos.filter((m) => m.estado === 'completo').length;
    const pendientes = data.momentos.filter((m) => m.estado === 'pendiente').length;
    return { completos, pendientes, total: data.momentos.length };
  }, [data]);

  const handleRegistrarSesion = async (e) => {
    e.preventDefault();
    setSesionSaving(true);
    setSesionError(null);
    try {
      const body = {
        momento: sesionMomento,
        notas: sesionNotas,
        omoe_id: omoeFilter || null,
      };
      const { data: payload } = await configTrazabilidadApi.registrarSesion(proyectoId, body);
      setData(payload);
      setSesionNotas('');
    } catch (err) {
      setSesionError(err.response?.data?.detail || 'No se pudo registrar la sesión.');
    } finally {
      setSesionSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-600" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 h-full overflow-y-auto space-y-6 ${embedded ? '' : ''}`}>
      {!embedded && (
      <header>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Trazabilidad de configuración
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
          La configuración del árbol se realiza en momentos distintos: primero la estructura
          (nombres y jerarquía), luego sesiones con expertos para funciones de utilidad y pesos,
          y finalmente la matriz de evaluación antes de simular.
        </p>
      </header>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="traz-omoe" className="block text-xs font-medium text-gray-500 mb-1">
            Filtrar por dimensión
          </label>
          <select
            id="traz-omoe"
            value={omoeFilter}
            onChange={(e) => setOmoeFilter(e.target.value)}
            className="form-select text-sm min-w-[14rem]"
          >
            <option value="">Todas las dimensiones</option>
            {dimensiones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre_modelo || d.codigo || `Dimensión #${d.id}`}
              </option>
            ))}
          </select>
        </div>
        {data?.listo_para_simular != null && (
          <span
            className={`text-sm font-medium px-3 py-1.5 rounded-lg ${
              data.listo_para_simular
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
            }`}
          >
            {data.listo_para_simular
              ? 'Listo para simular'
              : `${data.validacion_simulacion?.total_faltantes ?? 0} pendiente(s) para simular`}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900/50 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Momentos completos</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{resumen.completos}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900/50 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Con pendientes</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{resumen.pendientes}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900/50 p-4 col-span-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Enfoque</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              Crear nodos solo exige nombre. Utilidad y pesos se completan cuando el equipo lo decida.
            </p>
          </div>
        </div>
      )}

      {data?.momentos && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Momentos de configuración
          </h2>
          <div className="space-y-3">
            {data.momentos.map((momento, idx) => (
              <article
                key={momento.id}
                className="rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-100 dark:bg-navy-800 text-xs font-bold text-navy-700 dark:text-navy-300">
                      {idx + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{momento.label}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{momento.descripcion}</p>
                      <p className="text-xs text-navy-600 dark:text-navy-400 mt-1">
                        Módulo: {momento.modulo}
                      </p>
                    </div>
                  </div>
                  <EstadoBadge estado={momento.estado} />
                </div>
                {momento.total_pendientes > 0 && (
                  <div className="mt-3 pl-10">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                      {momento.total_pendientes} elemento(s) pendiente(s)
                    </p>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5 max-h-32 overflow-y-auto">
                      {momento.pendientes.slice(0, 8).map((p, i) => (
                        <li key={`${p.tipo}-${i}`} className="truncate">
                          {p.detalle}
                          {p.dimension ? ` · ${p.dimension}` : ''}
                        </li>
                      ))}
                      {momento.total_pendientes > 8 && (
                        <li className="text-gray-400">… y {momento.total_pendientes - 8} más</li>
                      )}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {data?.dimensiones?.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Por dimensión
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-navy-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-navy-900/80 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Dimensión</th>
                  <th className="px-4 py-2">Sin utilidad</th>
                  <th className="px-4 py-2">Faltantes simulación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-navy-800">
                {data.dimensiones.map((dim) => (
                  <tr key={dim.omoe_id} className="bg-white dark:bg-navy-900/30">
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{dim.nombre}</td>
                    <td className="px-4 py-2">
                      {dim.total_sin_utilidad > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          {dim.total_sin_utilidad} nodo(s) terminal(es)
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {dim.total_faltantes > 0 ? dim.total_faltantes : (
                        <span className="text-green-600 dark:text-green-400">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.dimensiones.some((d) => d.nodos_sin_utilidad?.length > 0) && (
            <details className="text-xs text-gray-600 dark:text-gray-400">
              <summary className="cursor-pointer font-medium text-navy-700 dark:text-navy-300">
                Ver nodos terminales sin función de utilidad (informativo)
              </summary>
              <ul className="mt-2 space-y-1 pl-4 list-disc">
                {data.dimensiones.flatMap((d) =>
                  (d.nodos_sin_utilidad || []).map((n) => (
                    <li key={`${d.omoe_id}-${n.nodo_id}`}>
                      {d.nombre} → {n.nombre}
                      {n.tipo_nivel ? ` (${n.tipo_nivel})` : ''}
                    </li>
                  )),
                )}
              </ul>
            </details>
          )}
        </section>
      )}

      {data?.historial_sesiones?.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Historial de sesiones
          </h2>
          <ul className="space-y-2">
            {data.historial_sesiones.map((h) => (
              <li
                key={h.id}
                className="rounded-lg border border-gray-200 dark:border-navy-700 px-3 py-2 text-sm bg-white dark:bg-navy-900/30"
              >
                <div className="flex flex-wrap justify-between gap-1">
                  <span className="font-medium text-gray-900 dark:text-white">{h.momento_label}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(h.fecha).toLocaleString()}
                    {h.usuario ? ` · ${h.usuario}` : ''}
                  </span>
                </div>
                {h.omoe_nombre && (
                  <p className="text-xs text-navy-600 dark:text-navy-400">{h.omoe_nombre}</p>
                )}
                {h.notas && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{h.notas}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canWrite && (
        <section className="rounded-xl border border-dashed border-navy-500/30 p-4 bg-navy-500/[0.03]">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
            Registrar sesión de trabajo
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Documente cuando el equipo complete una sesión (p. ej. definición de utilidades o calibración de pesos).
          </p>
          <form onSubmit={handleRegistrarSesion} className="space-y-3 max-w-lg">
            <div>
              <label htmlFor="sesion-momento" className="block text-xs font-medium text-gray-500 mb-1">
                Momento
              </label>
              <select
                id="sesion-momento"
                value={sesionMomento}
                onChange={(e) => setSesionMomento(e.target.value)}
                className="form-select text-sm w-full"
              >
                {MOMENTO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sesion-notas" className="block text-xs font-medium text-gray-500 mb-1">
                Notas (opcional)
              </label>
              <textarea
                id="sesion-notas"
                value={sesionNotas}
                onChange={(e) => setSesionNotas(e.target.value)}
                rows={2}
                className="form-input text-sm w-full"
                placeholder="Participantes, acuerdos, pendientes…"
              />
            </div>
            {sesionError && <p className="text-xs text-red-500">{sesionError}</p>}
            <button
              type="submit"
              disabled={sesionSaving}
              className="btn btn-primary text-sm disabled:opacity-50"
            >
              {sesionSaving ? 'Guardando…' : 'Registrar sesión'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

export default TrazabilidadConfigPanel;
