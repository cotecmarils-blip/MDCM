"""Pruebas de configuración de epsilon para el filtro Pareto."""
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from api.madm_pipeline import parse_pareto_epsilon
from api.pareto_solver import DEFAULT_PARETO_EPSILON, ParetoSolver


class ParseParetoEpsilonTests(SimpleTestCase):
    def test_default_when_missing(self):
        self.assertEqual(parse_pareto_epsilon(None), DEFAULT_PARETO_EPSILON)
        self.assertEqual(parse_pareto_epsilon(''), DEFAULT_PARETO_EPSILON)

    def test_valid_decimal_values(self):
        self.assertEqual(parse_pareto_epsilon(0), 0.0)
        self.assertEqual(parse_pareto_epsilon('0.001'), 0.001)
        self.assertEqual(parse_pareto_epsilon('1e-6'), 1e-6)
        self.assertEqual(parse_pareto_epsilon('1e-9'), 1e-9)

    def test_invalid_values_raise(self):
        msg = 'Ingrese un valor de epsilon válido, mayor o igual que cero.'
        for raw in ('abc', '-0.1', float('inf'), float('nan')):
            with self.subTest(raw=raw):
                with self.assertRaises(ValidationError) as ctx:
                    parse_pareto_epsilon(raw)
                self.assertIn(msg, str(ctx.exception))


class ParetoSolverEpsilonBehaviorTests(SimpleTestCase):
    def _dominates_with_epsilon(self, epsilon: float) -> bool:
        matrix = [[10.0, 5.0], [10.0005, 5.0]]
        result = ParetoSolver(
            matrix=matrix,
            dimensions=['D1', 'D2'],
            directions=['max', 'max'],
            alternatives=['A', 'B'],
            epsilon=epsilon,
        ).solve()
        return 'A' in result.dominated_alternatives

    def test_large_epsilon_treats_close_values_as_equal(self):
        self.assertFalse(self._dominates_with_epsilon(0.001))

    def test_small_epsilon_detects_strict_dominance(self):
        self.assertTrue(self._dominates_with_epsilon(1e-5))

    def test_default_epsilon_matches_constant(self):
        solver = ParetoSolver(
            matrix=[[1.0], [2.0]],
            dimensions=['D1'],
            directions=['max'],
            alternatives=['A', 'B'],
        )
        self.assertEqual(solver.solve_as_dict(include_metadata=True)['metadata']['epsilon'],
                         DEFAULT_PARETO_EPSILON)
