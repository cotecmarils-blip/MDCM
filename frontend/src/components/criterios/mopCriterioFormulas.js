/** Fórmulas LaTeX y metadatos visuales para tipos de criterio y familias de función. */

export const TIPO_CRITERIO_FORMULAS = {
  mas_es_mejor: {
    latex: 'u(x) \\uparrow \\quad \\text{cuando} \\quad x \\uparrow',
    hint: 'A mayor valor del atributo, mayor utilidad.',
    curve: 'increasing',
  },
  menos_es_mejor: {
    latex: 'u(x) \\downarrow \\quad \\text{cuando} \\quad x \\uparrow',
    hint: 'A mayor valor del atributo, menor utilidad.',
    curve: 'decreasing',
  },
  menos_es_mejor_penalizacion: {
    latex: 'u(x) \\text{ con penalización no lineal}',
    hint: 'Menos es mejor; fuera de umbral la caída puede ser abrupta.',
    curve: 'steep_decreasing',
  },
  valor_objetivo: {
    latex: 'u(x) \\text{ máxima en } x = T',
    hint: 'Existe un valor objetivo T hacia el cual se orienta la utilidad.',
    curve: 'target',
  },
  intervalo_optimo: {
    latex: 'u(x) \\text{ máxima en } [L, U]',
    hint: 'El óptimo es un intervalo o punto central del rango.',
    curve: 'triangular',
  },
  preferencia_categorias: {
    latex: 'u(c_i) \\in \\{u_1, u_2, \\ldots\\}',
    hint: 'La utilidad se asigna por categoría o estado discreto.',
    curve: 'discrete',
  },
};

export const FAMILIA_FUNCIONES_FORMULAS = {
  razon_relativa: {
    latex: 'u(x) = \\frac{x - L}{U - L}',
    hint: 'Lineal creciente entre L (u=0) y U (u=1).',
    curve: 'increasing',
  },
  min_max: {
    latex: 'u(x) = \\frac{x - L}{U - L}',
    hint: 'Normalización min–max entre umbral L y meta U.',
    curve: 'increasing',
  },
  meta_saturada: {
    latex: 'u(x)=\\dfrac{\\ln(1+kn)}{\\ln(1+k)},\\quad n=\\dfrac{x-L}{U-L}',
    hint: 'Crecimiento logarítmico que satura hacia la meta.',
    curve: 'logarithmic',
  },
  umbral_creciente: {
    latex: 'u(x) = 0 \\text{ en } L,\\; u(x) = 1 \\text{ en } U',
    hint: 'Lineal creciente entre umbral y meta.',
    curve: 'increasing',
  },
  exponencial_creciente: {
    latex: 'u(x)=\\dfrac{e^{kn}-1}{e^{k}-1},\\quad n=\\dfrac{x-L}{U-L}',
    hint: 'Curva exponencial creciente con pendiente k.',
    curve: 'exponential_inc',
  },
  razon_inversa: {
    latex: 'u(x) = 1 - \\frac{x - L}{U - L}',
    hint: 'Lineal decreciente: menor x implica mayor utilidad.',
    curve: 'decreasing',
  },
  min_max_decreciente: {
    latex: 'u(x) = 1 - \\frac{x - L}{U - L}',
    hint: 'Min–max invertido (decreciente) entre L y U.',
    curve: 'decreasing',
  },
  umbral_decreciente: {
    latex: 'u(x) = 1 \\text{ en } L,\\; u(x) = 0 \\text{ en } U',
    hint: 'Lineal decreciente entre umbral y meta.',
    curve: 'decreasing',
  },
  exponencial_decreciente: {
    latex: 'u(x) = \\frac{e^{k\\,n} - 1}{e^{k} - 1}, \\quad n = 1 - \\frac{x-L}{U-L}',
    hint: 'Exponencial con sentido decreciente.',
    curve: 'exponential_dec',
  },
  logistica_decreciente: {
    latex: 'u(x) = \\sigma(n) = \\frac{1}{1 + e^{-k(n - x_0)}}',
    hint: 'Sigmoide (logística) con punto de inflexión x₀.',
    curve: 'sigmoid',
  },
  umbral_veto: {
    latex: 'u(x) = 0 \\quad \\text{si } x > V',
    hint: 'Penalización total si se supera el umbral de veto V.',
    curve: 'veto',
  },
  funcion_saturada: {
    latex: 'u(x) = \\frac{\\ln(1 + S\\,n)}{\\ln(1 + S)}',
    hint: 'Saturación logarítmica con parámetro S.',
    curve: 'logarithmic',
  },
  distancia_meta: {
    latex: 'u(x) = 1 - \\frac{|x - T|}{R}',
    hint: 'Utilidad decrece con la distancia al objetivo T.',
    curve: 'target',
  },
  triangular: {
    latex: 'u(x)=0\\ (x\\le L),\\ \\max\\ \\text{en}\\ M,\\ u(x)=0\\ (x\\ge U)',
    hint: 'Pico triangular en el punto medio M.',
    curve: 'triangular',
  },
  trapezoidal: {
    latex: 'u(x) = 1 \\text{ en } [M_1, M_2]',
    hint: 'Meseta óptima entre M₁ y M₂ con rampas laterales.',
    curve: 'trapezoidal',
  },
  distancia_ideal: {
    latex: 'u(x) = 1 - \\frac{|x - I|}{d_{\\max}}',
    hint: 'Utilidad decrece con la distancia al ideal I.',
    curve: 'target',
  },
  escalas_discretas: {
    latex: 'u(x)=u_i\\ \\text{si}\\ x=c_i',
    hint: 'Tabla categoría → utilidad.',
    curve: 'discrete',
  },
  funciones_tramos: {
    latex: 'u(x) = f_i(x) \\quad \\text{en tramo } i',
    hint: 'Utilidad definida por tramos entre puntos de corte.',
    curve: 'piecewise',
  },
  tablas_equivalencia: {
    latex: 'u(s) = \\text{tabla}(s)',
    hint: 'Equivalencia estado → utilidad.',
    curve: 'discrete',
  },
};

export function getTipoFormula(value) {
  return TIPO_CRITERIO_FORMULAS[value] || { latex: '', hint: '', curve: 'increasing' };
}

export function getFamiliaFormula(value) {
  return FAMILIA_FUNCIONES_FORMULAS[value] || { latex: '', hint: '', curve: 'increasing' };
}
