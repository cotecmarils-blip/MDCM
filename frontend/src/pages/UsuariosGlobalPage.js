import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../context/AuthContext';
import { authApi, proyectos } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import UserMenu from '../components/UserMenu';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import UsuariosAssignModal from '../components/usuarios/UsuariosAssignModal';
import {
  ROL_LABELS,
  ESTADO_ACCESO_LABELS,
  formatFechaAcceso,
} from '../constants/usuarios';

function StatusBadge({ estado }) {
  const styles = {
    vigente: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    vencido: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    deshabilitado: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[estado] || styles.deshabilitado}`}>
      {ESTADO_ACCESO_LABELS[estado] || estado}
    </span>
  );
}

function UsuariosGlobalPage() {
  const { isDark } = useTheme();
  const {
    puedeGestionarUsuarios,
    proyectosAdministrables,
    esAdminGlobal,
  } = useAuth();

  const [memberships, setMemberships] = useState([]);
  const [proyectosList, setProyectosList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [filterProyecto, setFilterProyecto] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const manageableProjects = useMemo(() => {
    if (esAdminGlobal) return proyectosList;
    const ids = new Set((proyectosAdministrables || []).map((p) => p.proyecto_id));
    return proyectosList.filter((p) => ids.has(p.id));
  }, [esAdminGlobal, proyectosList, proyectosAdministrables]);

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return memberships.filter((m) => {
      if (filterProyecto && String(m.proyecto) !== filterProyecto) return false;
      if (!q) return true;
      const proyectoNombre = m.proyecto_nombre
        || proyectosList.find((p) => p.id === m.proyecto)?.nombre
        || '';
      const haystack = [
        m.usuario?.username,
        m.usuario?.email,
        m.usuario?.first_name,
        m.usuario?.last_name,
        proyectoNombre,
        ROL_LABELS[m.rol],
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [memberships, filterText, filterProyecto, proyectosList]);

  const stats = useMemo(() => ({
    total: memberships.length,
    vigentes: memberships.filter((m) => m.estado_acceso === 'vigente').length,
    usuarios: new Set(memberships.map((m) => m.usuario?.id).filter(Boolean)).size,
  }), [memberships]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [memRes, projRes] = await Promise.all([
        authApi.listMemberships(),
        proyectos.getAll(),
      ]);
      setMemberships(memRes.data || []);
      setProyectosList(projRes.data || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (puedeGestionarUsuarios) load();
  }, [load, puedeGestionarUsuarios]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setModalOpen(true);
  };

  const handleToggleAccess = async (m) => {
    try {
      if (m.acceso_vigente) {
        await authApi.updateMembership(m.id, { activo: false });
      } else {
        await authApi.updateMembership(m.id, { activo: true, dias_acceso: 30 });
      }
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo actualizar la licencia');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await authApi.deleteMembership(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo eliminar');
    }
  };

  if (!puedeGestionarUsuarios) {
    return <Navigate to="/" replace />;
  }

  const bg = isDark ? 'bg-gradient-to-br from-navy-950 to-navy-900' : 'bg-gradient-to-br from-navy-50 to-gray-50';
  const card = isDark ? 'bg-navy-900/80 border-navy-700/80' : 'bg-white border-gray-200/80';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`min-h-screen ${bg}`}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <Link
              to="/"
              className={`inline-flex items-center gap-1 text-sm mb-2 ${isDark ? 'text-navy-300 hover:text-white' : 'text-navy-600 hover:text-navy-800'}`}
            >
              ← Proyectos
            </Link>
            <h1 className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Usuarios y licencias
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ThemeToggle />
            <UserMenu isDark={isDark} />
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2.5 bg-navy-700 hover:bg-navy-800 text-white text-sm font-medium rounded-xl shadow-sm"
            >
              + Asignar usuario
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Usuarios', value: stats.usuarios },
            { label: 'Asignaciones', value: stats.total },
            { label: 'Licencias activas', value: stats.vigentes },
          ].map(({ label, value }) => (
            <div key={label} className={`rounded-xl border px-4 py-3 ${card}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${muted}`}>{label}</p>
              <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-400/50 text-red-700 dark:text-red-200 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="underline shrink-0 ml-3">Cerrar</button>
          </div>
        )}

        {/* Toolbar */}
        <div className={`rounded-xl border p-3 mb-4 flex flex-col sm:flex-row gap-3 ${card}`}>
          <div className="relative flex-1">
            <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${muted}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="search"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Buscar por usuario, correo o proyecto…"
              className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm ${
                isDark
                  ? 'bg-navy-950 border-navy-700 text-white placeholder:text-gray-500'
                  : 'bg-gray-50 border-gray-200 text-slate-900 placeholder:text-gray-400'
              } focus:outline-none focus:ring-2 focus:ring-navy-500/30`}
            />
          </div>
          <select
            value={filterProyecto}
            onChange={(e) => setFilterProyecto(e.target.value)}
            className={`sm:w-56 px-3 py-2.5 rounded-xl border text-sm ${
              isDark
                ? 'bg-navy-950 border-navy-700 text-white'
                : 'bg-gray-50 border-gray-200 text-slate-900'
            }`}
          >
            <option value="">Todos los proyectos</option>
            {manageableProjects.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.nombre}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className={`rounded-xl border overflow-hidden shadow-sm ${card}`}>
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-600" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-16 px-4">
              <p className={`text-lg font-medium mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {memberships.length === 0 ? 'Sin asignaciones aún' : 'Sin resultados'}
              </p>
              <p className={`text-sm mb-6 ${muted}`}>
                {memberships.length === 0
                  ? 'Asigne usuarios a proyectos para controlar quién accede y con qué rol.'
                  : 'Pruebe otro término de búsqueda o filtro.'}
              </p>
              {memberships.length === 0 && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="px-5 py-2.5 bg-navy-700 hover:bg-navy-800 text-white text-sm font-medium rounded-xl"
                >
                  Asignar primer usuario
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={isDark ? 'bg-navy-800/40 text-gray-400' : 'bg-gray-50 text-gray-500'}>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Usuario</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Proyecto</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide hidden md:table-cell">Rol</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide hidden lg:table-cell">Vence</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody className={isDark ? 'divide-y divide-navy-800' : 'divide-y divide-gray-100'}>
                  {filteredRows.map((m) => {
                    const proyectoNombre = m.proyecto_nombre
                      || proyectosList.find((p) => p.id === m.proyecto)?.nombre
                      || `#${m.proyecto}`;
                    return (
                      <tr
                        key={m.id}
                        className={isDark ? 'hover:bg-navy-800/30' : 'hover:bg-gray-50/80'}
                      >
                        <td className="px-4 py-3">
                          <div className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {m.usuario?.username}
                          </div>
                          {m.usuario?.email && (
                            <div className={`text-xs mt-0.5 ${muted}`}>{m.usuario.email}</div>
                          )}
                        </td>
                        <td className={`px-4 py-3 ${isDark ? 'text-gray-200' : 'text-slate-700'}`}>
                          {proyectoNombre}
                        </td>
                        <td className={`px-4 py-3 hidden md:table-cell ${muted}`}>
                          {ROL_LABELS[m.rol] || m.rol}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge estado={m.estado_acceso} />
                        </td>
                        <td className={`px-4 py-3 hidden lg:table-cell text-xs ${muted}`}>
                          {m.fecha_acceso_hasta ? formatFechaAcceso(m.fecha_acceso_hasta) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleToggleAccess(m)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                m.acceso_vigente
                                  ? isDark
                                    ? 'text-amber-300 hover:bg-amber-500/10'
                                    : 'text-amber-700 hover:bg-amber-50'
                                  : isDark
                                    ? 'text-emerald-300 hover:bg-emerald-500/10'
                                    : 'text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {m.acceso_vigente ? 'Suspender' : 'Activar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(m)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                                isDark ? 'text-navy-200 hover:bg-navy-800' : 'text-navy-700 hover:bg-navy-50'
                              }`}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(m)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                                isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'
                              }`}
                            >
                              Quitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className={`text-xs text-center mt-6 ${muted}`}>
          Desactivar la licencia en un proyecto no impide el acceso al software ni a otros proyectos.
        </p>
      </div>

      <UsuariosAssignModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSaved={load}
        editing={editing}
        manageableProjects={manageableProjects}
        isDark={isDark}
        onError={setError}
      />

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="Quitar del proyecto"
        message={`¿Quitar a ${deleteTarget?.usuario?.username} del proyecto "${deleteTarget?.proyecto_nombre || ''}"?`}
        confirmLabel="Quitar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default UsuariosGlobalPage;
