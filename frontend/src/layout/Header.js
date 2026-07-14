import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import UserMenu from '../components/UserMenu';

function Header({
  sidebarOpen,
  setSidebarOpen,
  proyectoNombre,
  proyectoDescripcion,
  onEditProject,
  rolLabel,
  canEditProject = true,
}) {
  const { isDark } = useTheme();
  return (
    <header className="sticky top-0 before:absolute before:inset-0 before:backdrop-blur-md max-lg:before:bg-white/90 dark:max-lg:before:bg-navy-900/90 before:-z-10 z-30 max-lg:shadow-xs lg:before:bg-navy-50/90 dark:lg:before:bg-navy-950/90">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12 lg:border-b border-gray-200 dark:border-navy-800/60">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 lg:hidden shrink-0"
              aria-controls="sidebar"
              aria-expanded={sidebarOpen}
              onClick={(e) => {
                e.stopPropagation();
                setSidebarOpen(!sidebarOpen);
              }}
            >
              <span className="sr-only">Abrir menú</span>
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="5" width="16" height="2" />
                <rect x="4" y="11" width="16" height="2" />
                <rect x="4" y="17" width="16" height="2" />
              </svg>
            </button>

            <div className="min-w-0">
              <Link
                to="/"
                className="text-sm text-navy-800 hover:text-navy-600 dark:hover:text-navy-400 font-medium"
              >
                ← Proyectos
              </Link>
            </div>
          </div>

          <div className="flex items-center shrink-0 gap-2">
            {rolLabel && (
              <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-navy-100 dark:bg-navy-800 text-navy-800 dark:text-navy-200">
                {rolLabel}
              </span>
            )}
            <UserMenu isDark={isDark} />
            {onEditProject && canEditProject && (
              <button
                onClick={onEditProject}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-navy-800 rounded-lg transition-colors"
                title="Editar proyecto"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
