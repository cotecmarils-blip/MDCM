import React, { useState, useEffect, useMemo } from 'react';
import { escenarios, omoeApi } from '../../api';
import { RAMA_EVALUACION_SHORT } from '../criterios/ramaEvaluacionOptions';
import {
  getEscenarioPesosHint,
  usesEscenarioPesos,
} from '../criterios/escenarioAgregacionConstants';

function EscenarioFormPanel({
  proyectoId,
  escenarioId,
  isNew,
  escenariosList = [],
  onSaved,
  onDeleted,
  onCancelNew,
}) {
  const [dimensiones, setDimensiones] = useState([]);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    peso: '',
    omoe: '',
  });
  const [ramaEvaluacion, setRamaEvaluacion] = useState('');
  const [, setOmoeNombre] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const pesoResumen = useMemo(() => {
    if (!formData.omoe) return null;
    const omoeId = Number(formData.omoe);
    return escenariosList
      .filter((e) => e.omoe === omoeId && (!escenarioId || e.id !== escenarioId))
      .reduce((sum, e) => sum + Number(e.peso || 0), 0);
  }, [formData.omoe, escenariosList, escenarioId]);

  const selectedDimension = useMemo(
    () => dimensiones.find((d) => String(d.id) === String(formData.omoe)),
    [dimensiones, formData.omoe],
  );

  const escenarioAgregacion = selectedDimension?.escenario_agregacion;
  const aplicaPesosEscenario = usesEscenarioPesos(escenarioAgregacion);
  const pesosHint = getEscenarioPesosHint(escenarioAgregacion);

  useEffect(() => {
    const loadDimensiones = async () => {
      try {
        const res = await omoeApi.getByProyecto(proyectoId);
        setDimensiones(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
      }
    };
    loadDimensiones();
  }, [proyectoId]);

  useEffect(() => {
    if (isNew) {
      setFormData({
        nombre: '',
        descripcion: '',
        peso: '',
        omoe: dimensiones.length === 1 ? String(dimensiones[0].id) : '',
      });
      if (dimensiones.length === 1) {
        setRamaEvaluacion(dimensiones[0].rama_evaluacion || 'omoe');
        setOmoeNombre(dimensiones[0].nombre_modelo || dimensiones[0].nombre || '');
      } else {
        setRamaEvaluacion('');
        setOmoeNombre('');
      }
      setError(null);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const res = await escenarios.getById(escenarioId);
        setFormData({
          nombre: res.data.nombre || '',
          descripcion: res.data.descripcion || '',
          peso: res.data.peso != null ? String(res.data.peso) : '',
          omoe: res.data.omoe != null ? String(res.data.omoe) : '',
        });
        setRamaEvaluacion(res.data.rama_evaluacion || '');
        setOmoeNombre(res.data.omoe_nombre || '');
      } catch (err) {
        console.error(err);
        setError('No se pudo cargar el escenario');
      } finally {
        setLoading(false);
      }
    };
    if (escenarioId) load();
  }, [escenarioId, isNew, dimensiones]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => {
      const next = { ...p, [name]: value };
      if (name === 'omoe') {
        const dim = dimensiones.find((d) => String(d.id) === String(value));
        setRamaEvaluacion(dim?.rama_evaluacion || '');
        setOmoeNombre(dim?.nombre_modelo || dim?.nombre || '');
      }
      return next;
    });
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;
    if (!formData.omoe) {
      setError('Seleccione la dimensión a la que pertenece el escenario.');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion,
        omoe: Number(formData.omoe),
        proyecto: proyectoId,
      };
      if (formData.peso !== '' && aplicaPesosEscenario) {
        payload.peso = Number(formData.peso);
      }
      if (isNew) {
        const res = await escenarios.create(payload);
        onSaved(res.data.id);
      } else {
        await escenarios.update(escenarioId, payload);
        onSaved(escenarioId);
      }
    } catch (err) {
      const detail = err.response?.data;
      setError(
        typeof detail === 'string'
          ? detail
          : detail?.nombre?.[0] ||
            detail?.omoe?.[0] ||
            detail?.peso?.[0] ||
            'Error al guardar el escenario'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Eliminar este escenario?')) return;
    try {
      await escenarios.delete(escenarioId);
      onDeleted();
    } catch {
      alert('No se pudo eliminar el escenario.');
    }
  };

  const inputClass =
    'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-navy-900/40 text-gray-800 dark:text-gray-100 input-focus';

  const ramaLabel = RAMA_EVALUACION_SHORT[ramaEvaluacion] || ramaEvaluacion;

  if (!isNew && loading && !formData.nombre) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-500" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-b border-gray-200 dark:border-gray-700/60 pb-4 mb-4">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            {isNew ? 'Nuevo escenario' : 'Datos del escenario'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            El tipo (OMOE / OMOC / OMOR) se toma de la dimensión seleccionada. Cada dimensión incluye
            el escenario «Estandar» al crearse.
          </p>
        </div>
        <div className="flex gap-2">
          {isNew && onCancelNew && (
            <button type="button" onClick={onCancelNew} className="btn-sm border-gray-200 dark:border-gray-700/60">
              Cancelar
            </button>
          )}
          {!isNew && (
            <button
              type="button"
              onClick={handleDelete}
              className="btn-sm text-red-600 border-red-200 dark:border-red-500/40"
            >
              Eliminar escenario
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Dimensión *
        </label>
        {dimensiones.length > 0 ? (
          <select
            name="omoe"
            value={formData.omoe}
            onChange={handleChange}
            required
            className={inputClass}
          >
            <option value="">— Seleccionar dimensión —</option>
            {dimensiones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre_modelo || d.nombre || `Dimensión #${d.id}`}
                {d.rama_evaluacion ? ` (${RAMA_EVALUACION_SHORT[d.rama_evaluacion] || d.rama_evaluacion})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cree al menos una dimensión en el árbol de criterios.
          </p>
        )}
      </div>

      {ramaEvaluacion && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tipo
          </label>
          <p className="text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-navy-900/40 text-gray-600 dark:text-gray-300">
            {ramaLabel}
            <span className="text-xs text-gray-400 ml-2">(heredado de la dimensión)</span>
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Nombre *
        </label>
        <input
          type="text"
          name="nombre"
          value={formData.nombre}
          onChange={handleChange}
          required
          className={inputClass}
          placeholder="Ej. Misión de patrulla, Escenario base…"
        />
      </div>

      {formData.omoe && !aplicaPesosEscenario && pesosHint && (
        <div className="rounded-lg border border-blue-200/70 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-900/15 px-3 py-2 text-xs text-blue-900 dark:text-blue-200">
          {pesosHint}
        </div>
      )}

      {aplicaPesosEscenario && (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Peso del escenario (%)
        </label>
        <input
          type="number"
          name="peso"
          value={formData.peso}
          onChange={handleChange}
          min={0}
          max={100}
          step={0.01}
          className={inputClass}
          placeholder="Ej. 33.33"
        />
        {formData.omoe && (
          <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
            Otros escenarios de la dimensión: {(pesoResumen ?? 0).toFixed(2)}%
            {formData.peso !== '' && (
              <>
                {' '}
                · Total con este:{' '}
                {((pesoResumen ?? 0) + Number(formData.peso)).toFixed(2)}%
              </>
            )}
            {formData.peso !== ''
              && Math.abs((pesoResumen ?? 0) + Number(formData.peso) - 100) > 0.05 && (
              <span className="text-amber-600 dark:text-amber-400">
                {' '}
                (la suma debe ser 100 %)
              </span>
            )}
          </p>
        )}
      </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Descripción
        </label>
        <textarea
          name="descripcion"
          value={formData.descripcion}
          onChange={handleChange}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading || !formData.nombre.trim() || !formData.omoe}
          className="btn btn-primary disabled:opacity-50"
        >
          {loading ? 'Guardando...' : isNew ? 'Crear escenario' : 'Guardar datos'}
        </button>
      </div>
    </form>
  );
}

export default EscenarioFormPanel;
