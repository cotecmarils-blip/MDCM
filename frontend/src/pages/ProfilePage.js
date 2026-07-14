import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import UserMenu from '../components/UserMenu';
import UserAvatar, { getUserDisplayName } from '../components/UserAvatar';
import { resolveMediaUrl } from '../utils/media';
import { getApiErrorMessage } from '../utils/apiErrors';

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

function ProfilePage() {
  const { isDark } = useTheme();
  const { user, refreshProfile } = useAuth();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
  });
  const [newPhoto, setNewPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await authApi.getProfile();
        if (cancelled) return;
        setForm({
          username: data.username || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          email: data.email || '',
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || 'No se pudo cargar el perfil');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!newPhoto) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(newPhoto);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newPhoto]);

  const currentPhoto = previewUrl
    || (removePhoto ? null : (user?.foto ? resolveMediaUrl(user.foto) : null));

  const handlePhotoPick = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setNewPhoto(file);
    setRemovePhoto(false);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      setError(null);
      setSuccess(null);
      const formData = new FormData();
      formData.append('username', form.username.trim());
      formData.append('first_name', form.first_name.trim());
      formData.append('last_name', form.last_name.trim());
      formData.append('email', form.email.trim());
      if (newPhoto) formData.append('foto', newPhoto);
      if (removePhoto) formData.append('quitar_foto', 'true');
      await authApi.updateProfile(formData);
      await refreshProfile();
      setNewPhoto(null);
      setRemovePhoto(false);
      setSuccess('Perfil actualizado correctamente.');
    } catch (err) {
      setError(getApiErrorMessage(err.response?.data, 'No se pudo guardar el perfil'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    try {
      setSavingPassword(true);
      setError(null);
      setSuccess(null);
      await authApi.changePassword(
        passwordForm.current_password,
        passwordForm.new_password,
      );
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setSuccess('Contraseña actualizada correctamente.');
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.current_password?.[0]
        || data?.new_password?.[0]
        || data?.detail
        || 'No se pudo cambiar la contraseña',
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const bg = isDark ? 'bg-gradient-to-br from-navy-950 to-navy-900' : 'bg-gradient-to-br from-navy-50 to-gray-50';
  const card = isDark ? 'bg-navy-900/80 border-navy-700/80' : 'bg-white border-gray-200/80';

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg}`}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-600" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg}`}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <Link
              to="/"
              className={`inline-block text-sm mb-2 ${isDark ? 'text-navy-300 hover:text-white' : 'text-navy-600 hover:text-navy-800'}`}
            >
              ← Proyectos
            </Link>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Mi perfil
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu isDark={isDark} showName={false} />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-400/50 text-red-700 dark:text-red-200 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/50 text-emerald-700 dark:text-emerald-200 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className={`rounded-2xl border p-6 mb-6 space-y-6 ${card}`}>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative">
              {currentPhoto ? (
                <img
                  src={currentPhoto}
                  alt="Foto de perfil"
                  className="w-28 h-28 rounded-full object-cover border-4 border-white dark:border-navy-800 shadow-md"
                />
              ) : (
                <UserAvatar user={user} size="xl" className="border-4 border-white dark:border-navy-800 shadow-md" />
              )}
            </div>
            <div className="flex flex-col gap-2 items-center sm:items-start">
              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {getUserDisplayName(user)}
              </p>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-navy-700 hover:bg-navy-800 text-white"
                >
                  Cambiar foto
                </button>
                {(user?.foto || newPhoto) && !removePhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewPhoto(null);
                      setRemovePhoto(true);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                      isDark ? 'border-navy-600 text-gray-300 hover:bg-navy-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Quitar foto
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePhotoPick(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass(isDark)}>Nombre</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                className={inputClass(isDark)}
              />
            </div>
            <div>
              <label className={labelClass(isDark)}>Apellido</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                className={inputClass(isDark)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass(isDark)}>Nombre de usuario</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              required
              className={inputClass(isDark)}
            />
          </div>

          <div>
            <label className={labelClass(isDark)}>Correo electrónico</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={inputClass(isDark)}
            />
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-medium bg-navy-700 hover:bg-navy-800 text-white disabled:opacity-60"
          >
            {savingProfile ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>

        <form onSubmit={handleChangePassword} className={`rounded-2xl border p-6 space-y-4 ${card}`}>
          <div>
            <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Cambiar contraseña
            </h2>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Solo usted puede modificar su contraseña.
            </p>
          </div>

          <div>
            <label className={labelClass(isDark)}>Contraseña actual</label>
            <input
              type="password"
              value={passwordForm.current_password}
              onChange={(e) => setPasswordForm((f) => ({ ...f, current_password: e.target.value }))}
              required
              autoComplete="current-password"
              className={inputClass(isDark)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass(isDark)}>Nueva contraseña</label>
              <input
                type="password"
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm((f) => ({ ...f, new_password: e.target.value }))}
                required
                autoComplete="new-password"
                className={inputClass(isDark)}
              />
            </div>
            <div>
              <label className={labelClass(isDark)}>Confirmar nueva</label>
              <input
                type="password"
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm((f) => ({ ...f, confirm_password: e.target.value }))}
                required
                autoComplete="new-password"
                className={inputClass(isDark)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-medium border border-navy-700 text-navy-700 dark:text-navy-200 dark:border-navy-500 hover:bg-navy-50 dark:hover:bg-navy-800 disabled:opacity-60"
          >
            {savingPassword ? 'Actualizando…' : 'Actualizar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ProfilePage;
