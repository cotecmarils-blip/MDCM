"""Verifica que cada familia de función de utilidad sea genuinamente distinta.

Cubre las funciones implementadas en pyDecisionMaking y su reconstrucción vía
`api.pydecision_bridge.evaluate_utility` (misma ruta que usa el pipeline MADM).
"""
from django.test import SimpleTestCase

from api.pydecision_bridge import evaluate_utility


def _ev(spec, xs):
    return [round(evaluate_utility(x, spec), 3) for x in xs]


_BASE = {'threshold': 0.0, 'goal': 10.0, 'threshold_utility': 0.0, 'goal_utility': 1.0}


class UtilityFunctionsDistinctTests(SimpleTestCase):
    def test_ratio_increasing_is_x_over_u(self):
        spec = {'type': 'RatioUtilityFunction', 'is_increasing': True, **_BASE}
        self.assertEqual(_ev(spec, [0, 5, 10, 12]), [0.0, 0.5, 1.0, 1.0])

    def test_ratio_decreasing_is_l_over_x(self):
        spec = {
            'type': 'RatioUtilityFunction', 'is_increasing': False,
            'threshold': 2.0, 'goal': 10.0,
            'threshold_utility': 0.0, 'goal_utility': 1.0,
        }
        self.assertEqual(_ev(spec, [1, 2, 4, 10]), [1.0, 1.0, 0.5, 0.2])

    def test_ratio_differs_from_minmax(self):
        # A x=2.5 con L=0,U=10: min-max=0.25, ratio=0.25 → usar caso donde difieren.
        # min-max con L=5,U=10 en x=7.5 = 0.5; ratio x/U = 0.75.
        base = {'threshold': 5.0, 'goal': 10.0, 'threshold_utility': 0.0, 'goal_utility': 1.0}
        ratio = evaluate_utility(7.5, {'type': 'RatioUtilityFunction', 'is_increasing': True, **base})
        minmax = evaluate_utility(7.5, {'type': 'LinearUtilityFunction', 'is_increasing': True, **base})
        self.assertAlmostEqual(ratio, 0.75, places=3)
        self.assertAlmostEqual(minmax, 0.5, places=3)
        self.assertNotAlmostEqual(ratio, minmax, places=3)

    def test_triangular_peak(self):
        spec = {'type': 'TriangularUtilityFunction', 'is_increasing': True, 'peak': 5.0, **_BASE}
        self.assertEqual(_ev(spec, [0, 2.5, 5, 7.5, 10]), [0.0, 0.5, 1.0, 0.5, 0.0])

    def test_trapezoidal_plateau(self):
        spec = {
            'type': 'TrapezoidalUtilityFunction', 'is_increasing': True,
            'plateau_start': 3.0, 'plateau_end': 7.0, **_BASE,
        }
        self.assertEqual(_ev(spec, [0, 3, 5, 7, 10]), [0.0, 1.0, 1.0, 1.0, 0.0])

    def test_distance_to_target(self):
        spec = {
            'type': 'DistanceUtilityFunction', 'is_increasing': True,
            'target': 5.0, 'radius': 5.0, **_BASE,
        }
        self.assertEqual(_ev(spec, [0, 2.5, 5, 7.5, 10]), [0.0, 0.5, 1.0, 0.5, 0.0])

    def test_veto_hard_cutoff(self):
        spec = {
            'type': 'VetoUtilityFunction', 'is_increasing': False, 'veto': 8.0,
            'threshold': 0.0, 'goal': 8.0, 'threshold_utility': 0.0, 'goal_utility': 1.0,
        }
        vals = _ev(spec, [0, 4, 8, 10])
        self.assertEqual(vals[0], 1.0)
        self.assertEqual(vals[1], 0.5)
        self.assertEqual(vals[2], 0.0)
        self.assertEqual(vals[3], 0.0)
