import { useEffect, useState } from 'react';
import { authApi } from '../api';

const DEFAULT_PERMISSIONS = {
  rol: null,
  es_admin_global: false,
  puede_editar: false,
  puede_crear_proyecto: false,
  puede_crear_alternativa: false,
  puede_gestionar_miembros: false,
  puede_eliminar_proyecto: false,
  solo_lectura: true,
  solo_requisitos: false,
  alternativas_asignadas: [],
  misiones_asignadas: [],
};

export function useProjectPermissions(proyectoId) {
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(Boolean(proyectoId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!proyectoId) {
      setPermissions(DEFAULT_PERMISSIONS);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    authApi
      .getProyectoMembership(proyectoId)
      .then(({ data }) => {
        if (!cancelled) {
          setPermissions(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPermissions(DEFAULT_PERMISSIONS);
          setError(err.response?.data?.detail || 'Sin acceso al proyecto');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [proyectoId]);

  const canAccessSection = (sectionId) => {
    if (permissions.es_admin_global) return true;
    const rol = permissions.rol;

    if (permissions.solo_requisitos || rol === 'ofertante') {
      return ['info', 'alternativas'].includes(sectionId);
    }

    if (rol === 'auditor') {
      return true;
    }

    return true;
  };

  const canWrite = permissions.puede_editar && !permissions.solo_lectura;
  const canCreateAlternativa = Boolean(
    permissions.es_admin_global || permissions.puede_crear_alternativa,
  );

  return {
    permissions,
    loading,
    error,
    canWrite,
    canCreateAlternativa,
    canDeleteProject: Boolean(
      permissions.es_admin_global || permissions.puede_eliminar_proyecto,
    ),
    canAccessSection,
    isProveedor: permissions.solo_requisitos || permissions.rol === 'ofertante',
    isAuditor: permissions.rol === 'auditor',
  };
}
