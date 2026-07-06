import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchDrawioDraftXml } from '../components/criterios/drawioExportApi';

const DRAWIO_EMBED =
  'https://embed.diagrams.net/?embed=1&proto=json&ui=atlas&spin=1&modified=0&libraries=1&saveAndExit=0&noSaveBtn=1';

export default function DrawioViewerPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const iframeRef = useRef(null);
  const pendingRef = useRef({ init: false, xml: null, sent: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sendLoad = useCallback(() => {
    const { init, xml, sent } = pendingRef.current;
    if (!init || !xml || sent || !iframeRef.current?.contentWindow) return;
    pendingRef.current.sent = true;
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({ action: 'load', xml, autosave: 0 }),
      '*',
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    pendingRef.current = { init: false, xml: null, sent: false };
    setLoading(true);
    setError('');

    if (!token) {
      setError('Enlace inválido. Vuelva al mapa y pulse «Abrir en draw.io» de nuevo.');
      setLoading(false);
      return undefined;
    }

    (async () => {
      try {
        const xml = await fetchDrawioDraftXml(token, Number(id));
        if (cancelled) return;
        pendingRef.current.xml = xml;
        sendLoad();
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.message
            || 'No se pudo cargar el diagrama. Vuelva al mapa y pulse «Abrir en draw.io» de nuevo.',
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, token, sendLoad]);

  useEffect(() => {
    const onMessage = (evt) => {
      if (evt.source !== iframeRef.current?.contentWindow) return;
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (msg.event === 'init') {
        pendingRef.current.init = true;
        sendLoad();
      }
      if (msg.event === 'load') {
        setLoading(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sendLoad]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 dark:bg-navy-950">
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
            Mapa de criterios · draw.io
          </h1>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Vista de solo lectura del diagrama exportado. Use «Descargar .drawio» en el mapa si necesita guardar una copia.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md border border-gray-200 dark:border-navy-700 hover:bg-gray-50 dark:hover:bg-navy-800"
        >
          Cerrar pestaña
        </button>
      </header>

      {error ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => window.close()}
              className="inline-block text-xs font-medium px-3 py-1.5 rounded-md bg-navy-600 text-white"
            >
              Cerrar pestaña
            </button>
          </div>
        </div>
      ) : (
        <div className="relative flex-1 min-h-0">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-navy-950/80">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-500 mx-auto" />
                <p className="text-xs text-gray-500">Cargando diagrama…</p>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            title="Editor draw.io"
            src={DRAWIO_EMBED}
            className="w-full h-full border-0"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}
