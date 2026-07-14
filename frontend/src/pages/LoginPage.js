import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_ROOT } from '../api';
import { useTheme } from '../ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import { consumeStoredAuthMessage } from '../utils/authSession';

const LOGO_ENAP = `${process.env.PUBLIC_URL}/Logo%20ENAP.svg`;
const LOGO_COTECMAR = `${process.env.PUBLIC_URL}/CotecmarLogo.svg`;
const LOGO_COTECMAR_WHITE = `${process.env.PUBLIC_URL}/CotecmarLogo_white.svg`;
const LOGO_CUC = `${process.env.PUBLIC_URL}/Logo_CUC.png`;

function LoginPage() {
  const { isAuthenticated, loading, login, authError, clearAuthError } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const inputClass = `w-full rounded-xl border px-4 py-3 text-sm transition-colors input-focus ${
    isDark
      ? 'bg-navy-900/60 border-navy-700 text-white placeholder:text-gray-500'
      : 'bg-white border-gray-200 text-slate-900 placeholder:text-gray-400 shadow-xs'
  }`;

  return (
    <div
      className={`min-h-screen flex flex-col lg:flex-row ${
        isDark ? 'bg-navy-950' : 'bg-slate-100'
      }`}
    >
      {/* Panel de marca */}
      <section
        className="relative flex flex-col justify-between overflow-hidden px-8 py-10 lg:w-[46%] lg:min-h-screen lg:px-12 lg:py-12"
        aria-label="Presentación HATD"
      >
        <div
          className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950"
          aria-hidden
        />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #fff 0, transparent 45%), radial-gradient(circle at 80% 0%, #84a9cf 0, transparent 35%)',
          }}
          aria-hidden
        />
        <div
          className="absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-navy-500/20 blur-3xl"
          aria-hidden
        />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-5">
            <img
              src={LOGO_ENAP}
              alt="ENAP"
              className="h-10 w-auto max-h-10 max-w-[3.5rem] object-contain brightness-0 invert opacity-90"
            />
            <span className="hidden h-7 w-px bg-white/20 sm:block" aria-hidden />
            <img
              src={LOGO_COTECMAR_WHITE}
              alt="Cotecmar"
              className="h-10 w-auto max-h-10 max-w-[8rem] object-contain opacity-90"
            />
            <span className="hidden h-7 w-px bg-white/20 sm:block" aria-hidden />
            <img
              src={LOGO_CUC}
              alt="Universidad de la Costa"
              className="h-10 w-auto max-h-10 max-w-[6.5rem] object-contain brightness-0 invert opacity-90"
            />
          </div>
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
        </div>

        <div className="relative z-10 my-10 lg:my-0 lg:max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-200/90">
            Plataforma de decisión multicriterio
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight text-white sm:text-5xl">
            HATD
          </h1>
          <p className="mt-3 text-lg font-medium text-navy-100 sm:text-xl">
            Herramienta Analítica para Toma de Decisiones
          </p>
          <p className="mt-5 text-sm leading-relaxed text-navy-200/90 sm:text-base">
            Evalúe alternativas, ponderación de criterios, simulaciones y análisis
            de sensibilidad en un entorno integrado para proyectos de selección.
          </p>
        </div>

        <p className="relative z-10 hidden text-xs text-navy-300/80 lg:block">
          ENAP · Cotecmar · Universidad de la Costa · Herramienta de apoyo a la decisión
        </p>
      </section>

      {/* Panel de acceso */}
      <section className="flex flex-1 items-center justify-center px-6 py-10 lg:px-12">
        <div className="absolute top-4 right-4 hidden lg:block">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden text-center">
            <div className="flex items-center justify-center gap-3">
              <img
                src={LOGO_ENAP}
                alt="ENAP"
                className="h-8 w-auto max-h-8 max-w-[2.75rem] object-contain brightness-0 opacity-75 dark:invert dark:opacity-85"
              />
              <img
                src={isDark ? LOGO_COTECMAR_WHITE : LOGO_COTECMAR}
                alt="Cotecmar"
                className={`h-8 w-auto max-h-8 max-w-[7rem] object-contain ${
                  isDark ? 'opacity-85' : 'brightness-0 opacity-75'
                }`}
              />
              <img
                src={LOGO_CUC}
                alt="Universidad de la Costa"
                className="h-8 w-auto max-h-8 max-w-[5.5rem] object-contain brightness-0 opacity-75 dark:invert dark:opacity-85"
              />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-navy-800 dark:text-white">HATD</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Herramienta Analítica para Toma de Decisiones
            </p>
          </div>

          <div
            className={`rounded-2xl border p-8 shadow-xl sm:p-10 ${
              isDark
                ? 'border-navy-800 bg-navy-900/80 backdrop-blur-sm'
                : 'border-white/80 bg-white shadow-xl'
            }`}
          >
            <div className="mb-8 hidden lg:block">
              <h2 className="text-2xl font-bold text-navy-900 dark:text-white">
                Iniciar sesión
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Ingrese sus credenciales para acceder a la plataforma.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Usuario
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  disabled={submitting}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nombre.apellido"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    disabled={submitting}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:text-navy-700 dark:text-gray-400 dark:hover:text-navy-300"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-navy-700 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus:ring-offset-navy-900"
              >
                {submitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Ingresando…
                  </span>
                ) : (
                  'Iniciar sesión'
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-500">
            Acceso restringido a usuarios autorizados
          </p>
        </div>
      </section>
    </div>
  );
}

export default LoginPage;
