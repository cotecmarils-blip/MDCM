import axios from 'axios';
import {
  STORAGE_ACCESS,
  STORAGE_REFRESH,
  clearAuthSession,
  isAccessDeniedResponse,
  redirectToLoginIfNeeded,
} from './utils/authSession';

function trimTrailingSlash(url) {
  return url ? url.replace(/\/$/, '') : '';
}

function resolveApiConfig() {
  const apiUrl = process.env.REACT_APP_API_URL;
  const apiRoot = process.env.REACT_APP_API_ROOT;

  if (apiUrl) {
    const base = trimTrailingSlash(apiUrl);
    const root = base.endsWith('/api') ? base.slice(0, -4) : base;
    return { apiRoot: root, apiBaseUrl: `${root}/api` };
  }

  if (apiRoot) {
    const root = trimTrailingSlash(apiRoot);
    return { apiRoot: root, apiBaseUrl: `${root}/api` };
  }

  if (process.env.NODE_ENV === 'production') {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return { apiRoot: origin, apiBaseUrl: `${origin}/api` };
  }

  return {
    apiRoot: 'http://127.0.0.1:8000',
    apiBaseUrl: 'http://127.0.0.1:8000/api',
  };
}

const { apiRoot: API_ROOT, apiBaseUrl: API_BASE_URL } = resolveApiConfig();
const MEDIA_BASE_URL = API_ROOT;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise = null;

async function refreshAccessToken() {
  const refresh = sessionStorage.getItem(STORAGE_REFRESH);
  if (!refresh) {
    throw new Error('No refresh token');
  }
  const { data } = await axios.post(`${API_BASE_URL}/auth/refresh/`, { refresh });
  sessionStorage.setItem(STORAGE_ACCESS, data.access);
  if (data.refresh) {
    sessionStorage.setItem(STORAGE_REFRESH, data.refresh);
  }
  return data.access;
}

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(STORAGE_ACCESS);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthRoute = original?.url?.includes('/auth/login')
      || original?.url?.includes('/auth/refresh');
    if (
      error.response?.status === 401
      && original
      && !original._retry
      && !isAuthRoute
    ) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const access = await refreshPromise;
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch (refreshError) {
        clearAuthSession('Su sesión ha expirado. Inicie sesión de nuevo.');
        redirectToLoginIfNeeded();
        return Promise.reject(refreshError);
      }
    }
    if (isAccessDeniedResponse(error.response)) {
      clearAuthSession(error.response?.data?.detail);
      redirectToLoginIfNeeded();
    }
    return Promise.reject(error);
  },
);

/** FormData: quitar Content-Type para que el navegador envíe multipart con boundary. */
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    const { headers } = config;
    if (typeof headers.setContentType === 'function') {
      headers.setContentType(false);
    } else if (typeof headers.delete === 'function') {
      headers.delete('Content-Type');
    } else {
      delete headers['Content-Type'];
    }
    if (headers.common) delete headers.common['Content-Type'];
  }
  return config;
});

export const authApi = {
  login: (username, password) =>
    api.post('/auth/login/', { username, password }),
  logout: (refresh) => api.post('/auth/logout/', { refresh }),
  me: () => api.get('/auth/me/'),
  refresh: (refresh) => api.post('/auth/refresh/', { refresh }),
  getProfile: () => api.get('/auth/profile/'),
  updateProfile: (data) => api.patch('/auth/profile/', data),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password/', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  getProyectoMembership: (proyectoId) =>
    api.get(`/auth/proyectos/${proyectoId}/membership/`),
  listMemberships: (proyectoId) => (
    proyectoId
      ? api.get(`/auth/memberships/?proyecto=${proyectoId}`)
      : api.get('/auth/memberships/')
  ),
  searchUsers: (q, proyectoId) =>
    api.get('/auth/users/', {
      params: {
        q,
        ...(proyectoId ? { proyecto: proyectoId } : {}),
      },
    }),
  createMembership: (data) => api.post('/auth/memberships/', data),
  updateMembership: (id, data) => api.patch(`/auth/memberships/${id}/`, data),
  deleteMembership: (id) => api.delete(`/auth/memberships/${id}/`),
};

// Proyectos
export const proyectos = {
  getAll: () => api.get('/proyectos/'),
  getById: (id) => api.get(`/proyectos/${id}/`),
  create: (data) => api.post('/proyectos/', data),
  update: (id, data) => api.patch(`/proyectos/${id}/`, data),
  updateWithFormData: (id, data) => api.patch(`/proyectos/${id}/`, data),
  delete: (id, { password } = {}) =>
    api.delete(`/proyectos/${id}/`, { data: password ? { password } : {} }),
  downloadRequisitosTemplate: (id) =>
    api.get(`/proyectos/${id}/requisitos/template/`, { responseType: 'blob' }),
  importRequisitos: (id, file, replace = true) => {
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('replace', replace ? 'true' : 'false');
    return api.post(`/proyectos/${id}/requisitos/import/`, formData);
  },
  exportHierarchy: (id, omoeId) =>
    api.get(`/proyectos/${id}/export/hierarchy/`, {
      params: omoeId ? { omoe: omoeId } : {},
      responseType: 'blob',
    }),
  catalogoDimensiones: (id) => api.get(`/proyectos/${id}/catalogo-dimensiones/`),
  importarDimension: (id, data) => api.post(`/proyectos/${id}/importar-dimension/`, data),
  exportDiagram: (id, omoeId) =>
    api.get(`/proyectos/${id}/export/diagram/`, {
      params: omoeId ? { omoe: omoeId } : {},
      responseType: 'text',
    }),
  exportDiagramEscenarios: (id, omoeId) =>
    api.get(`/proyectos/${id}/export/diagram-escenarios/`, {
      params: omoeId ? { omoe: omoeId } : {},
      responseType: 'text',
    }),
  createDiagramDraft: (id, omoeId, { escenarios = false } = {}) =>
    api.post(
      escenarios
        ? `/proyectos/${id}/export/diagram-escenarios-draft/`
        : `/proyectos/${id}/export/diagram-draft/`,
      null,
      {
        params: omoeId ? { omoe: omoeId } : {},
      },
    ),
  exportAlternatives: (id, omoeId) =>
    api.get(`/proyectos/${id}/export/alternatives/`, {
      params: omoeId ? { omoe: omoeId } : {},
      responseType: 'blob',
    }),
  getNivelesArbol: (id) => api.get(`/proyectos/${id}/niveles-arbol/`),
  updateNivelesArbol: (id, data) => api.put(`/proyectos/${id}/niveles-arbol/`, data),
  getAnalisis: (id, omoeId) =>
    api.get(`/proyectos/${id}/analisis/`, {
      params: omoeId ? { omoe: omoeId } : {},
    }),
  getSensibilidad: (id, { node = 'root', omoeId } = {}) =>
    api.get(`/proyectos/${id}/sensibilidad/`, {
      params: {
        node,
        ...(omoeId ? { omoe: omoeId } : {}),
      },
    }),
};

// Alternativas
export const alternativas = {
  getByProyecto: (proyectoId) => api.get(`/alternativas/?proyecto=${proyectoId}`),
  getById: (id) => api.get(`/alternativas/${id}/`),
  create: (data) => api.post('/alternativas/', data),
  update: (id, data) => api.patch(`/alternativas/${id}/`, data),
  delete: (id) => api.delete(`/alternativas/${id}/`),
};

export const capacidades = {
  getByAlternativa: (alternativaId) => api.get(`/capacidades/?alternativa=${alternativaId}`),
  create: (data) => api.post('/capacidades/', data),
  update: (id, data) => api.patch(`/capacidades/${id}/`, data),
  delete: (id) => api.delete(`/capacidades/${id}/`),
};

export const caracteristicasPlantilla = {
  getByProyecto: (proyectoId) =>
    api.get(`/caracteristicas-plantilla/?proyecto=${proyectoId}`),
  create: (data) => api.post('/caracteristicas-plantilla/', data),
  update: (id, data) => api.patch(`/caracteristicas-plantilla/${id}/`, data),
  delete: (id) => api.delete(`/caracteristicas-plantilla/${id}/`),
};

export const caracteristicas = {
  getByAlternativa: (alternativaId) => api.get(`/caracteristicas/?alternativa=${alternativaId}`),
  create: (data) => api.post('/caracteristicas/', data),
  update: (id, data) => api.patch(`/caracteristicas/${id}/`, data),
  delete: (id) => api.delete(`/caracteristicas/${id}/`),
};

export const requisitos = {
  getByProyecto: (proyectoId) => api.get(`/requisitos/?proyecto=${proyectoId}`),
  getById: (id) => api.get(`/requisitos/${id}/`),
  create: (data) => api.post('/requisitos/', data),
  update: (id, data) => api.patch(`/requisitos/${id}/`, data),
  delete: (id) => api.delete(`/requisitos/${id}/`),
};

// Documentos
export const documentos = {
  getByAlternativa: (alternativaId) => api.get(`/documentos/?alternativa=${alternativaId}`),
  create: (data) => {
    const formData = new FormData();
    formData.append('nombre', data.nombre);
    formData.append('alternativa', data.alternativa);
    formData.append('archivo', data.archivo);
    return api.post('/documentos/', formData);
  },
  delete: (id) => api.delete(`/documentos/${id}/`),
};

// Grupos de afinidad (endpoint /dimensiones/) — MOP (/atributos/) — Atributo (/subatributos/)
export const dimensiones = {
  getByProyecto: (proyectoId) => api.get(`/dimensiones/?proyecto=${proyectoId}`),
  getById: (id) => api.get(`/dimensiones/${id}/`),
  create: (data) => api.post('/dimensiones/', data),
  update: (id, data) => {
    if (data instanceof FormData) {
      return api.patch(`/dimensiones/${id}/`, data);
    }
    return api.patch(`/dimensiones/${id}/`, data);
  },
  delete: (id) => api.delete(`/dimensiones/${id}/`),
};

export const atributos = {
  getByDimension: (dimensionId) => api.get(`/atributos/?dimension=${dimensionId}`),
  create: (data) => api.post('/atributos/', data),
  update: (id, data) => {
    if (data instanceof FormData) {
      return api.patch(`/atributos/${id}/`, data);
    }
    return api.patch(`/atributos/${id}/`, data);
  },
  delete: (id) => api.delete(`/atributos/${id}/`),
};

export const subatributos = {
  getByAtributo: (atributoId) => api.get(`/subatributos/?atributo=${atributoId}`),
  create: (data) => api.post('/subatributos/', data),
  update: (id, data) => {
    if (data instanceof FormData) {
      return api.patch(`/subatributos/${id}/`, data);
    }
    return api.patch(`/subatributos/${id}/`, data);
  },
  delete: (id) => api.delete(`/subatributos/${id}/`),
};

export const escenarios = {
  getByProyecto: (proyectoId) => api.get(`/escenarios/?proyecto=${proyectoId}`),
  getByOmoe: (omoeId) => api.get(`/escenarios/?omoe=${omoeId}`),
  getById: (id) => api.get(`/escenarios/${id}/`),
  create: (data) => api.post('/escenarios/', data),
  update: (id, data) => api.patch(`/escenarios/${id}/`, data),
  delete: (id) => api.delete(`/escenarios/${id}/`),
  getPesos: (escenarioId) => api.get(`/escenarios/${escenarioId}/pesos/`),
  setPesos: (escenarioId, pesos) =>
    api.put(`/escenarios/${escenarioId}/pesos/`, { pesos }),
  getConfigArbol: (escenarioId) => api.get(`/escenarios/${escenarioId}/config-arbol/`),
  setConfigArbol: (escenarioId, nodos) =>
    api.put(`/escenarios/${escenarioId}/config-arbol/`, { nodos }),
  getConfigNodo: (escenarioId, nodoId) =>
    api.get(`/escenarios/${escenarioId}/config-arbol/`, { params: { nodo: nodoId } }),
  setConfigNodo: (escenarioId, nodoId, data) =>
    api.put(`/escenarios/${escenarioId}/config-arbol/`, data, { params: { nodo: nodoId } }),
  getPesoGrupo: (escenarioId, parentId) =>
    api.get(`/escenarios/${escenarioId}/peso-grupo/`, {
      params: { parent: parentId == null ? 'root' : parentId },
    }),
  setPesoGrupo: (escenarioId, parentId, data) =>
    api.put(`/escenarios/${escenarioId}/peso-grupo/`, data, {
      params: { parent: parentId == null ? 'root' : parentId },
    }),
  aplicarPesoGrupo: (escenarioId, parentId) =>
    api.post(`/escenarios/${escenarioId}/peso-grupo/aplicar/`, null, {
      params: { parent: parentId == null ? 'root' : parentId },
    }),
  /** Alternativa por nodo (misma lógica). */
  getConfigNodoAlt: (nodoId, escenarioId) =>
    api.get(`/nodos-arbol/${nodoId}/config-escenario/`, { params: { escenario: escenarioId } }),
  setConfigNodoAlt: (nodoId, escenarioId, data) =>
    api.put(`/nodos-arbol/${nodoId}/config-escenario/`, data, { params: { escenario: escenarioId } }),
};

// Árbol OMOE (Árbol de dimensiones)
export const omoeApi = {
  getByProyecto: (proyectoId) => api.get(`/omoe/?proyecto=${proyectoId}`),
  getById: (id) => api.get(`/omoe/${id}/`),
  create: (data) => api.post('/omoe/', data),
  update: (id, data) => api.patch(`/omoe/${id}/`, data),
  delete: (id) => api.delete(`/omoe/${id}/`),
};

/** Catálogo global de tipos de dimensión (extensible). */
export const tiposDimensionApi = {
  list: (params = {}) => api.get('/tipos-dimension/', { params }),
  getById: (id) => api.get(`/tipos-dimension/${id}/`),
  create: (data) => api.post('/tipos-dimension/', data),
  update: (id, data) => api.patch(`/tipos-dimension/${id}/`, data),
  remove: (id) => api.delete(`/tipos-dimension/${id}/`),
};

export const misionesApi = {
  getByOmoe: (omoeId) => api.get(`/misiones/?omoe=${omoeId}`),
  create: (data) => api.post('/misiones/', data),
  update: (id, data) => api.patch(`/misiones/${id}/`, data),
  delete: (id) => api.delete(`/misiones/${id}/`),
};

export const gruposAfinidadApi = {
  getByMision: (misionId) => api.get(`/grupos-afinidad/?mision=${misionId}`),
  create: (data) => api.post('/grupos-afinidad/', data),
  update: (id, data) => api.patch(`/grupos-afinidad/${id}/`, data),
  delete: (id) => api.delete(`/grupos-afinidad/${id}/`),
};

export const mopsCriterioApi = {
  getByGrupo: (grupoId) => api.get(`/mops-criterio/?grupo_afinidad=${grupoId}`),
  create: (data) => api.post('/mops-criterio/', data),
  update: (id, data) => api.patch(`/mops-criterio/${id}/`, data),
  delete: (id) => api.delete(`/mops-criterio/${id}/`),
};

export const dpsCriterioApi = {
  getByMop: (mopId) => api.get(`/dps-criterio/?mop=${mopId}`),
  create: (data) => api.post('/dps-criterio/', data),
  update: (id, data) => api.patch(`/dps-criterio/${id}/`, data),
  delete: (id) => api.delete(`/dps-criterio/${id}/`),
};

export const nodoArbolApi = {
  getByOmoe: (omoeId) => api.get(`/nodos-arbol/?omoe=${omoeId}`),
  create: (data) => api.post('/nodos-arbol/', data),
  update: (id, data) => api.patch(`/nodos-arbol/${id}/`, data),
  delete: (id) => api.delete(`/nodos-arbol/${id}/`),
  reordenar: (ids) => api.post('/nodos-arbol/reordenar/', { ids }),
};

export const nivelesArbolApi = {
  get: (proyectoId, rama) =>
    api.get(`/proyectos/${proyectoId}/niveles-arbol/`, {
      params: rama ? { rama } : {},
    }),
  getAll: (proyectoId) => api.get(`/proyectos/${proyectoId}/niveles-arbol/`),
  update: (proyectoId, rama, niveles) =>
    api.put(`/proyectos/${proyectoId}/niveles-arbol/`, { rama, niveles }),
};

export const tablasRiesgoApi = {
  get: (proyectoId) => api.get(`/proyectos/${proyectoId}/tablas-riesgo/`),
  update: (proyectoId, data) => api.put(`/proyectos/${proyectoId}/tablas-riesgo/`, data),
};

export const vopResultadosApi = {
  getByAlternativa: (alternativaId) =>
    api.get(`/vop-resultados/?alternativa=${alternativaId}`),
  getByDp: (dpId) => api.get(`/vop-resultados/?dp=${dpId}`),
  create: (data) => api.post('/vop-resultados/', data),
  update: (id, data) => api.patch(`/vop-resultados/${id}/`, data),
  delete: (id) => api.delete(`/vop-resultados/${id}/`),
};

export const evaluacionApi = {
  getSchema: (proyectoId) => api.get(`/proyectos/${proyectoId}/evaluacion/schema/`),
  exportCurvas: (proyectoId) => api.get(`/proyectos/${proyectoId}/curvas-utilidad/`),
  exportInformeCurvasWord: (proyectoId) =>
    api.get(`/proyectos/${proyectoId}/informe-curvas-word/`, {
      responseType: 'blob',
    }),
  exportInformeCostosWord: (proyectoId) =>
    api.get(`/proyectos/${proyectoId}/informe-costos-word/`, {
      responseType: 'blob',
    }),
  getValores: (proyectoId, alternativaId) =>
    api.get(`/proyectos/${proyectoId}/evaluacion/valores/`, {
      params: { alternativa: alternativaId },
    }),
  saveValores: (proyectoId, alternativaId, valores) =>
    api.put(`/proyectos/${proyectoId}/evaluacion/valores/`, { valores }, {
      params: { alternativa: alternativaId },
    }),
};

export const simulacionApi = {
  validar: (proyectoId) => api.get(`/proyectos/${proyectoId}/simulacion/validar/`),
  getOpciones: (proyectoId) => api.get(`/proyectos/${proyectoId}/simulacion/opciones/`),
  preview: (proyectoId, opciones = {}) =>
    api.post(`/proyectos/${proyectoId}/simulacion/preview/`, opciones),
  calcular: (proyectoId, opciones = {}) =>
    api.post(`/proyectos/${proyectoId}/simulacion/calcular/`, opciones),
  listHistorial: (proyectoId) => api.get(`/proyectos/${proyectoId}/simulacion/historial/`),
  getHistorial: (proyectoId, historialId) =>
    api.get(`/proyectos/${proyectoId}/simulacion/historial/${historialId}/`),
  deleteHistorial: (proyectoId, historialId) =>
    api.delete(`/proyectos/${proyectoId}/simulacion/historial/${historialId}/`),
  sensibilidad: (proyectoId, body = {}) =>
    api.post(`/proyectos/${proyectoId}/simulacion/sensibilidad/`, body),
};

export const auditoriaEventosApi = {
  list: (proyectoId) => api.get(`/proyectos/${proyectoId}/eventos-decision/`),
  activo: (proyectoId) =>
    api.get(`/proyectos/${proyectoId}/eventos-decision/`, { params: { scope: 'activo' } }),
  auditoria: (proyectoId, params = {}) =>
    api.get(`/proyectos/${proyectoId}/eventos-decision/`, {
      params: { scope: 'auditoria', ...params },
    }),
  colaboradores: (proyectoId) =>
    api.get(`/proyectos/${proyectoId}/eventos-decision/`, {
      params: { scope: 'colaboradores' },
    }),
  create: (proyectoId, body) => api.post(`/proyectos/${proyectoId}/eventos-decision/`, body),
  get: (proyectoId, eventoId) =>
    api.get(`/proyectos/${proyectoId}/eventos-decision/${eventoId}/`),
  update: (proyectoId, eventoId, body) =>
    api.put(`/proyectos/${proyectoId}/eventos-decision/${eventoId}/`, body),
  activar: (proyectoId, eventoId) =>
    api.post(`/proyectos/${proyectoId}/eventos-decision/${eventoId}/activar/`),
  cerrar: (proyectoId, eventoId, body = {}) =>
    api.post(`/proyectos/${proyectoId}/eventos-decision/${eventoId}/cerrar/`, body),
  informe: (proyectoId, eventoId) =>
    api.get(`/proyectos/${proyectoId}/eventos-decision/${eventoId}/`, {
      params: { scope: 'informe' },
    }),
  nodosAuditoria: (proyectoId, params = {}) =>
    api.get(`/proyectos/${proyectoId}/eventos-decision/`, {
      params: { scope: 'nodos-auditoria', ...params },
    }),
  historialNodo: (proyectoId, params = {}) =>
    api.get(`/proyectos/${proyectoId}/eventos-decision/`, {
      params: { scope: 'historial-nodo', ...params },
    }),
};

export const configTrazabilidadApi = {
  get: (proyectoId, params = {}) =>
    api.get(`/proyectos/${proyectoId}/config-trazabilidad/`, { params }),
  registrarSesion: (proyectoId, body) =>
    api.post(`/proyectos/${proyectoId}/config-trazabilidad/`, body),
};

export const documentosCriterio = {
  getByDimension: (dimensionId) => api.get(`/documentos-criterio/?dimension=${dimensionId}`),
  getByAtributo: (atributoId) => api.get(`/documentos-criterio/?atributo=${atributoId}`),
  getBySubatributo: (subatributoId) => api.get(`/documentos-criterio/?subatributo=${subatributoId}`),
  create: (data) => {
    const formData = new FormData();
    if (data.dimension) formData.append('dimension', data.dimension);
    if (data.atributo) formData.append('atributo', data.atributo);
    if (data.subatributo) formData.append('subatributo', data.subatributo);
    formData.append('nombre', data.nombre);
    formData.append('archivo', data.archivo);
    return api.post('/documentos-criterio/', formData);
  },
  delete: (id) => api.delete(`/documentos-criterio/${id}/`),
};

export { API_BASE_URL, API_ROOT, MEDIA_BASE_URL };

export default api;
