import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auditoriaEventosApi, omoeApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { ModalOverlay } from '../../utils/modalBackdrop';
import TrazabilidadConfigPanel from './TrazabilidadConfigPanel';

const emptyParticipante = () => ({
  usuario_id: null,
  nombre: '',
  cargo: '',
  rol: '',
  dependencia: '',
  externo: true,
});

const emptyEventoForm = () => ({
  nombre: '',
  descripcion: '',
  omoe_id: '',
  tipo_proceso: 'consenso',
  alcance_modo: 'dimension_completa',
  nodos_auditoria: [],
  mediador_usuario_id: null,
  mediador_modo: 'usuario',
  mediador_nombre: '',
  mediador_cargo: '',
  mediador_dependencia: '',
  participantes: [],
});

function displayUserName(user) {
  if (!user) return '';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return full || user.username || '';
}

const ESTADO_EVENTO = {
  borrador: 'bg-gray-100 text-gray-700 dark:bg-navy-800 dark:text-gray-300',
  activo: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  cerrado: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const TIPO_CAMBIO_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'peso', label: 'Peso' },
  { value: 'utilidad', label: 'Función de utilidad' },
  { value: 'matriz', label: 'Matriz AHP' },
  { value: 'estructura', label: 'Estructura' },
  { value: 'config_escenario', label: 'Config. escenario' },
];

function formatFecha(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatDiffValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function ValorDiff({ anterior, nuevo }) {
  const a = formatDiffValue(anterior);
  const b = formatDiffValue(nuevo);
  if (a === b) return <span className="text-gray-500">{b}</span>;
  return (
    <span className="text-xs font-mono inline-flex flex-wrap items-center gap-1">
      <span className="text-red-600 dark:text-red-400 line-through">{a}</span>
      <span className="text-gray-400" aria-hidden>→</span>
      <span className="text-green-700 dark:text-green-400">{b}</span>
    </span>
  );
}

function AccionAuditoriaRow({ r }) {
  const [open, setOpen] = useState(false);
  const resumen = r.accion_resumen
    || (r.campo === 'juicios'
      ? `Comparaciones AHP · ${r.entidad_nombre || ''}`
      : r.campo === 'parametros_funcion'
        ? `Constantes / función · ${r.entidad_nombre || ''}`
        : null);
  const nEfectos = r.n_efectos || (r.efectos || []).length;

  return (
    <>
      <tr className="bg-white dark:bg-navy-900/30">
        <td className="px-3 py-2 whitespace-nowrap text-xs">{formatFecha(r.fecha_creacion)}</td>
        <td className="px-3 py-2">{r.evento_nombre}</td>
        <td className="px-3 py-2">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {resumen || r.tipo_cambio_label}
          </div>
          {resumen && (
            <div className="text-[11px] text-gray-400 mt-0.5">{r.tipo_cambio_label}</div>
          )}
        </td>
        <td className="px-3 py-2">
          <span className="font-medium">{r.entidad_nombre || r.entidad_tipo}</span>
          {r.omoe_nombre && (
            <span className="block text-[11px] text-gray-400">{r.omoe_nombre}</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs">{r.campo || '—'}</td>
        <td className="px-3 py-2">
          <ValorDiff anterior={r.valor_anterior} nuevo={r.valor_nuevo} />
          {nEfectos > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-navy-600 dark:text-navy-300 hover:underline"
            >
              {open ? 'Ocultar efectos' : `Ver ${nEfectos} efecto(s)`}
            </button>
          )}
        </td>
        <td className="px-3 py-2 text-xs">{r.usuario || '—'}</td>
      </tr>
      {open && nEfectos > 0 && (
        <tr className="bg-slate-50 dark:bg-navy-950/50">
          <td colSpan={7} className="px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Efectos derivados de esta acción
            </p>
            <ul className="space-y-1.5">
              {(r.efectos || []).map((ef) => (
                <li
                  key={ef.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs border-l-2 border-navy-300 dark:border-navy-600 pl-2"
                >
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {ef.tipo_cambio_label}
                    {ef.entidad_nombre ? ` · ${ef.entidad_nombre}` : ''}
                  </span>
                  <span className="text-gray-400">{ef.campo}</span>
                  <ValorDiff anterior={ef.valor_anterior} nuevo={ef.valor_nuevo} />
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function AuditoriaEventosPanel({ proyectoId, canWrite = false }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('eventos');
  const [eventos, setEventos] = useState([]);
  const [eventoActivo, setEventoActivo] = useState(null);
  const [auditoria, setAuditoria] = useState(null);
  const [dimensiones, setDimensiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyEventoForm());
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [cerrarJustificacion, setCerrarJustificacion] = useState('');
  const [cerrarTarget, setCerrarTarget] = useState(null);
  const [colaboradores, setColaboradores] = useState([]);
  const [colaboradoresLoading, setColaboradoresLoading] = useState(false);
  const [addParticipanteSelect, setAddParticipanteSelect] = useState('');

  const [filtros, setFiltros] = useState({
    evento: '',
    omoe: '',
    participante: '',
    nodo: '',
    tipo_cambio: '',
  });

  const [historialOmoe, setHistorialOmoe] = useState('');
  const [historialNodoId, setHistorialNodoId] = useState('');
  const [nodosAuditoria, setNodosAuditoria] = useState([]);
  const [nodosLoading, setNodosLoading] = useState(false);
  const [historialNodo, setHistorialNodo] = useState(null);
  const [historialLoading, setHistorialLoading] = useState(false);

  const [nodosPicker, setNodosPicker] = useState([]);
  const [nodosPickerLoading, setNodosPickerLoading] = useState(false);

  const loadDimensiones = useCallback(async () => {
    try {
      const { data } = await omoeApi.getByProyecto(proyectoId);
      setDimensiones(data || []);
    } catch {
      setDimensiones([]);
    }
  }, [proyectoId]);

  const loadEventos = useCallback(async () => {
    const [{ data: listData }, { data: activoData }] = await Promise.all([
      auditoriaEventosApi.list(proyectoId),
      auditoriaEventosApi.activo(proyectoId),
    ]);
    setEventos(listData?.eventos || []);
    setEventoActivo(activoData?.evento_activo || null);
  }, [proyectoId]);

  const loadAuditoria = useCallback(async () => {
    const params = {};
    if (filtros.evento) params.evento = filtros.evento;
    if (filtros.omoe) params.omoe = filtros.omoe;
    if (filtros.participante) params.participante = filtros.participante;
    if (filtros.nodo) params.nodo = filtros.nodo;
    if (filtros.tipo_cambio) params.tipo_cambio = filtros.tipo_cambio;
    const { data } = await auditoriaEventosApi.auditoria(proyectoId, params);
    setAuditoria(data);
    if (data?.evento_activo) setEventoActivo(data.evento_activo);
  }, [proyectoId, filtros]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      await loadDimensiones();
      await loadEventos();
      if (tab === 'auditoria') await loadAuditoria();
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar la auditoría.');
    } finally {
      setLoading(false);
    }
  }, [loadDimensiones, loadEventos, loadAuditoria, tab]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === 'auditoria') {
      loadAuditoria().catch(() => {});
    }
  }, [tab, loadAuditoria]);

  const loadNodosAuditoria = useCallback(async (omoeId) => {
    setNodosLoading(true);
    try {
      const params = omoeId ? { omoe: omoeId } : {};
      const { data } = await auditoriaEventosApi.nodosAuditoria(proyectoId, params);
      setNodosAuditoria(data?.nodos || []);
    } catch {
      setNodosAuditoria([]);
    } finally {
      setNodosLoading(false);
    }
  }, [proyectoId]);

  const loadHistorialNodo = useCallback(async (entidadId) => {
    if (!entidadId) {
      setHistorialNodo(null);
      return;
    }
    setHistorialLoading(true);
    try {
      const { data } = await auditoriaEventosApi.historialNodo(proyectoId, {
        entidad_id: entidadId,
        entidad_tipo: 'nodo_arbol',
      });
      setHistorialNodo(data);
    } catch (err) {
      setHistorialNodo(null);
      setError(err.response?.data?.detail || 'No se pudo cargar la hoja de vida del nodo.');
    } finally {
      setHistorialLoading(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    if (tab !== 'historial-nodo') return;
    loadNodosAuditoria(historialOmoe || undefined).catch(() => {});
  }, [tab, historialOmoe, loadNodosAuditoria]);

  useEffect(() => {
    if (tab !== 'historial-nodo') return;
    loadHistorialNodo(historialNodoId || null).catch(() => {});
  }, [tab, historialNodoId, loadHistorialNodo]);

  useEffect(() => {
    if (!showForm) {
      setColaboradores([]);
      setAddParticipanteSelect('');
      return;
    }
    let cancelled = false;
    setColaboradoresLoading(true);
    auditoriaEventosApi.colaboradores(proyectoId)
      .then(({ data }) => {
        if (!cancelled) setColaboradores(data?.colaboradores || []);
      })
      .catch(() => {
        if (!cancelled) setColaboradores([]);
      })
      .finally(() => {
        if (!cancelled) setColaboradoresLoading(false);
      });
    return () => { cancelled = true; };
  }, [showForm, proyectoId]);

  const openCreate = () => {
    setEditId(null);
    const base = emptyEventoForm();
    if (user) {
      base.mediador_usuario_id = user.id;
      base.mediador_modo = 'usuario';
      base.mediador_nombre = displayUserName(user);
    }
    setForm(base);
    setShowForm(true);
  };

  const openEdit = (evento) => {
    if (evento.estado === 'cerrado') return;
    setEditId(evento.id);
    setForm({
      nombre: evento.nombre || '',
      descripcion: evento.descripcion || '',
      omoe_id: evento.omoe_id ? String(evento.omoe_id) : '',
      tipo_proceso: evento.tipo_proceso || 'consenso',
      alcance_modo: evento.alcance_modo || 'dimension_completa',
      nodos_auditoria: (evento.nodos_auditoria || []).map((n) => n.nodo_id),
      mediador_usuario_id: evento.mediador_usuario_id || null,
      mediador_modo: evento.mediador_usuario_id ? 'usuario' : 'externo',
      mediador_nombre: evento.mediador_nombre || evento.mediador_usuario || '',
      mediador_cargo: evento.mediador_cargo || '',
      mediador_dependencia: evento.mediador_dependencia || '',
      participantes: (evento.participantes || []).map((p) => ({
        usuario_id: p.usuario_id || null,
        nombre: p.nombre || '',
        cargo: p.cargo || '',
        rol: p.rol || '',
        dependencia: p.dependencia || '',
        externo: !p.usuario_id,
      })),
    });
    setShowForm(true);
  };

  const handleActivar = async (eventoId) => {
    setActionId(eventoId);
    try {
      await auditoriaEventosApi.activar(proyectoId, eventoId);
      await loadEventos();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo activar la sesión de trabajo.');
    } finally {
      setActionId(null);
    }
  };

  const handleCerrar = async () => {
    if (!cerrarTarget) return;
    setActionId(cerrarTarget);
    try {
      await auditoriaEventosApi.cerrar(proyectoId, cerrarTarget, {
        justificacion_cierre: cerrarJustificacion,
      });
      setCerrarTarget(null);
      setCerrarJustificacion('');
      await loadEventos();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cerrar la sesión de trabajo.');
    } finally {
      setActionId(null);
    }
  };

  const handleExportInforme = async (eventoId) => {
    try {
      const { data } = await auditoriaEventosApi.informe(proyectoId, eventoId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe-sesion-${eventoId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo exportar el informe.');
    }
  };

  const updateParticipante = (idx, field, value) => {
    setForm((prev) => {
      const participantes = [...prev.participantes];
      participantes[idx] = { ...participantes[idx], [field]: value };
      return { ...prev, participantes };
    });
  };

  const removeParticipante = (idx) => {
    setForm((prev) => ({
      ...prev,
      participantes: prev.participantes.filter((_, i) => i !== idx),
    }));
  };

  const handleMediadorSelect = (rawId) => {
    if (!rawId) {
      setForm((prev) => ({
        ...prev,
        mediador_usuario_id: null,
        mediador_modo: 'externo',
        mediador_nombre: '',
        mediador_cargo: '',
      }));
      return;
    }
    const id = Number(rawId);
    const col = colaboradores.find((c) => c.usuario_id === id);
    setForm((prev) => ({
      ...prev,
      mediador_usuario_id: id,
      mediador_modo: 'usuario',
      mediador_nombre: col?.nombre || prev.mediador_nombre,
      mediador_cargo: col?.rol_label || prev.mediador_cargo,
    }));
  };

  const participantesDisponibles = useMemo(() => {
    const usados = new Set(form.participantes.map((p) => p.usuario_id).filter(Boolean));
    return colaboradores.filter((c) => !usados.has(c.usuario_id));
  }, [colaboradores, form.participantes]);

  const handleAddParticipanteProyecto = (rawId) => {
    if (!rawId) return;
    const id = Number(rawId);
    const col = colaboradores.find((c) => c.usuario_id === id);
    if (!col) return;
    setForm((prev) => ({
      ...prev,
      participantes: [
        ...prev.participantes,
        {
          usuario_id: col.usuario_id,
          nombre: col.nombre,
          cargo: '',
          rol: col.rol_label,
          dependencia: '',
          externo: false,
        },
      ],
    }));
    setAddParticipanteSelect('');
  };

  useEffect(() => {
    if (!showForm || form.alcance_modo !== 'nodos_seleccionados' || !form.omoe_id) {
      setNodosPicker([]);
      return;
    }
    let cancelled = false;
    setNodosPickerLoading(true);
    auditoriaEventosApi.nodosAuditoria(proyectoId, { omoe: form.omoe_id })
      .then(({ data }) => {
        if (!cancelled) setNodosPicker(data?.nodos || []);
      })
      .catch(() => {
        if (!cancelled) setNodosPicker([]);
      })
      .finally(() => {
        if (!cancelled) setNodosPickerLoading(false);
      });
    return () => { cancelled = true; };
  }, [showForm, form.alcance_modo, form.omoe_id, proyectoId]);

  useEffect(() => {
    if (!showForm || editId || !user?.id || !colaboradores.length) return;
    const yo = colaboradores.find((c) => c.usuario_id === user.id);
    if (!yo) return;
    setForm((prev) => {
      if (prev.mediador_usuario_id && prev.mediador_nombre) return prev;
      return {
        ...prev,
        mediador_usuario_id: yo.usuario_id,
        mediador_modo: 'usuario',
        mediador_nombre: yo.nombre,
        mediador_cargo: yo.rol_label,
      };
    });
  }, [showForm, editId, user, colaboradores]);

  const toggleNodoAuditoria = (nodoId) => {
    const id = Number(nodoId);
    setForm((prev) => {
      const set = new Set((prev.nodos_auditoria || []).map(Number));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, nodos_auditoria: [...set] };
    });
  };

  const handleSaveEvento = async (e) => {
    e.preventDefault();
    if (form.alcance_modo === 'nodos_seleccionados') {
      if (!form.omoe_id) {
        setError('Para auditar nodos específicos debe elegir una dimensión.');
        return;
      }
      if (!form.nodos_auditoria.length) {
        setError('Seleccione al menos un nodo a auditar en esta sesión.');
        return;
      }
    }
    setSaving(true);
    setError(null);
    const body = {
      ...form,
      omoe_id: form.omoe_id ? Number(form.omoe_id) : null,
      alcance_modo: form.alcance_modo || 'dimension_completa',
      nodos_auditoria:
        form.alcance_modo === 'nodos_seleccionados'
          ? form.nodos_auditoria.map(Number)
          : [],
      mediador_usuario_id: form.mediador_modo === 'usuario' ? form.mediador_usuario_id : null,
      participantes: form.participantes
        .filter((p) => p.nombre.trim())
        .map(({ usuario_id, nombre, cargo, rol, dependencia }) => ({
          usuario_id: usuario_id || null,
          nombre: nombre.trim(),
          cargo: (cargo || '').trim(),
          rol: (rol || '').trim(),
          dependencia: (dependencia || '').trim(),
        })),
    };
    try {
      if (editId) {
        await auditoriaEventosApi.update(proyectoId, editId, body);
      } else {
        await auditoriaEventosApi.create(proyectoId, body);
      }
      setShowForm(false);
      await loadEventos();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar la sesión de trabajo.');
    } finally {
      setSaving(false);
    }
  };

  const alcanceResumen = (ev) => {
    if (ev.alcance_modo === 'nodos_seleccionados') {
      const n = ev.nodos_auditoria?.length || 0;
      return n ? `${n} nodo(s) en alcance` : 'Nodos sin definir';
    }
    if (ev.omoe_nombre) return `Dimensión completa · ${ev.omoe_nombre}`;
    return 'Proyecto completo';
  };

  const eventosOrdenados = useMemo(
    () => [...eventos].sort((a, b) => (b.id || 0) - (a.id || 0)),
    [eventos],
  );

  if (loading && !eventos.length && !auditoria) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full overflow-y-auto space-y-6">
      <header>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Auditoría y sesiones de trabajo
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
          Registre mesas de trabajo con expertos. Mientras una sesión esté activa, los cambios
          de pesos, matrices AHP y funciones de utilidad quedan asociados automáticamente
          a la sesión para trazabilidad posterior.
        </p>
      </header>

      {eventoActivo && (
        <div className="rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-green-800 dark:text-green-300">
                Sesión activa
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{eventoActivo.nombre}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {alcanceResumen(eventoActivo)}
                {' · '}
                Inicio: {formatFecha(eventoActivo.fecha_inicio)}
                {' · '}
                {eventoActivo.participantes?.length || 0} participante(s)
              </p>
              {eventoActivo.alcance_modo === 'nodos_seleccionados'
                && eventoActivo.nodos_auditoria?.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Nodos: {eventoActivo.nodos_auditoria.map((n) => n.nombre).join(', ')}
                </p>
              )}
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => setCerrarTarget(eventoActivo.id)}
                className="btn btn-secondary text-sm shrink-0"
              >
                Cerrar sesión
              </button>
            )}
          </div>
        </div>
      )}

      {!eventoActivo && canWrite && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-200">
          No hay sesión activa. Active una sesión de trabajo antes de la mesa con expertos para que los
          cambios en pesos y utilidades queden auditados.
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 border-b border-gray-200 dark:border-navy-700">
        {[
          { id: 'eventos', label: 'Sesiones de trabajo' },
          { id: 'auditoria', label: 'Historial de cambios' },
          { id: 'historial-nodo', label: 'Hoja de vida del nodo' },
          { id: 'estado', label: 'Estado del modelo' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-navy-600 text-navy-700 dark:text-navy-300'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'eventos' && (
        <section className="space-y-4">
          {canWrite && (
            <button type="button" onClick={openCreate} className="btn btn-primary text-sm">
              Nueva sesión de trabajo
            </button>
          )}

          <div className="space-y-3">
            {eventosOrdenados.map((ev) => (
              <article
                key={ev.id}
                className="rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{ev.nombre}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_EVENTO[ev.estado] || ''}`}>
                        {ev.estado_label || ev.estado}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {alcanceResumen(ev)}
                      {' · '}
                      {ev.tipo_proceso_label}
                      {' · '}
                      {ev.total_registros ?? 0} cambio(s) registrado(s)
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatFecha(ev.fecha_inicio)} — {formatFecha(ev.fecha_cierre)}
                    </p>
                    {ev.participantes?.length > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        Participantes: {ev.participantes.map((p) => p.nombre).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-sm btn-secondary"
                      onClick={() => handleExportInforme(ev.id)}
                    >
                      Exportar informe
                    </button>
                    {canWrite && ev.estado !== 'cerrado' && (
                      <button
                        type="button"
                        className="btn-sm btn-secondary"
                        onClick={() => openEdit(ev)}
                      >
                        Editar
                      </button>
                    )}
                    {canWrite && ev.estado === 'borrador' && (
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        disabled={actionId === ev.id}
                        onClick={() => handleActivar(ev.id)}
                      >
                        Activar
                      </button>
                    )}
                    {canWrite && ev.estado === 'activo' && (
                      <button
                        type="button"
                        className="btn-sm btn-secondary"
                        onClick={() => setCerrarTarget(ev.id)}
                      >
                        Cerrar
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {!eventosOrdenados.length && (
              <p className="text-sm text-gray-500">Aún no hay sesiones de trabajo registradas.</p>
            )}
          </div>
        </section>
      )}

      {tab === 'auditoria' && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sesión de trabajo</label>
              <select
                value={filtros.evento}
                onChange={(e) => setFiltros((f) => ({ ...f, evento: e.target.value }))}
                className="form-select text-sm w-full"
              >
                <option value="">Todos</option>
                {eventos.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Dimensión</label>
              <select
                value={filtros.omoe}
                onChange={(e) => setFiltros((f) => ({ ...f, omoe: e.target.value }))}
                className="form-select text-sm w-full"
              >
                <option value="">Todas</option>
                {dimensiones.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre_modelo || d.codigo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Participante</label>
              <input
                type="text"
                value={filtros.participante}
                onChange={(e) => setFiltros((f) => ({ ...f, participante: e.target.value }))}
                className="form-input text-sm w-full"
                placeholder="Nombre"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nodo (ID)</label>
              <input
                type="text"
                value={filtros.nodo}
                onChange={(e) => setFiltros((f) => ({ ...f, nodo: e.target.value }))}
                className="form-input text-sm w-full"
                placeholder="Ej. 42"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo de cambio</label>
              <select
                value={filtros.tipo_cambio}
                onChange={(e) => setFiltros((f) => ({ ...f, tipo_cambio: e.target.value }))}
                className="form-select text-sm w-full"
              >
                {TIPO_CAMBIO_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            {auditoria?.total_acciones != null
              ? `${auditoria.total_acciones} acción(es)`
              : `${auditoria?.items?.length ?? 0} acción(es)`}
            {auditoria?.total != null && auditoria.total !== auditoria.total_acciones && (
              <span> · {auditoria.total} registro(s) técnicos</span>
            )}
            {' · '}mostrando {auditoria?.items?.length ?? 0}
          </p>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-navy-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-navy-800 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Sesión</th>
                  <th className="px-3 py-2">Acción</th>
                  <th className="px-3 py-2">Entidad</th>
                  <th className="px-3 py-2">Campo</th>
                  <th className="px-3 py-2">Cambio</th>
                  <th className="px-3 py-2">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-navy-700">
                {(auditoria?.items || []).map((r) => (
                  <AccionAuditoriaRow key={r.id} r={r} />
                ))}
                {!(auditoria?.items || []).length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">
                      Sin registros con los filtros actuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'historial-nodo' && (
        <section className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-3xl">
            Consulte la trazabilidad completa de un criterio o nodo del árbol: creación,
            cambios de peso, función de utilidad y sesiones de trabajo en las que participó.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Dimensión</label>
              <select
                value={historialOmoe}
                onChange={(e) => {
                  setHistorialOmoe(e.target.value);
                  setHistorialNodoId('');
                  setHistorialNodo(null);
                }}
                className="form-select text-sm w-full"
              >
                <option value="">Todas las dimensiones</option>
                {dimensiones.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre_modelo || d.codigo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nodo del árbol</label>
              <select
                value={historialNodoId}
                onChange={(e) => setHistorialNodoId(e.target.value)}
                className="form-select text-sm w-full"
                disabled={nodosLoading}
              >
                <option value="">
                  {nodosLoading ? 'Cargando nodos…' : 'Seleccione un nodo…'}
                </option>
                {nodosAuditoria.map((n) => (
                  <option key={n.entidad_id} value={n.entidad_id}>
                    {n.nombre}
                    {n.tipo_nivel ? ` (${n.tipo_nivel})` : ''}
                    {n.codigo ? ` · ${n.codigo}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {historialLoading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-600" />
            </div>
          )}

          {!historialLoading && historialNodo?.entidad && (
            <div className="rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900/50 p-4 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {historialNodo.entidad.nombre}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {historialNodo.entidad.omoe_nombre}
                  {historialNodo.entidad.tipo_nivel && (
                    <> · {historialNodo.entidad.tipo_nivel}</>
                  )}
                  {historialNodo.entidad.codigo && (
                    <> · Código: {historialNodo.entidad.codigo}</>
                  )}
                </p>
                {historialNodo.sesiones?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    {historialNodo.sesiones.length} sesión(es) de trabajo registrada(s)
                  </p>
                )}
              </div>

              <ol className="relative border-l border-gray-200 dark:border-navy-700 ml-3 space-y-6">
                {(historialNodo.timeline || []).map((item, idx) => {
                  const fecha = item.fecha_creacion;
                  const isSistema = item.kind === 'sistema';
                  return (
                    <li key={item.id || `sys-${idx}`} className="ml-6">
                      <span
                        className={`absolute -left-1.5 flex h-3 w-3 rounded-full ring-4 ring-white dark:ring-navy-900 ${
                          isSistema
                            ? 'bg-gray-400'
                            : 'bg-navy-500'
                        }`}
                      />
                      <div className="rounded-lg border border-gray-100 dark:border-navy-800 p-3 bg-gray-50/80 dark:bg-navy-800/40">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-1">
                          <time>{formatFecha(fecha)}</time>
                          {item.evento_nombre && (
                            <>
                              <span>·</span>
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {item.evento_nombre}
                              </span>
                              {item.evento_estado_label && (
                                <span className={`px-1.5 py-0.5 rounded ${ESTADO_EVENTO[item.evento_estado] || ''}`}>
                                  {item.evento_estado_label}
                                </span>
                              )}
                            </>
                          )}
                          {isSistema && (
                            <span className="text-gray-400 italic">Sistema</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.tipo_cambio_label || item.tipo_cambio}
                          {item.campo && item.campo !== 'creacion' && (
                            <span className="font-normal text-gray-500"> · {item.campo}</span>
                          )}
                        </p>
                        {!isSistema && (
                          <div className="mt-2">
                            <ValorDiff anterior={item.valor_anterior} nuevo={item.valor_nuevo} />
                          </div>
                        )}
                        {item.notas && (
                          <p className="text-xs text-gray-500 mt-2 italic">{item.notas}</p>
                        )}
                        {item.usuario && (
                          <p className="text-xs text-gray-400 mt-1">Por: {item.usuario}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              {!historialNodo.timeline?.length && (
                <p className="text-sm text-gray-500">
                  Este nodo no tiene cambios auditados aún.
                </p>
              )}
            </div>
          )}

          {!historialLoading && historialNodoId && !historialNodo?.entidad && (
            <p className="text-sm text-gray-500">Nodo no encontrado.</p>
          )}

          {!historialNodoId && !historialLoading && (
            <p className="text-sm text-gray-500">
              Seleccione un nodo para ver su historial completo.
            </p>
          )}
        </section>
      )}

      {tab === 'estado' && (
        <TrazabilidadConfigPanel proyectoId={proyectoId} canWrite={canWrite} embedded />
      )}

      {showForm && (
        <ModalOverlay onClose={() => setShowForm(false)}>
          <form
            onSubmit={handleSaveEvento}
            className="bg-white dark:bg-navy-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {editId ? 'Editar sesión de trabajo' : 'Nueva sesión de trabajo'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Nombre de la reunión *</label>
                <input
                  required
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  className="form-input w-full text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                <textarea
                  rows={2}
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className="form-input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Dimensión trabajada
                  {form.alcance_modo === 'nodos_seleccionados' ? ' *' : ''}
                </label>
                <select
                  value={form.omoe_id}
                  required={form.alcance_modo === 'nodos_seleccionados'}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    omoe_id: e.target.value,
                    nodos_auditoria: [],
                  }))}
                  className="form-select w-full text-sm"
                >
                  <option value="">
                    {form.alcance_modo === 'nodos_seleccionados'
                      ? 'Seleccione una dimensión…'
                      : 'Todo el proyecto'}
                  </option>
                  {dimensiones.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre_modelo || d.codigo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo de proceso</label>
                <select
                  value={form.tipo_proceso}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_proceso: e.target.value }))}
                  className="form-select w-full text-sm"
                >
                  <option value="consenso">Consenso directo</option>
                  <option value="agregacion">Agregación individual (futuro)</option>
                </select>
              </div>
            </div>

            <fieldset className="border border-gray-200 dark:border-navy-700 rounded-lg p-3 space-y-3">
              <legend className="text-xs font-semibold text-gray-600 dark:text-gray-300 px-1">
                Alcance de auditoría
              </legend>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Defina qué nodos se registran mientras la sesión esté activa. Los hijos de un nodo
                seleccionado también quedan incluidos.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="alcance_modo"
                    value="dimension_completa"
                    checked={form.alcance_modo === 'dimension_completa'}
                    onChange={() => setForm((f) => ({
                      ...f,
                      alcance_modo: 'dimension_completa',
                      nodos_auditoria: [],
                    }))}
                  />
                  Toda la dimensión / proyecto
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="alcance_modo"
                    value="nodos_seleccionados"
                    checked={form.alcance_modo === 'nodos_seleccionados'}
                    onChange={() => setForm((f) => ({
                      ...f,
                      alcance_modo: 'nodos_seleccionados',
                    }))}
                  />
                  Nodos específicos
                </label>
              </div>
              {form.alcance_modo === 'nodos_seleccionados' && !form.omoe_id && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Elija una dimensión arriba para listar y marcar los nodos a auditar.
                </p>
              )}
              {form.alcance_modo === 'nodos_seleccionados' && form.omoe_id && (
                <div className="rounded-lg border border-gray-100 dark:border-navy-800 max-h-44 overflow-y-auto p-2 space-y-1">
                  {nodosPickerLoading && (
                    <p className="text-xs text-gray-400 px-1">Cargando nodos…</p>
                  )}
                  {!nodosPickerLoading && !nodosPicker.length && (
                    <p className="text-xs text-gray-400 px-1">No hay nodos en esta dimensión.</p>
                  )}
                  {nodosPicker.map((n) => {
                    const nid = Number(n.entidad_id);
                    const checked = form.nodos_auditoria.some((id) => Number(id) === nid);
                    return (
                      <label
                        key={nid}
                        className="flex items-start gap-2 px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-navy-800/40 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => toggleNodoAuditoria(nid)}
                        />
                        <span>
                          <span className="font-medium text-gray-800 dark:text-gray-200">{n.nombre}</span>
                          {n.tipo_nivel && (
                            <span className="text-gray-400"> · {n.tipo_nivel}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {form.alcance_modo === 'nodos_seleccionados' && form.nodos_auditoria.length > 0 && (
                <p className="text-xs text-gray-500">
                  {form.nodos_auditoria.length} nodo(s) seleccionado(s)
                </p>
              )}
            </fieldset>

            <fieldset className="border border-gray-200 dark:border-navy-700 rounded-lg p-3 space-y-3">
              <legend className="text-xs font-semibold text-gray-600 dark:text-gray-300 px-1">
                Mediador (quien opera el software)
              </legend>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Persona que facilita la reunión y registra en el sistema los pesos o matrices acordados.
                Por defecto se propone su usuario actual.
              </p>
              {colaboradoresLoading ? (
                <p className="text-xs text-gray-400">Cargando usuarios del proyecto…</p>
              ) : colaboradores.length > 0 ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Seleccionar mediador</label>
                  <select
                    value={form.mediador_modo === 'usuario' && form.mediador_usuario_id
                      ? String(form.mediador_usuario_id)
                      : form.mediador_modo === 'externo' ? 'externo' : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'externo') {
                        setForm((prev) => ({
                          ...prev,
                          mediador_usuario_id: null,
                          mediador_modo: 'externo',
                        }));
                      } else {
                        handleMediadorSelect(val);
                      }
                    }}
                    className="form-select w-full text-sm"
                  >
                    <option value="">Seleccione un usuario…</option>
                    {colaboradores.map((c) => (
                      <option key={c.usuario_id} value={c.usuario_id}>
                        {c.nombre} ({c.rol_label})
                      </option>
                    ))}
                    <option value="externo">Otra persona (sin usuario en el sistema)</option>
                  </select>
                </div>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  No se pudieron cargar usuarios del proyecto. Complete los datos manualmente.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  placeholder="Nombre"
                  value={form.mediador_nombre}
                  onChange={(e) => setForm((f) => ({ ...f, mediador_nombre: e.target.value }))}
                  className="form-input text-sm"
                  readOnly={form.mediador_modo === 'usuario' && Boolean(form.mediador_usuario_id)}
                />
                <input
                  placeholder="Cargo"
                  value={form.mediador_cargo}
                  onChange={(e) => setForm((f) => ({ ...f, mediador_cargo: e.target.value }))}
                  className="form-input text-sm"
                />
                <input
                  placeholder="Dependencia"
                  value={form.mediador_dependencia}
                  onChange={(e) => setForm((f) => ({ ...f, mediador_dependencia: e.target.value }))}
                  className="form-input text-sm"
                />
              </div>
            </fieldset>

            <fieldset className="border border-gray-200 dark:border-navy-700 rounded-lg p-3 space-y-3">
              <legend className="text-xs font-semibold text-gray-600 dark:text-gray-300 px-1">
                Participantes (expertos en la mesa)
              </legend>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Personas que aportaron juicios en la reunión. Puede agregar usuarios del proyecto
                o expertos externos que no tienen cuenta en el software.
              </p>
              {colaboradores.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={addParticipanteSelect}
                    onChange={(e) => handleAddParticipanteProyecto(e.target.value)}
                    className="form-select text-sm flex-1 min-w-[14rem]"
                  >
                    <option value="">+ Agregar usuario del proyecto…</option>
                    {participantesDisponibles.map((c) => (
                      <option key={c.usuario_id} value={c.usuario_id}>
                        {c.nombre} — {c.rol_label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    onClick={() => setForm((f) => ({
                      ...f,
                      participantes: [...f.participantes, emptyParticipante()],
                    }))}
                  >
                    + Experto externo
                  </button>
                </div>
              )}
              {form.participantes.length === 0 && (
                <p className="text-xs text-gray-400 italic">
                  Aún no hay participantes. Agregue usuarios del proyecto o un experto externo.
                </p>
              )}
              {form.participantes.map((p, idx) => (
                <div
                  key={`${p.usuario_id || 'ext'}-${idx}`}
                  className="rounded-lg border border-gray-100 dark:border-navy-800 p-2 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      {p.externo ? 'Experto externo' : 'Usuario del proyecto'}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:text-red-600"
                      onClick={() => removeParticipante(idx)}
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      placeholder="Nombre *"
                      value={p.nombre}
                      onChange={(e) => updateParticipante(idx, 'nombre', e.target.value)}
                      className="form-input text-sm"
                      readOnly={Boolean(p.usuario_id)}
                    />
                    <input
                      placeholder="Cargo"
                      value={p.cargo}
                      onChange={(e) => updateParticipante(idx, 'cargo', e.target.value)}
                      className="form-input text-sm"
                    />
                    <input
                      placeholder="Rol en la mesa"
                      value={p.rol}
                      onChange={(e) => updateParticipante(idx, 'rol', e.target.value)}
                      className="form-input text-sm"
                    />
                    <input
                      placeholder="Dependencia"
                      value={p.dependencia}
                      onChange={(e) => updateParticipante(idx, 'dependencia', e.target.value)}
                      className="form-input text-sm"
                    />
                  </div>
                </div>
              ))}
              {!colaboradores.length && (
                <button
                  type="button"
                  className="text-xs text-navy-600 dark:text-navy-300"
                  onClick={() => setForm((f) => ({
                    ...f,
                    participantes: [...f.participantes, emptyParticipante()],
                  }))}
                >
                  + Agregar participante manualmente
                </button>
              )}
            </fieldset>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary text-sm" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary text-sm disabled:opacity-50" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {cerrarTarget && (
        <ModalOverlay onClose={() => setCerrarTarget(null)}>
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Cerrar sesión de trabajo</h2>
            <p className="text-sm text-gray-500">
              Al cerrar la sesión deja de registrarse la auditoría automática de cambios.
            </p>
            <textarea
              rows={3}
              placeholder="Justificación u observaciones del consenso (opcional)"
              value={cerrarJustificacion}
              onChange={(e) => setCerrarJustificacion(e.target.value)}
              className="form-input w-full text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary text-sm" onClick={() => setCerrarTarget(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm disabled:opacity-50"
                disabled={actionId === cerrarTarget}
                onClick={handleCerrar}
              >
                Confirmar cierre
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

export default AuditoriaEventosPanel;
