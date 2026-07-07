import React, { useCallback, useEffect, useState } from 'react';
import { authApi, omoeApi, alternativas as alternativasApi } from '../../api';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import { getApiErrorMessage } from '../../utils/apiErrors';

const ROL_OPTIONS = [
  { value: 'jefe', label: 'Gerente' },
  { value: 'analista', label: 'Ingeniero' },
  { value: 'evaluador', label: 'Evaluador / experto' },
  { value: 'ofertante', label: 'Proveedor' },
  { value: 'auditor', label: 'Auditor (solo lectura)' },
];

const ROL_LABELS = Object.fromEntries(ROL_OPTIONS.map((o) => [o.value, o.label]));

const ESTADO_ACCESO_LABELS = {
  vigente: 'Vigente',
  vencido: 'Vencido',
  deshabilitado: 'Deshabilitado',
};

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

function defaultForm() {
  return {
    username: '',
    email: '',
    password: '',
    passwordConfirm: '',
    first_name: '',
    last_name: '',
    rol: 'analista',
    activo: true,
    tipoAcceso: 'ilimitado',
    dias_acceso: 30,
    horas_acceso: 0,
    minutos_acceso: 0,
    limpiar_vencimiento: false,
    mision_ids: [],
    alternativa_ids: [],
  };
}

function UsuariosPanel({ proyectoId, canManage }) {
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [misiones, setMisiones] = useState([]);
  const [alternativasList, setAlternativasList] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [memRes, omoeRes, altRes] = await Promise.all([
        authApi.listMemberships(proyectoId),
        omoeApi.getByProyecto(proyectoId),
        alternativasApi.getByProyecto(proyectoId),
      ]);
      setMemberships(memRes.data);
      const allMisiones = (omoeRes.data || []).flatMap((o) => o.misiones || []);
      setMisiones(allMisiones);
      setAlternativasList(altRes.data || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(defaultForm());
    setEditing(null);
    setFormOpen(false);
  };

  const buildAccessPayload = () => {
    const payload = {};
    if (!form.activo) {
      return payload;
    }
    if (form.tipoAcceso === 'ilimitado') {
      payload.limpiar_vencimiento = true;
    } else {
      payload.dias_acceso = Number(form.dias_acceso) || 0;
      payload.horas_acceso = Number(form.horas_acceso) || 0;
      payload.minutos_acceso = Number(form.minutos_acceso) || 0;
    }
    return payload;
  };

  const hasDuracionAcceso = () => (
    (Number(form.dias_acceso) || 0) > 0
    || (Number(form.horas_acceso) || 0) > 0
    || (Number(form.minutos_acceso) || 0) > 0
  );

  const handleEdit = (m) => {
    setEditing(m);
    const tieneVencimiento = Boolean(m.fecha_acceso_hasta);
    setForm({
      ...defaultForm(),
      username: m.usuario?.username || '',
      email: m.usuario?.email || '',
      first_name: m.usuario?.first_name || '',
      last_name: m.usuario?.last_name || '',
      rol: m.rol,
      activo: m.activo,
      tipoAcceso: tieneVencimiento ? 'limitado' : 'ilimitado',
      dias_acceso: 30,
      horas_acceso: 0,
      minutos_acceso: 0,
      mision_ids: (m.misiones_asignadas || []).map((x) => x.mision),
      alternativa_ids: (m.alternativas_asignadas || []).map((x) => x.alternativa),
    });
    setFormOpen(true);
  };

  const handleRevoke = async (m) => {
    try {
      await authApi.updateMembership(m.id, { activo: false });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo revocar el acceso');
    }
  };

  const handleRenew = async (m, dias = 30) => {
    try {
      await authApi.updateMembership(m.id, { activo: true, dias_acceso: dias });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo renovar el acceso');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editing) {
      if (!form.password) {
        setError('La contraseña es obligatoria.');
        return;
      }
      if (form.password !== form.passwordConfirm) {
        setError('Las contraseñas no coinciden.');
        return;
      }
    } else if (form.password || form.passwordConfirm) {
      if (!form.password || !form.passwordConfirm) {
        setError('Complete ambos campos de contraseña para cambiarla.');
        return;
      }
      if (form.password !== form.passwordConfirm) {
        setError('Las contraseñas no coinciden.');
        return;
      }
    }
    if (form.activo && form.tipoAcceso === 'limitado' && !hasDuracionAcceso()) {
      setError('Indique al menos un día, hora o minuto de acceso.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        proyecto: Number(proyectoId),
        rol: form.rol,
        activo: form.activo,
        mision_ids: form.rol === 'evaluador' ? form.mision_ids : [],
        alternativa_ids: form.rol === 'ofertante' ? form.alternativa_ids : [],
        ...buildAccessPayload(),
      };
      if (editing) {
        await authApi.updateMembership(editing.id, {
          ...payload,
          username: form.username.trim(),
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await authApi.createMembership({
          ...payload,
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          ...(form.first_name.trim() ? { first_name: form.first_name.trim() } : {}),
          ...(form.last_name.trim() ? { last_name: form.last_name.trim() } : {}),
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(
        getApiErrorMessage(err.response?.data, 'Error al guardar membresía'),
      );
    } finally {
      setSaving(false);
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

  if (!canManage) {
    return (
      <div className="p-6 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-sm">
        No tienes permiso para gestionar usuarios en este proyecto.
        Solo el <strong>jefe del proyecto</strong> o un <strong>administrador global</strong>
        {' '}puede hacerlo.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Gestión de usuarios
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Habilite o revoque el acceso al software por usuario. Puede asignar acceso
            por días, horas y minutos, o sin vencimiento.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white text-sm rounded-lg"
          >
            Agregar usuario
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-400 text-red-800 dark:text-red-200 text-sm">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
            Cerrar
          </button>
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 p-5 space-y-4"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {editing ? 'Editar usuario' : 'Nuevo usuario'}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nombre de usuario</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="ej. jperez"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Apellido</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Correo electrónico</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="usuario@empresa.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                  required={!editing}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {editing ? 'Confirmar nueva contraseña' : 'Confirmar contraseña'}
                </label>
                <input
                  type="password"
                  value={form.passwordConfirm}
                  onChange={(e) => setForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
                  autoComplete="new-password"
                  required={!editing}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Rol</label>
            <select
              value={form.rol}
              onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
            >
              {ROL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {form.rol === 'evaluador' && (
            <div>
              <label className="block text-sm font-medium mb-1">Misiones asignadas</label>
              <select
                multiple
                value={form.mision_ids.map(String)}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  mision_ids: Array.from(e.target.selectedOptions).map((o) => Number(o.value)),
                }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950 min-h-[100px]"
              >
                {misiones.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {form.rol === 'ofertante' && (
            <div>
              <label className="block text-sm font-medium mb-1">Alternativas asignadas</label>
              <select
                multiple
                value={form.alternativa_ids.map(String)}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  alternativa_ids: Array.from(e.target.selectedOptions).map((o) => Number(o.value)),
                }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950 min-h-[100px]"
              >
                {alternativasList.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
            />
            Acceso habilitado
          </label>

          {form.activo && (
            <div className="space-y-3 rounded-lg border border-gray-200 dark:border-navy-700 p-4">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Vigencia del acceso
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tipoAcceso"
                    checked={form.tipoAcceso === 'ilimitado'}
                    onChange={() => setForm((f) => ({ ...f, tipoAcceso: 'ilimitado' }))}
                  />
                  Sin vencimiento
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tipoAcceso"
                    checked={form.tipoAcceso === 'limitado'}
                    onChange={() => setForm((f) => ({ ...f, tipoAcceso: 'limitado' }))}
                  />
                  Tiempo limitado
                </label>
              </div>
              {form.tipoAcceso === 'limitado' && (
                <div>
                  <div className="grid grid-cols-3 gap-3 max-w-md">
                    <div>
                      <label className="block text-sm font-medium mb-1">Días</label>
                      <input
                        type="number"
                        min={0}
                        max={3650}
                        value={form.dias_acceso}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          dias_acceso: Math.max(0, Number(e.target.value) || 0),
                        }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Horas</label>
                      <input
                        type="number"
                        min={0}
                        max={8760}
                        value={form.horas_acceso}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          horas_acceso: Math.max(0, Number(e.target.value) || 0),
                        }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Minutos</label>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={form.minutos_acceso}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          minutos_acceso: Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                        }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-950"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    El acceso contará desde el momento de guardar. Puede combinar días, horas y minutos.
                  </p>
                </div>
              )}
            </div>
          )}

          {!form.activo && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              El usuario no podrá ingresar al software mientras el acceso esté deshabilitado.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-navy-700 text-white rounded-lg text-sm disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 border rounded-lg text-sm">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-navy-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-navy-800">
            <tr>
              <th className="px-4 py-3 text-left">Usuario</th>
              <th className="px-4 py-3 text-left">Rol</th>
              <th className="px-4 py-3 text-left">Acceso</th>
              <th className="px-4 py-3 text-left">Vence</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => (
              <tr key={m.id} className="border-t border-gray-100 dark:border-navy-800">
                <td className="px-4 py-2">
                  <div className="font-medium">{m.usuario?.username}</div>
                  <div className="text-xs text-gray-500">{m.usuario?.email}</div>
                </td>
                <td className="px-4 py-2">{ROL_LABELS[m.rol] || m.rol}</td>
                <td className="px-4 py-2">
                  <span className={
                    m.estado_acceso === 'vigente'
                      ? 'text-green-600'
                      : m.estado_acceso === 'vencido'
                        ? 'text-amber-600'
                        : 'text-gray-400'
                  }
                  >
                    {ESTADO_ACCESO_LABELS[m.estado_acceso] || m.estado_acceso}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                  {m.fecha_acceso_hasta ? formatFecha(m.fecha_acceso_hasta) : 'Sin vencimiento'}
                </td>
                <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                  {m.acceso_vigente ? (
                    <button
                      type="button"
                      onClick={() => handleRevoke(m)}
                      className="text-amber-700 hover:underline"
                    >
                      Revocar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRenew(m, 30)}
                      className="text-green-700 hover:underline"
                    >
                      Habilitar 30 días
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleEdit(m)}
                    className="text-navy-700 hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(m)}
                    className="text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="Quitar usuario del proyecto"
        message={`¿Quitar a ${deleteTarget?.usuario?.username} de este proyecto?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default UsuariosPanel;
