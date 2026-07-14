"""Modo de valor en nodos terminales (utilidad normalizada vs. dato bruto)."""

MODO_VALOR_UTILIDAD = 'utilidad'
MODO_VALOR_BRUTO = 'valor_bruto'

MODO_VALOR_TERMINAL_CHOICES = [
    (MODO_VALOR_UTILIDAD, 'Función de utilidad (0–1)'),
    (MODO_VALOR_BRUTO, 'Valor bruto (sin transformación)'),
]

MODO_VALOR_TERMINAL_DEFAULT = MODO_VALOR_UTILIDAD
