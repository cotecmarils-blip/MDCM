import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const NAV_ITEMS = [
  { id: 'info', label: 'Información del proyecto' },
  { id: 'alternativas', label: 'Gestión de alternativas' },
  { id: 'criterios', label: 'Árbol de dimensiones' },
  { id: 'trazabilidad', label: 'Auditoría y sesiones' },
  { id: 'pesos', label: 'Definición de escenarios' },
  { id: 'evaluacion', label: 'Evaluación' },
  { id: 'simulaciones', label: 'Modulo de Simulaciones' },
];

function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  activeSection,
  onSectionChange,
  proyectoNombre,
  visibleSections = null,
}) {
  const navItems = visibleSections
    ? NAV_ITEMS.filter((item) => visibleSections.includes(item.id))
    : NAV_ITEMS;
  const trigger = useRef(null);
  const sidebar = useRef(null);

  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const stored = localStorage.getItem('sidebar-expanded');
    return stored === null ? false : stored === 'true';
  });

  useEffect(() => {
    const clickHandler = ({ target }) => {
      if (!sidebar.current || !trigger.current) return;
      if (!sidebarOpen || sidebar.current.contains(target) || trigger.current.contains(target)) return;
      setSidebarOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  useEffect(() => {
    const keyHandler = ({ keyCode }) => {
      if (!sidebarOpen || keyCode !== 27) return;
      setSidebarOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  useEffect(() => {
    localStorage.setItem('sidebar-expanded', String(sidebarExpanded));
    if (sidebarExpanded) {
      document.body.classList.add('sidebar-expanded');
    } else {
      document.body.classList.remove('sidebar-expanded');
    }
  }, [sidebarExpanded]);

  const handleNavClick = (sectionId) => {
    onSectionChange(sectionId);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-w-fit">
      <div
        className={`fixed inset-0 bg-gray-900/30 z-40 lg:hidden lg:z-auto transition-opacity duration-200 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      <div
        id="sidebar"
        ref={sidebar}
        className={`flex flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-[100dvh] overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 lg:w-20 lg:sidebar-expanded:!w-64 2xl:!w-64 shrink-0 bg-white dark:bg-navy-900 p-4 transition-all duration-200 ease-in-out rounded-r-2xl shadow-xs ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-64 lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-10 pr-3 sm:px-2">
          <button
            ref={trigger}
            type="button"
            className="lg:hidden text-gray-500 hover:text-gray-400 shrink-0"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-controls="sidebar"
            aria-expanded={sidebarOpen}
          >
            <span className="sr-only">Cerrar menú</span>
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z" />
            </svg>
          </button>
          <Link
            to="/"
            className="block min-w-0 flex-1 lg:flex-none mx-auto lg:mx-0"
            title="Volver a proyectos"
          >
            <div className="flex items-center justify-center gap-3 lg:justify-start lg:sidebar-expanded:gap-3">
              <img
                src={`${process.env.PUBLIC_URL}/Logo%20ENAP.svg`}
                alt="ENAP"
                className="hidden h-8 w-auto max-h-8 max-w-[2.75rem] object-contain brightness-0 opacity-75 dark:invert dark:opacity-85 lg:sidebar-expanded:block 2xl:block"
              />
              <img
                src={`${process.env.PUBLIC_URL}/CotecmarLogo.svg`}
                alt="Cotecmar"
                className="h-8 w-auto max-h-8 max-w-[7.5rem] object-contain brightness-0 opacity-75 dark:invert dark:opacity-85 mx-auto lg:mx-0 duration-200"
              />
              <img
                src={`${process.env.PUBLIC_URL}/Logo_CUC.png`}
                alt="Universidad de la Costa"
                className="hidden h-8 w-auto max-h-8 max-w-[5.5rem] object-contain brightness-0 opacity-75 dark:invert dark:opacity-85 lg:sidebar-expanded:block 2xl:block"
              />
            </div>
          </Link>
          <span className="w-6 shrink-0 lg:hidden" aria-hidden="true" />
        </div>

        {proyectoNombre && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 px-3 truncate lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
            {proyectoNombre}
          </p>
        )}

        <div>
          <h3 className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3">
            <span className="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6" aria-hidden="true">
              •••
            </span>
            <span className="lg:hidden lg:sidebar-expanded:block 2xl:block">Módulo</span>
          </h3>
          <ul className="mt-3">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <li
                  key={item.id}
                  className={`pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-navy-500/[0.12] dark:from-navy-500/[0.24] to-navy-500/[0.04]'
                      : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`block w-full text-left text-gray-800 dark:text-gray-100 truncate transition duration-150 ${
                      isActive ? '' : 'hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center">
                      <span
                        className={`shrink-0 w-2 h-2 rounded-full ${
                          isActive ? 'bg-navy-800' : 'bg-gray-400 dark:bg-gray-500'
                        }`}
                      />
                      <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                        {item.label}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="pt-3 hidden lg:inline-flex 2xl:hidden justify-end mt-auto">
          <div className="w-12 pl-4 pr-3 py-2">
            <button
              type="button"
              className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
              onClick={() => setSidebarExpanded((prev) => !prev)}
            >
              <span className="sr-only">Expandir / contraer sidebar</span>
              <svg
                className={`shrink-0 fill-current text-gray-400 dark:text-gray-500 sidebar-expanded:rotate-180`}
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 16 16"
              >
                <path d="M15 16a1 1 0 0 1-1-1V1a1 1 0 1 1 2 0v14a1 1 0 0 1-1 1ZM8.586 7H1a1 1 0 1 0 0 2h7.586l-2.793 2.793a1 1 0 1 0 1.414 1.414l4.5-4.5A.997.997 0 0 0 12 8.01M11.924 7.617a.997.997 0 0 0-.217-.324l-4.5-4.5a1 1 0 0 0-1.414 1.414L8.586 7M12 7.99a.996.996 0 0 0-.076-.373Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
