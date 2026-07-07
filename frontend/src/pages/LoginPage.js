import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_ROOT } from '../api';
import { useTheme } from '../ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import { consumeStoredAuthMessage } from '../utils/authSession';

function LoginPage() {
  const { isAuthenticated, loading, login, authError, clearAuthError } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = consumeStoredAuthMessage();
    if (stored) {
      setError(stored);
    }
  }, []);

  useEffect(() => {
    if (authError) {
      setError(authError);
      clearAuthError();
    }
  }, [authError, clearAuthError]);

  const from = location.state?.from?.pathname || '/';

  if (!loading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      if (!err.response) {
        setError(
          `No se pudo conectar con el servidor (${API_ROOT}). `
          + 'Verifica que el backend esté disponible o que REACT_APP_API_ROOT apunte al dominio correcto.',
        );
        return;
      }
      const detail = err.response?.data?.detail;
      setError(detail || 'No se pudo iniciar sesión. Verifica usuario y contraseña.');
      if (err.response?.data?.code) {
        sessionStorage.setItem('MCDM_access_denied_code', err.response.data.code);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 ${
        isDark ? 'bg-gradient-to-br from-navy-950 to-navy-900' : 'bg-gradient-to-br from-navy-50 to-gray-100'
      }`}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div
        className={`w-full max-w-md rounded-2xl shadow-xl p-8 ${
          isDark ? 'bg-navy-900 text-white' : 'bg-white text-slate-900'
        }`}
      >
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">MCDM</h1>
          <p className={`mt-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            Inicia sesión para acceder a los proyectos de selección
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1">
              Usuario
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy-500 ${
                isDark
                  ? 'bg-navy-800 border-navy-700 text-white'
                  : 'bg-white border-gray-300 text-slate-900'
              }`}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy-500 ${
                isDark
                  ? 'bg-navy-800 border-navy-700 text-white'
                  : 'bg-white border-gray-300 text-slate-900'
              }`}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500 text-red-600 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-navy-700 hover:bg-navy-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {submitting ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className={`mt-6 text-xs text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Demo: jefe.demo / DemoJefe2026! — ejecuta <code>seed_auth_demo</code>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
