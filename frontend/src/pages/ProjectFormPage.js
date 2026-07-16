import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import { proyectos, authApi } from '../api';
import { buildProyectoSavePayload } from '../utils/media';
import ImageGallery from '../components/ImageGallery';
import ThemeToggle from '../components/ThemeToggle';
import { emptyProyectoFormState, proyectoToFormState } from '../constants/proyectoCaracteristicas';
import { getAlternativaInputClass, getAlternativaLabelClass } from '../components/alternativaFormStyles';
import { MODAL_BACKDROP_CLASS } from '../utils/modalBackdrop';

function ProjectFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const isNew = !id || id === 'nuevo';
  const proyectoId = isNew ? null : id;

  const [formData, setFormData] = useState(emptyProyectoFormState());
  const [existingFoto, setExistingFoto] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');

  const inputClass = getAlternativaInputClass(isDark);
  const labelClass = getAlternativaLabelClass(isDark);

  useEffect(() => {
    if (!isNew) return;
    authApi.me().then((res) => {
      if (!res.data?.puede_crear_proyecto && !res.data?.es_admin_global) {
        alert('No tienes permiso para crear proyectos.');
        navigate('/');
      }
    }).catch(() => {});
  }, [isNew, navigate]);

  useEffect(() => {
    if (isNew) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await proyectos.getById(proyectoId);
        setFormData(proyectoToFormState(res.data));
        setExistingFoto(res.data.foto);
      } catch (err) {
        console.error(err);
        alert('No se pudo cargar el proyecto');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isNew, proyectoId, navigate]);

  useEffect(() => {
    if (isNew || !proyectoId) {
      setCanDelete(false);
      return;
    }
    authApi
      .getProyectoMembership(proyectoId)
      .then((res) => {
        setCanDelete(Boolean(
          res.data?.puede_eliminar_proyecto || res.data?.es_admin_global,
        ));
      })
      .catch(() => setCanDelete(false));
  }, [isNew, proyectoId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;
    try {
      setSaving(true);
      const payload = buildProyectoSavePayload(formData);
      let targetId = proyectoId;
      if (isNew) {
        const res = await proyectos.create(payload);
        targetId = res.data.id;
      } else {
        await proyectos.update(proyectoId, payload);
      }
      navigate(`/proyecto/${targetId}`);
    } catch (err) {
      console.error(err);
      const detail = err.response?.data;
      const msg =
        typeof detail === 'string'
          ? detail
          : detail
            ? Object.entries(detail)
                .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                .join('\n')
            : err.message;
      alert(`Error al guardar:\n${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deletePassword.trim()) {
      setDeletePasswordError('Indique su contraseña para confirmar.');
      return;
    }
    try {
      setDeleting(true);
      setDeletePasswordError('');
      await proyectos.delete(proyectoId, { password: deletePassword });
      navigate('/');
    } catch (err) {
      console.error(err);
      const data = err.response?.data;
      const passwordMsg = Array.isArray(data?.password) ? data.password[0] : data?.password;
      if (passwordMsg) {
        setDeletePasswordError(passwordMsg);
        return;
      }
      const detail = data?.detail || data?.mensaje;
      alert(detail || 'No se pudo eliminar el proyecto. Verifique sus permisos.');
    } finally {
      setDeleting(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeletePassword('');
    setDeletePasswordError('');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-navy-50 dark:bg-navy-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-600" />
      </div>
    );
  }

  const title = isNew ? 'Nuevo proyecto' : 'Configuración del proyecto';

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? 'bg-navy-950' : 'bg-navy-50'}`}>
      <header className="shrink-0 border-b border-gray-200 dark:border-navy-800/60 bg-white/90 dark:bg-navy-900/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Link
              to={isNew ? '/' : `/proyecto/${proyectoId}`}
              className="text-sm text-navy-800 dark:text-navy-400 hover:underline"
            >
              ← {isNew ? 'Proyectos' : 'Volver al proyecto'}
            </Link>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {title}
            </h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <form
          id="proyecto-form"
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8 pb-28"
        >
          <section className="bg-white dark:bg-navy-900 rounded-xl border border-gray-200 dark:border-navy-800/80 p-4 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">
              Datos del proyecto
            </h2>
            <ImageGallery
              title="Imagen del proyecto"
              currentImage={existingFoto}
              newImage={formData.foto}
              onImageChange={(file) => setFormData((p) => ({ ...p, foto: file }))}
              onImageRemove={() => setFormData((p) => ({ ...p, foto: null }))}
              isDark={isDark}
            />
            <div>
              <label className={labelClass}>Nombre del proyecto *</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder=""
              />
            </div>
            <div>
              <label className={labelClass}>Descripción del problema</label>
              <textarea
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                rows={6}
                className={`${inputClass} min-h-[8rem] resize-y`}
                placeholder="Describe el problema o el alcance del proyecto…"
              />
            </div>
          </section>

          <section className="bg-white dark:bg-navy-900 rounded-xl border border-gray-200 dark:border-navy-800/80 p-4 sm:p-6 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Nota</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-6">
              Los requisitos del proyecto se gestionan en{' '}
              <span className="font-semibold">Gestión de alternativas → Requisitos</span>, no en este
              formulario.
            </p>
          </section>

          {!isNew && canDelete && (
            <section className="bg-white dark:bg-navy-900 rounded-xl border border-red-200 dark:border-red-900/50 p-4 sm:p-6 shadow-xs space-y-3">
              <h2 className="text-base font-bold text-red-700 dark:text-red-400">
                Zona de peligro
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-6">
                Al eliminar el proyecto se borrarán de forma permanente todas las alternativas,
                requisitos, criterios, evaluaciones, escenarios, simulaciones guardadas, archivos
                adjuntos y usuarios asignados a este proyecto.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDeletePassword('');
                  setDeletePasswordError('');
                  setDeleteOpen(true);
                }}
                className="btn bg-red-600 hover:bg-red-700 text-white border-transparent text-sm"
              >
                Eliminar proyecto
              </button>
            </section>
          )}
        </form>
      </main>

      {deleteOpen && (
        <div
          className={MODAL_BACKDROP_CLASS}
          role="dialog"
          aria-modal="true"
          onClick={closeDeleteModal}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-md w-full border border-gray-200 dark:border-navy-800/80 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
              Eliminar proyecto
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              ¿Eliminar <strong>{formData.nombre || 'este proyecto'}</strong> y todo su contenido?
              Esta acción no se puede deshacer.
            </p>
            <div className="mt-4">
              <label className={labelClass} htmlFor="delete-project-password">
                Su contraseña *
              </label>
              <input
                id="delete-project-password"
                type="password"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  if (deletePasswordError) setDeletePasswordError('');
                }}
                autoComplete="current-password"
                disabled={deleting}
                className={inputClass}
                placeholder="Confirme con su contraseña de acceso"
              />
              {deletePasswordError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{deletePasswordError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleting}
                className="btn border-gray-200 dark:border-gray-700/60 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={deleting || !deletePassword.trim()}
                className="btn bg-red-600 hover:bg-red-700 text-white text-sm border-transparent disabled:opacity-50"
              >
                {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-200 dark:border-navy-800/60 bg-white/95 dark:bg-navy-900/95 backdrop-blur-sm z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex justify-end gap-3">
          <Link
            to={isNew ? '/' : `/proyecto/${proyectoId}`}
            className="btn-sm border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            form="proyecto-form"
            disabled={saving || !formData.nombre.trim()}
            className="btn btn-primary disabled:opacity-50"
          >
            {saving ? 'Guardando...' : isNew ? 'Crear proyecto' : 'Guardar configuración'}
          </button>
        </div>
      </footer>
    </div>
  );
}

export default ProjectFormPage;
