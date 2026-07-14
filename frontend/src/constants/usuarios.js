export const ROL_OPTIONS = [
  { value: 'jefe', label: 'Gerente' },
  { value: 'analista', label: 'Ingeniero' },
  { value: 'evaluador', label: 'Evaluador / experto' },
  { value: 'ofertante', label: 'Proveedor' },
  { value: 'auditor', label: 'Auditor (solo lectura)' },
];

export const ROL_LABELS = Object.fromEntries(ROL_OPTIONS.map((o) => [o.value, o.label]));

export const ESTADO_ACCESO_LABELS = {
  vigente: 'Vigente',
  vencido: 'Vencido',
  deshabilitado: 'Deshabilitado',
};

export function formatFechaAcceso(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function defaultMembershipForm() {
  return {
    modoUsuario: 'existente',
    usuario_id: null,
    username: '',
    email: '',
    password: '',
    passwordConfirm: '',
    first_name: '',
    last_name: '',
    proyecto: '',
    rol: 'analista',
    activo: true,
    presetAcceso: 'ilimitado',
    tipoAcceso: 'ilimitado',
    dias_acceso: 30,
    horas_acceso: 0,
    minutos_acceso: 0,
    mision_ids: [],
    alternativa_ids: [],
  };
}
