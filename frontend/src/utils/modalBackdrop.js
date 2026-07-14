import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** Clase estándar del overlay de modales (oscuro + blur, viewport completo). */
export const MODAL_BACKDROP_CLASS =
  'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm';

/**
 * Renderiza el modal en document.body para que el backdrop cubra toda la página,
 * incluso cuando el componente padre tiene overflow-hidden (p. ej. ProjectDetailPage).
 */
export function ModalOverlay({ children, onClose, className = MODAL_BACKDROP_CLASS }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleBackdropClick = (e) => {
    if (onClose && e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className={className} onClick={handleBackdropClick} role="presentation">
      {children}
    </div>,
    document.body,
  );
}
