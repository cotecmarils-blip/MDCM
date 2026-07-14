import { MEDIA_BASE_URL } from '../api';

export function resolveMediaUrl(url) {
  if (!url) return null;

  let resolved;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    resolved = url;
  } else {
    const path = url.startsWith('/') ? url : `/${url}`;
    resolved = `${MEDIA_BASE_URL}${path}`;
  }

  if (
    typeof window !== 'undefined'
    && window.location.protocol === 'https:'
    && resolved.startsWith('http://')
  ) {
    resolved = `https://${resolved.slice(7)}`;
  }

  return resolved;
}

/** Extrae el nombre de archivo desde una ruta o URL de media. */
export function getFileNameFromUrl(url) {
  if (!url) return '';
  const path = String(url).split('?')[0];
  const segment = path.split('/').filter(Boolean).pop() || '';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function formatCosto(value, unidad = 'MUSD') {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  if (Number.isNaN(num)) return null;
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
  const u = unidad || 'MUSD';
  return `${formatted} ${u}`;
}

const PROYECTO_TEXT_FIELDS = [
  'eslora_maxima',
  'desplazamiento',
  'velocidad_maxima',
  'velocidad_crucero',
  'tripulacion',
  'autonomia',
  'propulsion',
  'posicionamiento_dinamico',
  'laboratorios',
  'otras_caracteristicas',
];

/** Objeto JSON para crear/actualizar proyecto (sin imagen nueva). */
export function buildProyectoPayload(data) {
  const payload = {
    nombre: data.nombre,
    descripcion: data.descripcion ?? '',
  };
  PROYECTO_TEXT_FIELDS.forEach((key) => {
    payload[key] = data[key] ?? '';
  });
  return payload;
}

/** FormData solo cuando hay archivo de imagen. */
export function buildProyectoFormData(data) {
  const formData = new FormData();
  formData.append('nombre', data.nombre);
  formData.append('descripcion', data.descripcion ?? '');
  PROYECTO_TEXT_FIELDS.forEach((key) => {
    formData.append(key, data[key] ?? '');
  });
  if (data.foto) formData.append('foto', data.foto);
  return formData;
}

/** JSON si no hay foto nueva; FormData si hay imagen. */
export function buildProyectoSavePayload(data) {
  if (data.foto) return buildProyectoFormData(data);
  return buildProyectoPayload(data);
}

export function buildAlternativaFormData(data) {
  const formData = new FormData();
  if (data.proyecto != null) formData.append('proyecto', data.proyecto);
  formData.append('nombre', data.nombre);
  formData.append('apodo', data.apodo ?? '');
  formData.append('descripcion', data.descripcion ?? '');
  formData.append('referencia', data.referencia ?? '');
  if (data.costo !== '' && data.costo != null) {
    formData.append('costo', data.costo);
  }
  formData.append('costo_unidad', data.costo_unidad || 'MUSD');
  if (data.foto) formData.append('foto', data.foto);
  if (data.anexo) formData.append('anexo', data.anexo);
  return formData;
}
