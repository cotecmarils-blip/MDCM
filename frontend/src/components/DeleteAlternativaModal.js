import React, { useEffect, useState } from 'react';
import { useTheme } from '../ThemeContext';
import { MODAL_BACKDROP_CLASS } from '../utils/modalBackdrop';
import { getAlternativaInputClass, getAlternativaLabelClass } from './alternativaFormStyles';

function DeleteAlternativaModal({ nombre, deleting = false, onConfirm, onCancel }) {
  const { isDark } = useTheme();
  const inputClass = getAlternativaInputClass(isDark);
  const labelClass = getAlternativaLabelClass(isDark);
  const [typed, setTyped] = useState('');

  const target = (nombre || '').trim();
  const matches = typed.trim() === target && target.length > 0;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleting) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [deleting, onCancel]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (matches && !deleting) onConfirm();
  };

  return (
    <div className={MODAL_BACKDROP_CLASS}>
      <div
        className={`${isDark ? 'bg-slate-800' : 'bg-white'} rounded-xl shadow-xl max-w-md w-full flex flex-col`}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700/60 shrink-0">
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400">
            Eliminar alternativa
          </h2>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Esta acción es permanente y elimina la alternativa junto con sus
            capacidades, características y documentos. No se puede deshacer.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>
              Para confirmar, escribe el nombre exacto de la alternativa:
            </label>
            <p className="mb-2 mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100 break-words">
              {target || '(sin nombre)'}
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className={inputClass}
              placeholder="Escribe el nombre aquí"
              autoFocus
              disabled={deleting}
              autoComplete="off"
            />
            {typed.length > 0 && !matches && (
              <p className="mt-1 text-xs text-red-500">
                El nombre no coincide.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!matches || deleting}
              className="btn-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DeleteAlternativaModal;
