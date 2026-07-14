"""Frente de Pareto / alternativas no dominadas (notebook 01)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from functools import wraps
from time import perf_counter
from typing import Any, Callable, Sequence

import numpy as np
import numpy.typing as npt

DEFAULT_PARETO_EPSILON = 1e-12


class Direction(str, Enum):
    MIN = "min"
    MAX = "max"


@dataclass(frozen=True, slots=True)
class DominanceRelation:
    dominated_index: int
    dominated_alternative: str
    dominator_index: int
    dominator_alternative: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "dominated_index": self.dominated_index,
            "dominated_alternative": self.dominated_alternative,
            "dominator_index": self.dominator_index,
            "dominator_alternative": self.dominator_alternative,
        }


@dataclass(frozen=True, slots=True)
class ComparisonRecord:
    comparison_number: int

    reference_index: int
    reference_alternative: str

    candidate_index: int
    candidate_alternative: str

    dominates: bool
    better_or_equal_all: bool
    strictly_better_at_least_one: bool

    better_dimensions: list[str]
    equal_dimensions: list[str]
    worse_dimensions: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "comparison_number": self.comparison_number,
            "reference_index": self.reference_index,
            "reference_alternative": self.reference_alternative,
            "candidate_index": self.candidate_index,
            "candidate_alternative": self.candidate_alternative,
            "dominates": self.dominates,
            "better_or_equal_all": self.better_or_equal_all,
            "strictly_better_at_least_one": self.strictly_better_at_least_one,
            "better_dimensions": self.better_dimensions,
            "equal_dimensions": self.equal_dimensions,
            "worse_dimensions": self.worse_dimensions,
        }


@dataclass(frozen=True, slots=True)
class ComparisonStats:
    alternative_pair_comparisons: int
    dimension_comparisons_better_or_equal: int
    dimension_comparisons_strictly_better: int
    total_dimension_comparisons: int
    alternatives_evaluated: int

    def to_dict(self) -> dict[str, int]:
        return {
            "alternative_pair_comparisons": self.alternative_pair_comparisons,
            "dimension_comparisons_better_or_equal": (
                self.dimension_comparisons_better_or_equal
            ),
            "dimension_comparisons_strictly_better": (
                self.dimension_comparisons_strictly_better
            ),
            "total_dimension_comparisons": self.total_dimension_comparisons,
            "alternatives_evaluated": self.alternatives_evaluated,
        }


@dataclass(frozen=True, slots=True)
class ParetoResult:
    pareto_indices: list[int]
    pareto_alternatives: list[str]

    dominated_indices: list[int]
    dominated_alternatives: list[str]

    pareto_mask: npt.NDArray[np.bool_]
    dominated_mask: npt.NDArray[np.bool_]

    dominance_relations: list[DominanceRelation]

    comparison_stats: ComparisonStats
    comparison_trace: list[ComparisonRecord]

    transformed_matrix: npt.NDArray[np.float64]
    execution_time_seconds: float


def timed_method(
    method: Callable[..., ParetoResult],
) -> Callable[..., ParetoResult]:
    @wraps(method)
    def wrapper(self: "ParetoSolver", *args: Any, **kwargs: Any) -> ParetoResult:
        start = perf_counter()
        result = method(self, *args, **kwargs)
        end = perf_counter()

        return ParetoResult(
            pareto_indices=result.pareto_indices,
            pareto_alternatives=result.pareto_alternatives,
            dominated_indices=result.dominated_indices,
            dominated_alternatives=result.dominated_alternatives,
            pareto_mask=result.pareto_mask,
            dominated_mask=result.dominated_mask,
            dominance_relations=result.dominance_relations,
            comparison_stats=result.comparison_stats,
            comparison_trace=result.comparison_trace,
            transformed_matrix=result.transformed_matrix,
            execution_time_seconds=end - start,
        )

    return wrapper


class ParetoSolver:
    def __init__(
        self,
        matrix: Sequence[Sequence[float]] | npt.NDArray[np.float64],
        dimensions: Sequence[str],
        directions: Sequence[str | Direction],
        alternatives: Sequence[str],
        *,
        epsilon: float = DEFAULT_PARETO_EPSILON,
    ) -> None:
        self._raw_matrix = np.asarray(matrix, dtype=np.float64)
        self._dimensions = list(dimensions)
        self._directions = [self._parse_direction(direction) for direction in directions]
        self._alternatives = [str(alternative) for alternative in alternatives]
        self._epsilon = float(epsilon)

        self._validate_inputs()

        self._n_alternatives: int = self._raw_matrix.shape[0]
        self._n_dimensions: int = self._raw_matrix.shape[1]

        self._sign_vector = self._build_sign_vector()
        self._transformed_matrix = self._raw_matrix * self._sign_vector

    @property
    def matrix(self) -> npt.NDArray[np.float64]:
        return self._raw_matrix.copy()

    @property
    def transformed_matrix(self) -> npt.NDArray[np.float64]:
        return self._transformed_matrix.copy()

    @property
    def dimensions(self) -> list[str]:
        return self._dimensions.copy()

    @property
    def directions(self) -> list[Direction]:
        return self._directions.copy()

    @property
    def alternatives(self) -> list[str]:
        return self._alternatives.copy()

    @staticmethod
    def _parse_direction(direction: str | Direction) -> Direction:
        if isinstance(direction, Direction):
            return direction

        normalized = str(direction).strip().lower()

        aliases = {
            "min": Direction.MIN,
            "minimize": Direction.MIN,
            "minimizar": Direction.MIN,
            "minimum": Direction.MIN,
            "max": Direction.MAX,
            "maximize": Direction.MAX,
            "maximizar": Direction.MAX,
            "maximum": Direction.MAX,
        }

        if normalized not in aliases:
            raise ValueError(
                f"Invalid direction '{direction}'. "
                "Use 'min'/'max', 'minimizar'/'maximizar', or equivalent aliases."
            )

        return aliases[normalized]

    def _validate_inputs(self) -> None:
        if self._raw_matrix.ndim != 2:
            raise ValueError("matrix must be a two-dimensional array.")

        if self._raw_matrix.size == 0:
            raise ValueError("matrix cannot be empty.")

        if not np.all(np.isfinite(self._raw_matrix)):
            raise ValueError("matrix contains NaN or infinite values.")

        n_alternatives, n_dimensions = self._raw_matrix.shape

        if len(self._dimensions) != n_dimensions:
            raise ValueError(
                "The number of dimensions must match the number of matrix columns. "
                f"Expected {n_dimensions}, got {len(self._dimensions)}."
            )

        if len(self._directions) != n_dimensions:
            raise ValueError(
                "The number of directions must match the number of matrix columns. "
                f"Expected {n_dimensions}, got {len(self._directions)}."
            )

        if len(self._alternatives) != n_alternatives:
            raise ValueError(
                "The number of alternatives must match the number of matrix rows. "
                f"Expected {n_alternatives}, got {len(self._alternatives)}."
            )

        if len(set(self._dimensions)) != len(self._dimensions):
            raise ValueError("Dimension names must be unique.")

        if len(set(self._alternatives)) != len(self._alternatives):
            raise ValueError("Alternative identifiers must be unique.")

        if self._epsilon < 0:
            raise ValueError("epsilon must be greater than or equal to zero.")

    def _build_sign_vector(self) -> npt.NDArray[np.float64]:
        return np.array(
            [
                1.0 if direction == Direction.MAX else -1.0
                for direction in self._directions
            ],
            dtype=np.float64,
        )

    def _dominates_fast(
        self,
        *,
        candidate_index: int,
        reference_index: int,
    ) -> bool:
        candidate = self._transformed_matrix[candidate_index]
        reference = self._transformed_matrix[reference_index]

        better_or_equal_all = np.all(candidate >= reference - self._epsilon)
        strictly_better_one = np.any(candidate > reference + self._epsilon)

        return bool(better_or_equal_all and strictly_better_one)

    def _compare_pair_with_trace(
        self,
        *,
        candidate_index: int,
        reference_index: int,
        comparison_number: int,
    ) -> tuple[bool, ComparisonRecord]:
        candidate = self._transformed_matrix[candidate_index]
        reference = self._transformed_matrix[reference_index]

        better_or_equal_mask = candidate >= reference - self._epsilon
        strictly_better_mask = candidate > reference + self._epsilon
        worse_mask = candidate < reference - self._epsilon
        equal_mask = ~(strictly_better_mask | worse_mask)

        better_or_equal_all = bool(np.all(better_or_equal_mask))
        strictly_better_at_least_one = bool(np.any(strictly_better_mask))

        dominates = better_or_equal_all and strictly_better_at_least_one

        record = ComparisonRecord(
            comparison_number=comparison_number,
            reference_index=reference_index,
            reference_alternative=self._alternatives[reference_index],
            candidate_index=candidate_index,
            candidate_alternative=self._alternatives[candidate_index],
            dominates=dominates,
            better_or_equal_all=better_or_equal_all,
            strictly_better_at_least_one=strictly_better_at_least_one,
            better_dimensions=[
                self._dimensions[i]
                for i, is_better in enumerate(strictly_better_mask)
                if is_better
            ],
            equal_dimensions=[
                self._dimensions[i]
                for i, is_equal in enumerate(equal_mask)
                if is_equal
            ],
            worse_dimensions=[
                self._dimensions[i]
                for i, is_worse in enumerate(worse_mask)
                if is_worse
            ],
        )

        return dominates, record

    @timed_method
    def solve(
        self,
        *,
        collect_all_dominators: bool = False,
        trace: bool = False,
    ) -> ParetoResult:
        n = self._n_alternatives
        m = self._n_dimensions

        dominated_mask = np.zeros(n, dtype=np.bool_)
        dominance_relations: list[DominanceRelation] = []
        comparison_trace: list[ComparisonRecord] = []

        alternative_pair_comparisons = 0
        alternatives_evaluated = 0

        for reference_index in range(n):
            if dominated_mask[reference_index] and not collect_all_dominators:
                continue

            alternatives_evaluated += 1

            for candidate_index in range(n):
                if candidate_index == reference_index:
                    continue

                alternative_pair_comparisons += 1

                if trace:
                    dominates, record = self._compare_pair_with_trace(
                        candidate_index=candidate_index,
                        reference_index=reference_index,
                        comparison_number=alternative_pair_comparisons,
                    )
                    comparison_trace.append(record)
                else:
                    dominates = self._dominates_fast(
                        candidate_index=candidate_index,
                        reference_index=reference_index,
                    )

                if dominates:
                    dominated_mask[reference_index] = True

                    dominance_relations.append(
                        DominanceRelation(
                            dominated_index=reference_index,
                            dominated_alternative=self._alternatives[reference_index],
                            dominator_index=candidate_index,
                            dominator_alternative=self._alternatives[candidate_index],
                        )
                    )

                    if not collect_all_dominators:
                        break

        pareto_mask = ~dominated_mask

        pareto_indices = np.flatnonzero(pareto_mask).astype(int).tolist()
        dominated_indices = np.flatnonzero(dominated_mask).astype(int).tolist()

        pareto_alternatives = [
            self._alternatives[index]
            for index in pareto_indices
        ]

        dominated_alternatives = [
            self._alternatives[index]
            for index in dominated_indices
        ]

        dimension_comparisons_better_or_equal = alternative_pair_comparisons * m
        dimension_comparisons_strictly_better = alternative_pair_comparisons * m

        comparison_stats = ComparisonStats(
            alternative_pair_comparisons=alternative_pair_comparisons,
            dimension_comparisons_better_or_equal=dimension_comparisons_better_or_equal,
            dimension_comparisons_strictly_better=dimension_comparisons_strictly_better,
            total_dimension_comparisons=(
                dimension_comparisons_better_or_equal
                + dimension_comparisons_strictly_better
            ),
            alternatives_evaluated=alternatives_evaluated,
        )

        return ParetoResult(
            pareto_indices=pareto_indices,
            pareto_alternatives=pareto_alternatives,
            dominated_indices=dominated_indices,
            dominated_alternatives=dominated_alternatives,
            pareto_mask=pareto_mask,
            dominated_mask=dominated_mask,
            dominance_relations=dominance_relations,
            comparison_stats=comparison_stats,
            comparison_trace=comparison_trace,
            transformed_matrix=self._transformed_matrix.copy(),
            execution_time_seconds=0.0,
        )

    def solve_as_dict(
        self,
        *,
        collect_all_dominators: bool = False,
        trace: bool = False,
        include_transformed_matrix: bool = False,
        include_metadata: bool = True,
        max_dominance_relations: int | None = None,
        max_trace_records: int | None = None,
    ) -> dict[str, Any]:
        result = self.solve(
            collect_all_dominators=collect_all_dominators,
            trace=trace,
        )

        dominance_relations = result.dominance_relations
        comparison_trace = result.comparison_trace

        if max_dominance_relations is not None:
            dominance_relations = dominance_relations[:max_dominance_relations]

        if max_trace_records is not None:
            comparison_trace = comparison_trace[:max_trace_records]

        output: dict[str, Any] = {
            "pareto_indices": result.pareto_indices,
            "pareto_alternatives": result.pareto_alternatives,
            "dominated_indices": result.dominated_indices,
            "dominated_alternatives": result.dominated_alternatives,
            "pareto_mask": result.pareto_mask.tolist(),
            "dominated_mask": result.dominated_mask.tolist(),
            "dominance_relations": [
                relation.to_dict()
                for relation in dominance_relations
            ],
            "comparison_stats": result.comparison_stats.to_dict(),
            "comparison_trace": [
                record.to_dict()
                for record in comparison_trace
            ],
            "execution_time_seconds": result.execution_time_seconds,
        }

        if include_metadata:
            output["metadata"] = {
                "number_of_alternatives": self._n_alternatives,
                "number_of_dimensions": self._n_dimensions,
                "dimensions": self._dimensions,
                "directions": [direction.value for direction in self._directions],
                "epsilon": self._epsilon,
                "dominance_mode": (
                    "all_dominators"
                    if collect_all_dominators
                    else "first_dominator_only"
                ),
                "trace_enabled": trace,
                "maximum_possible_pair_comparisons": (
                    self._n_alternatives * (self._n_alternatives - 1)
                ),
                "comparison_counting_policy": (
                    "logical_dimension_evaluations_for_pareto_dominance"
                ),
            }

        if include_transformed_matrix:
            output["transformed_matrix"] = result.transformed_matrix.tolist()

        return output