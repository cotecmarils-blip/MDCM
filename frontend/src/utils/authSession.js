export const STORAGE_ACCESS = 'MCDM_access_token';
export const STORAGE_REFRESH = 'MCDM_refresh_token';
export const STORAGE_USER = 'MCDM_user';
export const STORAGE_AUTH_MESSAGE = 'MCDM_auth_message';

export const ACCESS_DENIED_CODES = ['access_expired', 'access_disabled', 'no_access', 'account_disabled'];

export function isAccessDeniedResponse(response) {
  const code = response?.data?.code;
  return response?.status === 403 && ACCESS_DENIED_CODES.includes(code);
}

export function clearAuthSession(message = null) {
  sessionStorage.removeItem(STORAGE_ACCESS);
  sessionStorage.removeItem(STORAGE_REFRESH);
  sessionStorage.removeItem(STORAGE_USER);
  if (message) {
    sessionStorage.setItem(STORAGE_AUTH_MESSAGE, message);
  }
}

export function redirectToLoginIfNeeded() {
  const onDrawioViewer = window.location.pathname.includes('/diagrama-drawio');
  if (!onDrawioViewer && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export function consumeStoredAuthMessage() {
  const message = sessionStorage.getItem(STORAGE_AUTH_MESSAGE);
  if (message) {
    sessionStorage.removeItem(STORAGE_AUTH_MESSAGE);
  }
  return message;
}
