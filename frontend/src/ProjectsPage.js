import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from './ThemeContext';
import { useAuth } from './context/AuthContext';
import { proyectos } from './api';
import ThemeToggle from './components/ThemeToggle';
import UserMenu from './components/UserMenu';
import { resolveMediaUrl } from './utils/media';

function ProjectsPage() {
  const { isDark } = useTheme();
  const {
    logout,
    esAdminGlobal,
    puedeCrearProyecto,
    puedeGestionarUsuarios,
    refreshProfile,
  } = useAuth();
  const [projectList, setProjectList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [sinAccesoProyectos, setSinAccesoProyectos] = useState(false);
  const [error, setError] = useState(null);
  const [brokenImages, setBrokenImages] = useState(() => new Set());

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setSinAccesoProyectos(false);
      const response = await proyectos.getAll();
      const list = response.data || [];
      setProjectList(list);

      if (list.length === 0 && !esAdminGlobal) {
        setCheckingAccess(true);
        const access = await refreshProfile();
        setCheckingAccess(false);
        if (!access.ok) {
          return;
        }
        if (
          list.length === 0
          && access.proyectos.length === 0
          && !access.esAdminGlobal
          && !access.puedeCrearProyecto
        ) {
          setSinAccesoProyectos(true);
        }
      }

      setError(null);
    } catch (err) {
      setError('Error cargando proyectos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [esAdminGlobal, refreshProfile]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  if (loading || checkingAccess) {
    return (
      <div className={`flex justify-center items-center min-h-screen ${isDark ? 'bg-navy-950' : 'bg-gray-50'}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-600" />
      </div>
    );
  }

  if (sinAccesoProyectos && !esAdminGlobal && !puedeCrearProyecto) {
    return (
      <div className={`min-h-screen flex items-center justify-center px-4 ${isDark ? 'bg-navy-950' : 'bg-gray-50'}`}>
        <div className={`max-w-md w-full rounded-2xl border p-8 text-center ${isDark ? 'bg-navy-900 border-navy-700 text-white' : 'bg-white border-gray-200 text-slate-900'}`}>
          <h2 className="text-xl font-bold mb-3">Sin proyectos disponibles</h2>
          <p className={`text-sm mb-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            No tiene proyectos con licencia vigente asignada.
            Puede ingresar al software, pero necesita que un gerente le asigne acceso a uno o más proyectos.
          </p>
          <button
            type="button"
            onClick={logout}
            className="px-6 py-2.5 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-navy-950 to-navy-900' : 'bg-gradient-to-br from-navy-50 to-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8 flex-col md:flex-row gap-4">
          <h1 className={`text-4xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Proyectos</h1>
          <div className="flex gap-4 items-center w-full md:w-auto flex-wrap justify-end">
            <ThemeToggle />
            <UserMenu isDark={isDark} />
            {puedeGestionarUsuarios && (
              <Link
                to="/usuarios"
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  isDark
                    ? 'border-navy-600 text-gray-200 hover:bg-navy-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Usuarios y licencias
              </Link>
            )}
            {esAdminGlobal && (
              <Link
                to="/tipos-dimension"
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  isDark
                    ? 'border-navy-600 text-gray-200 hover:bg-navy-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Tipos de dimensión
              </Link>
            )}
            {puedeCrearProyecto && (
              <Link
                to="/proyecto/nuevo"
                className="flex items-center gap-2 bg-navy-700 hover:bg-navy-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex-1 md:flex-initial justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nuevo proyecto
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500 text-red-200 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projectList.map((project) => (
            <Link
              key={project.id}
              to={`/proyecto/${project.id}`}
              className={`group relative overflow-hidden rounded-lg shadow-lg hover:shadow-2xl transition-all ring-1 ring-transparent hover:ring-navy-500/30 ${isDark ? 'bg-navy-900' : 'bg-white'}`}
            >
              <div className="aspect-video bg-gradient-to-br from-navy-600 to-navy-700 overflow-hidden">
                {project.foto && !brokenImages.has(project.id) ? (
                  <img
                    src={resolveMediaUrl(project.foto)}
                    alt={project.nombre}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                    onError={() => {
                      setBrokenImages((prev) => new Set(prev).add(project.id));
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">
                    Sin imagen
                  </div>
                )}
              </div>
              <div className={`p-4 ${isDark ? 'bg-navy-900' : 'bg-gray-50'}`}>
                <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {project.nombre}
                </h3>
                <p className={`text-sm line-clamp-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {project.descripcion}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {projectList.length === 0 && !sinAccesoProyectos && (
          <div className="text-center py-12">
            <p className={`${isDark ? 'text-slate-400' : 'text-slate-600'} text-lg`}>No hay proyectos aún</p>
            {puedeCrearProyecto && (
              <Link
                to="/proyecto/nuevo"
                className="inline-block mt-4 bg-navy-700 hover:bg-navy-800 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Crear el primero
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectsPage;
