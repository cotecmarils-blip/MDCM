import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../context/AuthContext';
import { tiposDimensionApi } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import UserMenu from '../components/UserMenu';
import {
  ESCENARIO_AGREGACION_OPTIONS,
  MODO_VALOR_TERMINAL_OPTIONS,
} from '../components/criterios/escenarioAgregacionConstants';

const EMPTY_FORM = {
  codigo: '',
  nombre: '',
  descripcion: '',
  sentido_optimizacion: 'max',
  escenario_agregacion_default: 'compensatorio',
  modo_valor_terminal_default: 'utilidad',
  orden: 10,
  activo: true,
};

function TiposDimensionPage() {
  const { isDark } = useTheme();
  const { esAdminGlobal } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await tiposDimensionApi.list({ all: 1 });
      setItems(res.data || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!esAdminGlobal) {
    return <Navigate to="/" replace />;
  }

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      codigo: item.codigo,
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      sentido_optimizacion: item.sentido_optimizacion || 'max',
      escenario_agregacion_default: item.escenario_agregacion_default || 'compensatorio',
      modo_valor_terminal_default: item.modo_valor_terminal_default || 'utilidad',
      orden: item.orden ?? 0,
      activo: item.activo !== false,
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload = {
        ...form,
        codigo: String(form.codigo || '').trim().toLowerCase(),
        orden: Number(form.orden) || 0,
      };
      if (editingId) {
        await tiposDimensionApi.update(editingId, payload);
      } else {
        await tiposDimensionApi.create(payload);
      }
      await load();
      startCreate();
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.detail
        || data?.codigo?.[0]
        || data?.nombre?.[0]
        || 'No se pudo guardar el tipo.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (item) => {
    if (item.es_sistema) {
      try {
        await tiposDimensionApi.update(item.id, { activo: !item.activo });
        await load();
      } catch (err) {
        setError(err.response?.data?.detail || 'No se pudo actualizar.');
      }
      return;
    }
    if (!window.confirm(`¿Desactivar el tipo «${item.codigo}»? Seguirá en dimensiones ya creadas.`)) {
      return;
    }
    try {
      await tiposDimensionApi.remove(item.id);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo desactivar.');
    }
  };

  const pageBg = isDark ? 'bg-navy-950 text-gray-100' : 'bg-gray-50 text-gray-900';

  return (
    <div className={`min-h-screen ${pageBg}`}>
      <header className={`border-b px-4 py-3 flex items-center justify-between ${
        isDark ? 'border-navy-800 bg-navy-900' : 'border-gray-200 bg-white'
      }`}
      >
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-navy-500 hover:underline">← Proyectos</Link>
          <h1 className="text-lg font-bold">Tipos de dimensión</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu isDark={isDark} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Catálogo global editable. Los proyectos eligen estos tipos al crear dimensiones.
          No hace falta precargar las nueve: agregue tipos cuando los necesite.
        </p>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="grid lg:grid-cols-2 gap-6">
          <section className={`rounded-xl border p-4 ${
            isDark ? 'border-navy-800 bg-navy-900' : 'border-gray-200 bg-white'
          }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Catálogo</h2>
              <button type="button" className="btn btn-secondary text-xs" onClick={startCreate}>
                Nuevo
              </button>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-500" />
              </div>
            ) : (
              <ul className="space-y-2 max-h-[28rem] overflow-y-auto">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-lg border px-3 py-2 ${
                      item.activo
                        ? (isDark ? 'border-navy-700' : 'border-gray-200')
                        : 'opacity-50 border-dashed border-gray-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" className="text-left min-w-0" onClick={() => startEdit(item)}>
                        <span className="font-medium block truncate">{item.nombre}</span>
                        <span className="text-xs text-gray-500">
                          {item.codigo}
                          {item.es_sistema ? ' · sistema' : ''}
                          {' · '}
                          {item.sentido_optimizacion}
                          {!item.activo ? ' · inactivo' : ''}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="text-xs text-gray-500 hover:text-navy-500 shrink-0"
                        onClick={() => handleDeactivate(item)}
                      >
                        {item.es_sistema ? (item.activo ? 'Desactivar' : 'Activar') : 'Quitar'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`rounded-xl border p-4 ${
            isDark ? 'border-navy-800 bg-navy-900' : 'border-gray-200 bg-white'
          }`}
          >
            <h2 className="font-semibold mb-3">
              {editingId ? 'Editar tipo' : 'Crear tipo'}
            </h2>
            <form className="space-y-3" onSubmit={handleSave}>
              <label className="block text-sm">
                Código
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  value={form.codigo}
                  disabled={Boolean(editingId && items.find((i) => i.id === editingId)?.es_sistema)}
                  onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                  placeholder="ej. sostenibilidad"
                  required
                />
              </label>
              <label className="block text-sm">
                Nombre
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm">
                Descripción
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  rows={2}
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                Sentido MADM
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  value={form.sentido_optimizacion}
                  onChange={(e) => setForm((f) => ({ ...f, sentido_optimizacion: e.target.value }))}
                >
                  <option value="max">Maximizar (beneficio)</option>
                  <option value="min">Minimizar (costo / riesgo)</option>
                </select>
              </label>
              <label className="block text-sm">
                Agregación de escenarios (default)
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  value={form.escenario_agregacion_default}
                  onChange={(e) => setForm((f) => ({ ...f, escenario_agregacion_default: e.target.value }))}
                >
                  {ESCENARIO_AGREGACION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Modo valor terminal (default)
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  value={form.modo_valor_terminal_default}
                  onChange={(e) => setForm((f) => ({ ...f, modo_valor_terminal_default: e.target.value }))}
                >
                  {MODO_VALOR_TERMINAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Orden
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  value={form.orden}
                  onChange={(e) => setForm((f) => ({ ...f, orden: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                />
                Activo (aparece al crear dimensiones)
              </label>
              <button type="submit" className="btn btn-primary text-sm" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

export default TiposDimensionPage;
