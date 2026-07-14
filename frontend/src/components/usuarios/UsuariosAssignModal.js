import React, { useEffect, useState } from 'react';
import { MODAL_BACKDROP_CLASS } from '../../utils/modalBackdrop';
import { authApi, omoeApi, alternativas as alternativasApi } from '../../api';
import { getApiErrorMessage } from '../../utils/apiErrors';
import {
  ROL_OPTIONS,
  defaultMembershipForm,
} from '../../constants/usuarios';

const ACCESO_PRESETS = [
  { id: 'ilimitado', label: 'Sin límite' },
  { id: '30', label: '30 días' },
  { id: '90', label: '90 días' },
  { id: '365', label: '1 año' },
  { id: 'custom', label: 'Personalizado' },
];

function inputClass(isDark) {
  return `w-full px-3 py-2.5 rounded-xl border text-sm ${
    isDark
      ? 'bg-navy-950 border-navy-700 text-white placeholder:text-gray-500'
      : 'bg-white border-gray-200 text-slate-900 placeholder:text-gray-400'
  } focus:outline-none focus:ring-2 focus:ring-navy-500/40`;
}

function labelClass(isDark) {
  return `block text-xs font-semibold uppercase tracking-wide mb-1.5 ${
    isDark ? 'text-gray-400' : 'text-gray-500'
  }`;
}

function buildAccessPayload(form) {
  if (!form.activo) return {};
  if (form.presetAcceso === 'ilimitado') return { limpiar_vencimiento: true };
  const dias = form.presetAcceso === 'custom'
    ? Number(form.dias_acceso) || 0
    : Number(form.presetAcceso) || 0;
  if (dias <= 0) return {};
  return { dias_acceso: dias };
}

function UsuariosAssignModal({
  open,
  onClose,
  onSaved,
  editing,
  manageableProjects,
  isDark,
  onError,
}) {
  const [form, setForm] = useState(defaultMembershipForm());
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [misiones, setMisiones] = useState([]);
  const [alternativasList, setAlternativasList] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const tieneVencimiento = Boolean(editing.fecha_acceso_hasta);
      setForm({
        ...defaultMembershipForm(),
        modoUsuario: 'existente',
        usuario_id: editing.usuario?.id,
        username: editing.usuario?.username || '',
        email: editing.usuario?.email || '',
        first_name: editing.usuario?.first_name || '',
        last_name: editing.usuario?.last_name || '',
        proyecto: String(editing.proyecto),
        rol: editing.rol,
        activo: editing.activo,
        presetAcceso: tieneVencimiento ? 'custom' : 'ilimitado',
        dias_acceso: 30,
        mision_ids: (editing.misiones_asignadas || []).map((x) => x.mision),
        alternativa_ids: (editing.alternativas_asignadas || []).map((x) => x.alternativa),
      });
      setSearchQ(editing.usuario?.username || '');
      setShowAdvanced(true);
    } else {
      setForm(defaultMembershipForm());
      setSearchQ('');
      setShowAdvanced(false);
    }
    setUserResults([]);
  }, [open, editing]);

  useEffect(() => {
    if (!open || !form.proyecto) {
      setMisiones([]);
      setAlternativasList([]);
      return undefined;
    }
    let cancelled = false;
    Promise.all([
      omoeApi.getByProyecto(form.proyecto),
      alternativasApi.getByProyecto(form.proyecto),
    ]).then(([omoeRes, altRes]) => {
      if (cancelled) return;
      setMisiones((omoeRes.data || []).flatMap((o) => o.misiones || []));
      setAlternativasList(altRes.data || []);
    }).catch(() => {
      if (!cancelled) {
        setMisiones([]);
        setAlternativasList([]);
      }
    });
    return () => { cancelled = true; };
  }, [open, form.proyecto]);

  useEffect(() => {
    if (!open || form.modoUsuario !== 'existente' || editing || !searchQ.trim()) {
      setUserResults([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      authApi.searchUsers(searchQ.trim()).then(({ data }) => {
        setUserResults(data || []);
      }).catch(() => setUserResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQ, form.modoUsuario, open, editing]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editing && form.modoUsuario === 'nuevo') {
      if (!form.password || form.password !== form.passwordConfirm) {
        onError('Complete y confirme la contraseña del nuevo usuario.');
        return;
      }
    }
    if (!form.proyecto) {
      onError('Seleccione un proyecto.');
      return;
    }
    if (!editing && form.modoUsuario === 'existente' && !form.usuario_id) {
      onError('Seleccione un usuario de la lista.');
      return;
    }
    if (form.activo && form.presetAcceso === 'custom' && !(Number(form.dias_acceso) > 0)) {
      onError('Indique cuántos días de acceso otorgar.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        proyecto: Number(form.proyecto),
        rol: form.rol,
        activo: form.activo,
        mision_ids: form.rol === 'evaluador' ? form.mision_ids : [],
        alternativa_ids: form.rol === 'ofertante' ? form.alternativa_ids : [],
        ...buildAccessPayload(form),
      };

      if (editing) {
        await authApi.updateMembership(editing.id, {
          ...payload,
          ...(showAdvanced ? {
            username: form.username.trim(),
            email: form.email.trim(),
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            ...(form.password ? { password: form.password } : {}),
          } : {}),
        });
      } else if (form.modoUsuario === 'existente') {
        await authApi.createMembership({ ...payload, usuario_id: form.usuario_id });
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
      onSaved();
      onClose();
    } catch (err) {
      onError(getApiErrorMessage(err.response?.data, 'No se pudo guardar la asignación'));
    } finally {
      setSaving(false);
    }
  };

  const panel = isDark ? 'bg-navy-900 border-navy-700' : 'bg-white border-gray-200';

  return (
    <div className={MODAL_BACKDROP_CLASS} onClick={saving ? undefined : onClose}>
      <div
        className={`${panel} border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto`}
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={`sticky top-0 z-10 px-6 py-4 border-b ${isDark ? 'border-navy-700 bg-navy-900' : 'border-gray-100 bg-white'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {editing ? 'Editar acceso' : 'Asignar usuario'}
              </h2>
              <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                La licencia aplica solo al proyecto seleccionado.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={`shrink-0 w-8 h-8 rounded-lg text-lg leading-none ${isDark ? 'hover:bg-navy-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {!editing && (
            <div className={`flex p-1 rounded-xl ${isDark ? 'bg-navy-950' : 'bg-gray-100'}`}>
              {[
                { id: 'existente', label: 'Usuario existente' },
                { id: 'nuevo', label: 'Usuario nuevo' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, modoUsuario: id, usuario_id: null }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    form.modoUsuario === id
                      ? isDark
                        ? 'bg-navy-700 text-white shadow-sm'
                        : 'bg-white text-navy-800 shadow-sm'
                      : isDark ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {!editing && form.modoUsuario === 'existente' && (
            <div>
              <label className={labelClass(isDark)}>Buscar usuario</label>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Escriba nombre de usuario o correo…"
                className={inputClass(isDark)}
                autoFocus
              />
              {userResults.length > 0 && (
                <ul className={`mt-2 rounded-xl border overflow-hidden ${isDark ? 'border-navy-700' : 'border-gray-200'}`}>
                  {userResults.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            usuario_id: u.id,
                            username: u.username,
                            email: u.email || '',
                          }));
                          setSearchQ(u.username);
                          setUserResults([]);
                        }}
                        className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                          form.usuario_id === u.id
                            ? isDark ? 'bg-navy-800' : 'bg-navy-50'
                            : isDark ? 'hover:bg-navy-800/60' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.username}</span>
                        {u.email && (
                          <span className={`block text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{u.email}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {form.usuario_id && (
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  Seleccionado: {form.username}
                </p>
              )}
            </div>
          )}

          {(!editing && form.modoUsuario === 'nuevo') && (
            <div className="space-y-3">
              <div>
                <label className={labelClass(isDark)}>Usuario</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="ej. jperez"
                  required
                  className={inputClass(isDark)}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass(isDark)}>Contraseña</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required
                    className={inputClass(isDark)}
                  />
                </div>
                <div>
                  <label className={labelClass(isDark)}>Confirmar</label>
                  <input
                    type="password"
                    value={form.passwordConfirm}
                    onChange={(e) => setForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
                    required
                    className={inputClass(isDark)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass(isDark)}>Proyecto</label>
              <select
                value={form.proyecto}
                onChange={(e) => setForm((f) => ({ ...f, proyecto: e.target.value }))}
                required
                disabled={Boolean(editing)}
                className={`${inputClass(isDark)} disabled:opacity-60`}
              >
                <option value="">Elegir proyecto…</option>
                {manageableProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass(isDark)}>Rol</label>
              <select
                value={form.rol}
                onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
                className={inputClass(isDark)}
              >
                {ROL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {form.rol === 'evaluador' && form.proyecto && misiones.length > 0 && (
            <div>
              <label className={labelClass(isDark)}>Misiones (opcional)</label>
              <select
                multiple
                value={form.mision_ids.map(String)}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  mision_ids: Array.from(e.target.selectedOptions).map((o) => Number(o.value)),
                }))}
                className={`${inputClass(isDark)} min-h-[88px]`}
              >
                {misiones.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre_mision || m.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {form.rol === 'ofertante' && form.proyecto && alternativasList.length > 0 && (
            <div>
              <label className={labelClass(isDark)}>Alternativas (opcional)</label>
              <select
                multiple
                value={form.alternativa_ids.map(String)}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  alternativa_ids: Array.from(e.target.selectedOptions).map((o) => Number(o.value)),
                }))}
                className={`${inputClass(isDark)} min-h-[88px]`}
              >
                {alternativasList.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className={`rounded-xl p-4 space-y-3 ${isDark ? 'bg-navy-950/80' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>Licencia activa</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Acceso a este proyecto</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.activo}
                onClick={() => setForm((f) => ({ ...f, activo: !f.activo }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  form.activo ? 'bg-emerald-500' : isDark ? 'bg-navy-700' : 'bg-gray-300'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  form.activo ? 'translate-x-5' : ''
                }`}
                />
              </button>
            </div>

            {form.activo && (
              <div>
                <label className={labelClass(isDark)}>Duración</label>
                <div className="flex flex-wrap gap-2">
                  {ACCESO_PRESETS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, presetAcceso: id }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        form.presetAcceso === id
                          ? 'bg-navy-700 border-navy-700 text-white'
                          : isDark
                            ? 'border-navy-600 text-gray-300 hover:border-navy-500'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {form.presetAcceso === 'custom' && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={form.dias_acceso}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        dias_acceso: Math.max(1, Number(e.target.value) || 1),
                      }))}
                      className={`${inputClass(isDark)} max-w-[120px]`}
                    />
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>días</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {editing && (
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className={`text-sm ${isDark ? 'text-navy-300 hover:text-white' : 'text-navy-600 hover:text-navy-800'}`}
            >
              {showAdvanced ? 'Ocultar datos del usuario' : 'Editar datos del usuario'}
            </button>
          )}

          {editing && showAdvanced && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass(isDark)}>Nombre</label>
                  <input type="text" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className={inputClass(isDark)} />
                </div>
                <div>
                  <label className={labelClass(isDark)}>Apellido</label>
                  <input type="text" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} className={inputClass(isDark)} />
                </div>
              </div>
              <div>
                <label className={labelClass(isDark)}>Correo</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputClass(isDark)} />
              </div>
              <div>
                <label className={labelClass(isDark)}>Nueva contraseña (opcional)</label>
                <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className={inputClass(isDark)} />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border ${
                isDark ? 'border-navy-600 text-gray-300 hover:bg-navy-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-navy-700 hover:bg-navy-800 text-white disabled:opacity-60"
            >
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Asignar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UsuariosAssignModal;
