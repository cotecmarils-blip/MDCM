import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { authApi } from '../api';
import {
  STORAGE_ACCESS,
  STORAGE_REFRESH,
  STORAGE_USER,
  clearAuthSession,
  isAccessDeniedResponse,
} from '../utils/authSession';

const AuthContext = createContext(null);

const ACCESS_CHECK_INTERVAL_MS = 15000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [esAdminGlobal, setEsAdminGlobal] = useState(false);
  const [puedeCrearProyecto, setPuedeCrearProyecto] = useState(false);
  const [puedeGestionarUsuarios, setPuedeGestionarUsuarios] = useState(false);
  const [proyectosAdministrables, setProyectosAdministrables] = useState([]);
  const [proyectosAcceso, setProyectosAcceso] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const persistSession = useCallback((payload) => {
    sessionStorage.setItem(STORAGE_ACCESS, payload.access);
    sessionStorage.setItem(STORAGE_REFRESH, payload.refresh);
    sessionStorage.setItem(STORAGE_USER, JSON.stringify(payload.user));
    setUser(payload.user);
    setEsAdminGlobal(Boolean(payload.es_admin_global));
    setPuedeCrearProyecto(Boolean(payload.puede_crear_proyecto));
  }, []);

  const clearSession = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setEsAdminGlobal(false);
    setPuedeCrearProyecto(false);
    setPuedeGestionarUsuarios(false);
    setProyectosAdministrables([]);
    setProyectosAcceso([]);
  }, []);

  const handleAccessDenied = useCallback((err) => {
    const detail = err.response?.data?.detail;
    clearSession();
    if (detail) {
      setAuthError(detail);
    } else {
      setAuthError('Su tiempo de acceso al software ha terminado. Comuníquese con el gerente.');
    }
  }, [clearSession]);

  const refreshProfile = useCallback(async () => {
    const token = sessionStorage.getItem(STORAGE_ACCESS);
    if (!token) {
      setLoading(false);
      return { ok: false };
    }
    try {
      const { data } = await authApi.me();
      setUser(data.user);
      setEsAdminGlobal(Boolean(data.es_admin_global));
      setPuedeCrearProyecto(Boolean(data.puede_crear_proyecto));
      setPuedeGestionarUsuarios(Boolean(data.puede_gestionar_usuarios));
      setProyectosAdministrables(data.proyectos_administrables || []);
      setProyectosAcceso(data.proyectos || []);
      sessionStorage.setItem(STORAGE_USER, JSON.stringify(data.user));
      setAuthError(null);
      return {
        ok: true,
        proyectos: data.proyectos || [],
        puedeCrearProyecto: Boolean(data.puede_crear_proyecto),
        esAdminGlobal: Boolean(data.es_admin_global),
        puedeGestionarUsuarios: Boolean(data.puede_gestionar_usuarios),
      };
    } catch (err) {
      if (isAccessDeniedResponse(err.response)) {
        handleAccessDenied(err);
      } else {
        clearSession();
        setAuthError('Su sesión ha expirado. Inicie sesión de nuevo.');
      }
      return { ok: false };
    } finally {
      setLoading(false);
    }
  }, [clearSession, handleAccessDenied]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (!user) return undefined;
    const interval = setInterval(() => {
      refreshProfile();
    }, ACCESS_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refreshProfile]);

  const login = useCallback(async (username, password) => {
    const { data } = await authApi.login(username, password);
    persistSession(data);
    const me = await authApi.me();
    setProyectosAcceso(me.data.proyectos || []);
    setEsAdminGlobal(Boolean(me.data.es_admin_global));
    setPuedeCrearProyecto(Boolean(me.data.puede_crear_proyecto));
    setPuedeGestionarUsuarios(Boolean(me.data.puede_gestionar_usuarios));
    setProyectosAdministrables(me.data.proyectos_administrables || []);
    setAuthError(null);
    return data;
  }, [persistSession]);

  const logout = useCallback(async () => {
    const refresh = sessionStorage.getItem(STORAGE_REFRESH);
    try {
      if (refresh) {
        await authApi.logout(refresh);
      }
    } catch {
      // ignore
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      esAdminGlobal,
      puedeCrearProyecto,
      puedeGestionarUsuarios,
      proyectosAdministrables,
      proyectosAcceso,
      loading,
      authError,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshProfile,
      clearAuthError: () => setAuthError(null),
    }),
    [user, esAdminGlobal, puedeCrearProyecto, puedeGestionarUsuarios, proyectosAdministrables, proyectosAcceso, loading, authError, login, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return ctx;
}
