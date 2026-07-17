import React, { useEffect, useRef, useState } from 'react';
import { ModalOverlay } from '../../utils/modalBackdrop';
import { proyectos } from '../../api';

function formatFecha(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ArbolBackupsModal({
  open,
  proyectoId,
  dimensiones = [],
  onClose,
  onRestored,
}) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOmoeId, setSelectedOmoeId] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const fileRef = useRef(null);

  const loadBackups = async () => {
    try {
      setLoading(true);
      const res = await proyectos.listArbolBackups(proyectoId);
      setBackups(res.data?.items || []);
    } catch (err) {
      console.error(err);
      setError('No se pudo cargar la lista de copias de seguridad.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setInfo(null);
    setNombre('');
    setDescripcion('');
    setSelectedOmoeId(dimensiones[0]?.id ? String(dimensiones[0].id) : '');
    loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proyectoId]);

  if (!open) return null;

  const handleCrear = async () => {
    if (!selectedOmoeId || creating) return;
    try {
      setCreating(true);
      setError(null);
      setInfo(null);
      const res = await proyectos.crearArbolBackup(proyectoId, {
        omoe_id: Number(selectedOmoeId),
        nombre: nombre.trim() || undefined,
        descripcion: descripcion.trim() || undefined,
      });
      setBackups((prev) => [res.data, ...prev]);
      setNombre('');
      setDescripcion('');
      setInfo('Copia de seguridad creada.');
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.detail
        || err.response?.data?.omoe_id?.[0]
        || 'No se pudo crear la copia de seguridad.',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRestaurar = async (backup) => {
    if (busyId) return;
    try {
      setBusyId(backup.id);
      setError(null);
      setInfo(null);
      const res = await proyectos.restaurarArbolBackup(proyectoId, backup.id);
      setInfo(`Árbol restaurado como «${res.data?.nombre_modelo || 'nueva dimensión'}».`);
      onRestored?.(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'No se pudo restaurar la copia.');
    } finally {
      setBusyId(null);
    }
  };

  const handleEliminar = async (backup) => {
    if (busyId) return;
    try {
      setBusyId(backup.id);
      setError(null);
      await proyectos.eliminarArbolBackup(proyectoId, backup.id);
      setBackups((prev) => prev.filter((b) => b.id !== backup.id));
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'No se pudo eliminar la copia.');
    } finally {
      setBusyId(null);
    }
  };

  const handleExportJson = async () => {
    if (!selectedOmoeId || exporting) return;
    try {
      setExporting(true);
      setError(null);
      setInfo(null);
      const res = await proyectos.exportArbol(proyectoId, Number(selectedOmoeId));
      const blob = res.data instanceof Blob
        ? res.data
        : new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const disposition = res.headers?.['content-disposition'] || '';
      const match = /filename="?([^"]+)"?/i.exec(disposition);
      const dim = dimensiones.find((d) => String(d.id) === String(selectedOmoeId));
      const fallback = `arbol_${(dim?.nombre || 'dimension').replace(/\s+/g, '_')}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] || fallback;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError('No se pudo exportar el árbol a JSON.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file || importing) return;
    try {
      setImporting(true);
      setError(null);
      setInfo(null);
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError('El archivo no es un JSON válido.');
        return;
      }
      const res = await proyectos.importarArbolJson(proyectoId, { data: parsed });
      setInfo(`Árbol importado como «${res.data?.nombre_modelo || 'nueva dimensión'}».`);
      onRestored?.(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'No se pudo importar el árbol desde el JSON.');
    } finally {
      setImporting(false);
    }
  };

  const anyBusy = creating || importing || exporting || busyId != null;

  return (
    <ModalOverlay onClose={anyBusy ? undefined : onClose}>
      <div className="bg-white dark:bg-navy-900 rounded-xl shadow-xl max-w-2xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
        <div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            Copias de seguridad del árbol
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Guarda un respaldo del árbol de una dimensión y restáuralo cuando quieras
            (se crea una nueva dimensión con nodos, pesos y curvas). También puedes
            exportar/importar el árbol como archivo JSON.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {/* Crear copia / exportar */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Respaldar / exportar una dimensión
            </p>
            <label className="block text-xs text-gray-600 dark:text-gray-300">
              Dimensión
              <select
                value={selectedOmoeId}
                onChange={(e) => setSelectedOmoeId(e.target.value)}
                disabled={anyBusy || dimensiones.length === 0}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-950 px-3 py-2 text-sm"
              >
                {dimensiones.length === 0 && <option value="">Sin dimensiones</option>}
                {dimensiones.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre de la copia (opcional)"
                disabled={anyBusy}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-950 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Descripción (opcional)"
                disabled={anyBusy}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="btn btn-primary text-sm disabled:opacity-50"
                onClick={handleCrear}
                disabled={!selectedOmoeId || anyBusy}
              >
                {creating ? 'Guardando…' : 'Crear copia de seguridad'}
              </button>
              <button
                type="button"
                className="btn border-gray-200 dark:border-gray-700/60 text-sm disabled:opacity-50"
                onClick={handleExportJson}
                disabled={!selectedOmoeId || anyBusy}
              >
                {exporting ? 'Exportando…' : 'Exportar JSON'}
              </button>
            </div>
          </div>

          {/* Importar JSON */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Importar árbol desde JSON
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Carga un archivo JSON exportado previamente para crear una nueva dimensión.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              disabled={anyBusy}
              className="block w-full text-xs text-gray-600 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-navy-500/10 file:text-navy-700 dark:file:text-navy-300"
            />
            {importing && <p className="text-xs text-gray-500">Importando árbol…</p>}
          </div>

          {/* Lista de copias */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Copias guardadas
            </p>
            {loading ? (
              <p className="text-sm text-gray-500 py-4 text-center">Cargando…</p>
            ) : backups.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                Aún no hay copias de seguridad.
              </p>
            ) : (
              <ul className="space-y-2">
                {backups.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {b.nombre}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                        {b.omoe_nombre || '—'} · {b.nodos_count} nodos · {formatFecha(b.fecha_creacion)}
                      </span>
                      {b.descripcion && (
                        <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">
                          {b.descripcion}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="text-xs font-semibold px-2 py-1 rounded bg-navy-600 text-white disabled:opacity-50"
                        onClick={() => handleRestaurar(b)}
                        disabled={anyBusy}
                      >
                        {busyId === b.id ? '…' : 'Restaurar'}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold px-2 py-1 rounded border border-red-300 text-red-600 disabled:opacity-50"
                        onClick={() => handleEliminar(b)}
                        disabled={anyBusy}
                        title="Eliminar copia"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {info && <p className="text-xs text-emerald-600">{info}</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={onClose}
            disabled={anyBusy}
          >
            Cerrar
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

export default ArbolBackupsModal;
