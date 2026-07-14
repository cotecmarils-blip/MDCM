import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserAvatar, { getUserDisplayName } from './UserAvatar';

function UserMenu({ isDark, showName = true, className = '' }) {
  const { user, logout, esAdminGlobal } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  if (!user) return null;

  const displayName = getUserDisplayName(user);
  const menuBg = isDark ? 'bg-navy-900 border-navy-700' : 'bg-white border-gray-200';
  const itemHover = isDark ? 'hover:bg-navy-800' : 'hover:bg-gray-50';

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors ${
          isDark ? 'hover:bg-navy-800' : 'hover:bg-gray-100'
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserAvatar user={user} size="sm" />
        {showName && (
          <span className={`hidden md:inline text-sm font-medium max-w-[140px] truncate ${
            isDark ? 'text-gray-200' : 'text-gray-700'
          }`}
          >
            {displayName}
          </span>
        )}
        <svg
          className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute right-0 mt-2 w-56 rounded-xl border shadow-lg py-1 z-50 ${menuBg}`}
          role="menu"
        >
          <div className={`px-4 py-3 border-b ${isDark ? 'border-navy-700' : 'border-gray-100'}`}>
            <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {displayName}
            </p>
            <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              @{user.username}
              {esAdminGlobal ? ' · Admin' : ''}
            </p>
          </div>
          <Link
            to="/perfil"
            onClick={() => setOpen(false)}
            className={`block px-4 py-2.5 text-sm ${isDark ? 'text-gray-200' : 'text-slate-700'} ${itemHover}`}
            role="menuitem"
          >
            Mi perfil
          </Link>
          {esAdminGlobal && (
            <Link
              to="/tipos-dimension"
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm ${isDark ? 'text-gray-200' : 'text-slate-700'} ${itemHover}`}
              role="menuitem"
            >
              Tipos de dimensión
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className={`w-full text-left px-4 py-2.5 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} ${itemHover}`}
            role="menuitem"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
