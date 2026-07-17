import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../ThemeContext';
import { alternativas, capacidades, caracteristicas, caracteristicasPlantilla } from '../api';
import { buildAlternativaFormData } from '../utils/media';
import {
  buildValoresFromPlantillas,
  buildValoresDefaultPlantillas,
} from '../utils/caracteristicas';
import AlternativaFormFields from './AlternativaFormFields';
import AlternativaViewContent from './AlternativaViewContent';
import AlternativaCaracteristicasFields from './AlternativaCaracteristicasFields';
import DocumentosList from './DocumentosList';
import DeleteAlternativaModal from './DeleteAlternativaModal';
import { getAlternativaInputClass, getAlternativaLabelClass } from './alternativaFormStyles';

const emptyCapacidad = () => ({ _key: crypto.randomUUID(), nombre: '', descripcion: '' });

function mapCapacidad(c) {
  return {
    _key: `id-${c.id}`,
    id: c.id,
    nombre: c.nombre || '',
    descripcion: c.descripcion || '',
  };
}

function AlternativaDetailPanel({
  proyectoId,
  alternativaId,
  isNew,
  plantillasVersion = 0,
  onSaved,
  onDeleted,
  onCancelNew,
  onOpenConfigPlantillas,
  canCreate = true,
  canWrite = true,
}) {
  const { isDark } = useTheme();
  const inputClass = getAlternativaInputClass(isDark);
  const labelClass = getAlternativaLabelClass(isDark);

  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    apodo: '',
    descripcion: '',
    referencia: '',
    costo: '',
    costo_unidad: 'MUSD',
    foto: null,
    anexo: null,
  });
  const [capacidadesList, setCapacidadesList] = useState([]);
  const [caracteristicasValores, setCaracteristicasValores] = useState([]);
  const [plantillasEmpty, setPlantillasEmpty] = useState(false);
  const [removedCapacidadIds, setRemovedCapacidadIds] = useState([]);
  const [removedCaracteristicaIds, setRemovedCaracteristicaIds] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isViewMode = !isNew && !isEditing;

  useEffect(() => {
    setIsEditing(false);
  }, [alternativaId, isNew]);

  const loadPlantillasForAlternativa = useCallback(async (existingCaracteristicas = []) => {
    try {
      const res = await caracteristicasPlantilla.getByProyecto(proyectoId);
      const plantillas = res.data || [];
      setPlantillasEmpty(plantillas.length === 0);
      if (existingCaracteristicas.length > 0 || !isNew) {
        setCaracteristicasValores(
          buildValoresFromPlantillas(plantillas, existingCaracteristicas)
        );
      } else {
        setCaracteristicasValores(buildValoresDefaultPlantillas(plantillas));
      }
    } catch (err) {
      console.error(err);
    }
  }, [proyectoId, isNew]);

  const populateFromAlternativa = useCallback((alt) => {
    setExisting(alt);
    setFormData({
      nombre: alt.nombre || '',
      apodo: alt.apodo || '',
      descripcion: alt.descripcion || '',
      referencia: alt.referencia || '',
      costo: alt.costo ?? '',
      costo_unidad: alt.costo_unidad || 'MUSD',
      foto: null,
      anexo: null,
    });
    setCapacidadesList((alt.capacidades || []).map(mapCapacidad));
    setRemovedCapacidadIds([]);
    setRemovedCaracteristicaIds([]);
    loadPlantillasForAlternativa(alt.caracteristicas || []);
  }, [loadPlantillasForAlternativa]);

  useEffect(() => {
    if (isNew) {
      setExisting(null);
      setFormData({
        nombre: '',
        apodo: '',
        descripcion: '',
        referencia: '',
        costo: '',
        costo_unidad: 'MUSD',
        foto: null,
        anexo: null,
      });
      setCapacidadesList([]);
      setRemovedCapacidadIds([]);
      setRemovedCaracteristicaIds([]);
      loadPlantillasForAlternativa([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      if (!alternativaId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const res = await alternativas.getById(alternativaId);
        populateFromAlternativa(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [alternativaId, isNew, loadPlantillasForAlternativa, populateFromAlternativa]);

  useEffect(() => {
    if (!plantillasVersion) return;
    if (isNew || isEditing) {
      loadPlantillasForAlternativa(
        isNew ? [] : existing?.caracteristicas || []
      );
    }
  }, [plantillasVersion, isNew, isEditing, existing, loadPlantillasForAlternativa]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    setFormData((prev) => ({ ...prev, [name]: files[0] || null }));
  };

  const syncCapacidades = async (altId) => {
    for (const id of removedCapacidadIds) {
      await capacidades.delete(id);
    }
    for (const cap of capacidadesList) {
      if (!cap.nombre.trim()) continue;
      const payload = {
        alternativa: altId,
        nombre: cap.nombre.trim(),
        descripcion: cap.descripcion || '',
      };
      if (cap.id) await capacidades.update(cap.id, payload);
      else await capacidades.create(payload);
    }
  };

  const syncCaracteristicas = async (altId) => {
    const deleted = new Set(removedCaracteristicaIds);
    for (const id of removedCaracteristicaIds) {
      await caracteristicas.delete(id);
    }
    for (const row of caracteristicasValores) {
      if (!row.activa) {
        if (row.id && !deleted.has(row.id)) {
          await caracteristicas.delete(row.id);
        }
        continue;
      }
      const payload = {
        alternativa: altId,
        plantilla: row.plantillaId,
        dato: row.dato || '',
      };
      if (row.id) await caracteristicas.update(row.id, payload);
      else await caracteristicas.create(payload);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = buildAlternativaFormData(
        isNew ? { proyecto: proyectoId, ...formData } : formData
      );
      let altId = alternativaId;
      if (isNew) {
        const res = await alternativas.create(payload);
        altId = res.data.id;
      } else {
        await alternativas.update(alternativaId, payload);
      }
      await syncCapacidades(altId);
      await syncCaracteristicas(altId);
      if (!isNew) {
        const res = await alternativas.getById(altId);
        populateFromAlternativa(res.data);
        setIsEditing(false);
      }
      onSaved(altId);
    } catch (err) {
      console.error(err);
      const data = err.response?.data;
      const msg =
        typeof data === 'string'
          ? data
          : data
            ? Object.entries(data)
                .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                .join('\n')
            : err.message;
      alert(`Error al guardar la alternativa:\n${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setDeleting(true);
      await alternativas.delete(alternativaId);
      setShowDeleteModal(false);
      onDeleted();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const updateCapacidad = (key, field, value) => {
    setCapacidadesList((prev) =>
      prev.map((c) => (c._key === key ? { ...c, [field]: value } : c))
    );
  };

  const removeCapacidad = (cap) => {
    if (cap.id) setRemovedCapacidadIds((prev) => [...prev, cap.id]);
    setCapacidadesList((prev) => prev.filter((c) => c._key !== cap._key));
  };

  const toggleCaracteristicaActiva = (plantillaId) => {
    setCaracteristicasValores((prev) =>
      prev.map((row) => {
        if (row.plantillaId !== plantillaId) return row;
        const activa = !row.activa;
        if (!activa && row.id) {
          setRemovedCaracteristicaIds((ids) =>
            ids.includes(row.id) ? ids : [...ids, row.id]
          );
        }
        if (activa && row.id) {
          setRemovedCaracteristicaIds((ids) => ids.filter((id) => id !== row.id));
        }
        return { ...row, activa };
      })
    );
  };

  const updateCaracteristicaDato = (plantillaId, dato) => {
    setCaracteristicasValores((prev) =>
      prev.map((row) => (row.plantillaId === plantillaId ? { ...row, dato } : row))
    );
  };

  const handleCancelEdit = () => {
    if (existing) populateFromAlternativa(existing);
    setIsEditing(false);
  };

  const handleDocumentsChange = (docs) => {
    setExisting((prev) => (prev ? { ...prev, documentos: docs } : prev));
  };

  if (isNew && !canCreate) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center py-16">
        No tienes permiso para crear alternativas. Puedes editar las existentes.
      </p>
    );
  }

  if (!isNew && !alternativaId) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center py-16">
        Selecciona una alternativa de la lista o crea una nueva.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-500" />
      </div>
    );
  }

  const deleteModal = showDeleteModal ? (
    <DeleteAlternativaModal
      nombre={existing?.nombre}
      deleting={deleting}
      onConfirm={handleConfirmDelete}
      onCancel={() => !deleting && setShowDeleteModal(false)}
    />
  ) : null;

  if (isViewMode && existing) {
    return (
      <>
      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            {existing.nombre || 'Alternativa'}
          </h3>
          <div className="flex gap-2">
            {canWrite && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="btn-sm bg-navy-800 text-white hover:bg-navy-700"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="btn-sm text-red-600 border-red-200 dark:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        </div>
        <AlternativaViewContent
          alternativa={existing}
          isDark={isDark}
          onDocumentsChange={handleDocumentsChange}
          onOpenConfigPlantillas={onOpenConfigPlantillas}
        />
      </div>
      {deleteModal}
      </>
    );
  }

  const saveLabel = saving
    ? 'Guardando...'
    : isNew
      ? 'Crear alternativa'
      : 'Guardar cambios';
  const canSave = !saving && formData.nombre.trim();

  return (
    <>
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
      <div className="flex flex-wrap justify-between items-center gap-3 shrink-0 mb-4">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          {isNew ? 'Nueva alternativa' : 'Editar alternativa'}
        </h3>
        <div className="flex flex-wrap gap-2">
          {isNew && (
            <button
              type="button"
              onClick={onCancelNew}
              className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
            >
              Cancelar
            </button>
          )}
          {!isNew && canWrite && (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="btn-sm text-red-600 border-red-200 dark:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 min-h-0 pr-1">
      <AlternativaFormFields
        formData={formData}
        onInputChange={handleInputChange}
        onFileChange={handleFileChange}
        isDark={isDark}
        existing={existing}
      />

      <div className="border-t border-gray-200 dark:border-gray-700/60 pt-6">
        <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-3">Capacidades</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Define capacidades con nombre y descripción.
        </p>
        {capacidadesList.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic mb-3">Sin capacidades configuradas.</p>
        ) : (
          <div className="space-y-3 mb-3">
            {capacidadesList.map((cap, index) => (
              <div
                key={cap._key}
                className="p-4 rounded-lg border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-navy-900/40 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-500">Capacidad {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeCapacidad(cap)}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Quitar
                  </button>
                </div>
                <div>
                  <label className={labelClass}>Nombre</label>
                  <input
                    type="text"
                    value={cap.nombre}
                    onChange={(e) => updateCapacidad(cap._key, 'nombre', e.target.value)}
                    className={inputClass}
                    placeholder="Nombre de la capacidad"
                  />
                </div>
                <div>
                  <label className={labelClass}>Descripción</label>
                  <textarea
                    value={cap.descripcion}
                    onChange={(e) => updateCapacidad(cap._key, 'descripcion', e.target.value)}
                    className={`${inputClass} resize-none`}
                    rows={2}
                    placeholder="Descripción"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setCapacidadesList((prev) => [...prev, emptyCapacidad()])}
          className="btn-sm bg-navy-800 text-white hover:bg-navy-700"
        >
          + Agregar capacidad
        </button>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700/60 pt-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h4 className="font-bold text-gray-800 dark:text-gray-100">Características</h4>
          <button
            type="button"
            onClick={onOpenConfigPlantillas}
            className="btn-sm border border-gray-200 dark:border-gray-700/60 text-navy-800 dark:text-navy-300 hover:bg-gray-50 dark:hover:bg-navy-800/40"
          >
            Configurar catálogo
          </button>
        </div>
        <AlternativaCaracteristicasFields
          valores={caracteristicasValores}
          plantillasEmpty={plantillasEmpty}
          isDark={isDark}
          onToggleActiva={toggleCaracteristicaActiva}
          onUpdateDato={updateCaracteristicaDato}
        />
      </div>

      {!isNew && alternativaId && (
        <div className="border-t border-gray-200 dark:border-gray-700/60 pt-6">
          <DocumentosList
            alternativaId={alternativaId}
            legacyAnexo={existing?.anexo}
            onChange={handleDocumentsChange}
          />
        </div>
      )}
      </div>

      <div className="shrink-0 flex justify-end gap-2 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700/60 bg-white dark:bg-navy-900">
        {canWrite && (
          <button
            type="submit"
            disabled={!canSave}
            className="btn btn-primary disabled:opacity-50"
          >
            {saveLabel}
          </button>
        )}
      </div>
    </form>
    {deleteModal}
    </>
  );
}

export default AlternativaDetailPanel;
