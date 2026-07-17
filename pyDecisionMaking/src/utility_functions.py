import abc
import numpy as np
import matplotlib.pyplot as plt
from typing import Dict, Any, Union, Optional


class UtilityFunction(abc.ABC):
    """
    Abstract base class for all utility functions in the MCDM framework.
    """

    @abc.abstractmethod
    def evaluate(self, x: Any) -> float:
        """
        Evaluates the utility of a given attribute value.
        
        Args:
            x (Any): The attribute value to evaluate.
            
        Returns:
            float: The calculated utility, typically between 0.0 and 1.0.
        """
        pass

    @abc.abstractmethod
    def __str__(self) -> str:
        """Returns a string representation of the utility function."""
        pass

    @abc.abstractmethod
    def to_dict(self) -> Dict[str, Any]:
        """Serializes the utility function into a dictionary."""
        pass

    @abc.abstractmethod
    def plot(self, title: str = "Utility Function") -> None:
        """Generates a plot of the utility function."""
        pass

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UtilityFunction':
        """
        Factory method to reconstruct a UtilityFunction from a dictionary.
        """
        func_type = data.get("type")
        if func_type == "DiscreteUtilityFunction":
            return DiscreteUtilityFunction(data["mapping"])
            
        # Handle Continuous functions
        kwargs = {k: v for k, v in data.items() if k != "type"}
        
        # Dynamic instantiation based on class name
        target_class = globals().get(func_type)
        if not target_class or not issubclass(target_class, ContinuousUtilityFunction):
            raise ValueError(f"Unknown or invalid utility function type: {func_type}")
            
        return target_class(**kwargs)


class ContinuousUtilityFunction(UtilityFunction):
    """
    Base class for continuous utility functions.
    
    Attributes:
        threshold (float): The starting value (minimum boundary) of the attribute.
        goal (float): The target value (maximum boundary) of the attribute.
        threshold_utility (float): Utility assigned to the threshold value (default 0.0).
        goal_utility (float): Utility assigned to the goal value (default 1.0).
        is_increasing (bool): If True, utility increases from threshold to goal. 
                              If False, utility decreases.
    """

    def __init__(self, threshold: float, goal: float, 
                 threshold_utility: float = 0.0, goal_utility: float = 1.0, 
                 is_increasing: bool = True):
        if goal_utility <= threshold_utility:
            raise ValueError("goal_utility must be strictly greater than threshold_utility.")
        self.threshold = threshold
        self.goal = goal
        self.threshold_utility = threshold_utility
        self.goal_utility = goal_utility
        self.is_increasing = is_increasing

    def _get_normalized_x(self, x: float) -> float:
        """Maps the input x to a 0.0 - 1.0 range based on threshold and goal."""
        if self.goal == self.threshold:
            return 0.0
        
        # Calculate raw normalized position
        nx = (x - self.threshold) / (self.goal - self.threshold)
        
        # Clip strictly between 0 and 1 to prevent out-of-bounds utility
        return float(np.clip(nx, 0.0, 1.0))

    def _map_to_utility_range(self, base_u: float) -> float:
        """
        Maps a base mathematical utility (0 to 1) to the actual utility bounds 
        (threshold_utility to goal_utility) depending on the direction.
        """
        if not self.is_increasing:
            base_u = 1.0 - base_u
            
        return self.threshold_utility + base_u * (self.goal_utility - self.threshold_utility)

    def __str__(self) -> str:
        direction = "Increasing" if self.is_increasing else "Decreasing"
        return f"{self.__class__.__name__}({direction}, threshold={self.threshold} (u={self.threshold_utility}), goal={self.goal} (u={self.goal_utility}))"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.__class__.__name__,
            "threshold": self.threshold,
            "goal": self.goal,
            "threshold_utility": self.threshold_utility,
            "goal_utility": self.goal_utility,
            "is_increasing": self.is_increasing
        }

    def plot(self, title: Optional[str] = None, num_points: int = 100) -> None:
        x_values = np.linspace(self.threshold, self.goal, num_points)
        y_values = [self.evaluate(x) for x in x_values]
        
        if title is None:
            title = f"{self.__class__.__name__} ({'Increasing' if self.is_increasing else 'Decreasing'})"
            
        plt.figure(figsize=(8, 5))
        plt.plot(x_values, y_values, label="Utility", color="blue", linewidth=2)
        plt.axhline(self.threshold_utility, color="gray", linestyle="--", alpha=0.5)
        plt.axhline(self.goal_utility, color="gray", linestyle="--", alpha=0.5)
        plt.title(title)
        plt.xlabel("Attribute Value")
        plt.ylabel("Utility")
        plt.grid(True, linestyle=":", alpha=0.7)
        plt.legend()
        plt.show()


class LinearUtilityFunction(ContinuousUtilityFunction):
    """Lineal entre umbral y meta.

  Familias UI: Razón relativa, Min-max, Umbral creciente, Razón inversa,
  Min-max decreciente, Umbral decreciente; también fallback de varias pendientes.
  u(x) = n(x) o 1−n(x) con n(x) = clip((x−L)/(U−L), 0, 1).
    """
    
    def evaluate(self, x: float) -> float:
        nx = self._get_normalized_x(x)
        return self._map_to_utility_range(nx)


class ExponentialUtilityFunction(ContinuousUtilityFunction):
    """Exponencial normalizada.

  Familias UI: Exponencial creciente, Exponencial decreciente.
  u(x) = (e^(k·n) − 1) / (e^k − 1), n = posición normalizada, k = shape_parameter.
    """
    
    def __init__(self, threshold: float, goal: float, 
                 threshold_utility: float = 0.0, goal_utility: float = 1.0, 
                 is_increasing: bool = True, shape_parameter: float = 2.0):
        super().__init__(threshold, goal, threshold_utility, goal_utility, is_increasing)
        self.shape_parameter = shape_parameter

    def evaluate(self, x: float) -> float:
        nx = self._get_normalized_x(x)
        alpha = self.shape_parameter
        
        # Exponential formula normalized to exactly [0, 1] bounds
        base_u = (np.exp(alpha * nx) - 1.0) / (np.exp(alpha) - 1.0)
        return self._map_to_utility_range(base_u)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d["shape_parameter"] = self.shape_parameter
        return d


class LogarithmicUtilityFunction(ContinuousUtilityFunction):
    """Logarítmica saturada.

  Familias UI: Meta saturada, Función saturada.
  u(x) = log(1 + k·n) / log(1 + k).
    """
    
    def __init__(self, threshold: float, goal: float, 
                 threshold_utility: float = 0.0, goal_utility: float = 1.0, 
                 is_increasing: bool = True, shape_parameter: float = 10.0):
        super().__init__(threshold, goal, threshold_utility, goal_utility, is_increasing)
        self.shape_parameter = shape_parameter

    def evaluate(self, x: float) -> float:
        nx = self._get_normalized_x(x)
        alpha = self.shape_parameter
        
        # Logarithmic formula normalized to exactly [0, 1] bounds
        base_u = np.log(1.0 + alpha * nx) / np.log(1.0 + alpha)
        return self._map_to_utility_range(base_u)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d["shape_parameter"] = self.shape_parameter
        return d


class SigmoidalUtilityFunction(ContinuousUtilityFunction):
    """Sigmoide (logística).

  Familia UI: Logística decreciente.
  Curva en S con shape_parameter (k) y midpoint (inflexión en espacio normalizado).
    """
    
    def __init__(self, threshold: float, goal: float, 
                 threshold_utility: float = 0.0, goal_utility: float = 1.0, 
                 is_increasing: bool = True, shape_parameter: float = 10.0,
                 midpoint: float = 0.5):
        super().__init__(threshold, goal, threshold_utility, goal_utility, is_increasing)
        self.shape_parameter = shape_parameter
        self.midpoint = midpoint  # Midpoint in the normalized [0, 1] space

    def evaluate(self, x: float) -> float:
        nx = self._get_normalized_x(x)
        k = self.shape_parameter
        m = self.midpoint
        
        # Un-normalized logistic function
        def raw_logistic(val: float) -> float:
            return 1.0 / (1.0 + np.exp(-k * (val - m)))
            
        # Adjust boundaries so f(0)=0 and f(1)=1 exactly
        lower_bound = raw_logistic(0.0)
        upper_bound = raw_logistic(1.0)
        
        base_u = (raw_logistic(nx) - lower_bound) / (upper_bound - lower_bound)
        return self._map_to_utility_range(base_u)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d["shape_parameter"] = self.shape_parameter
        d["midpoint"] = self.midpoint
        return d


class RatioUtilityFunction(ContinuousUtilityFunction):
    """Normalización por razón (ratio), distinta de min–max.

  Familias UI: Razón relativa (creciente), Razón inversa (decreciente).
  - Creciente (beneficio): u(x) = clip(x / U, 0, 1) — razón respecto a la referencia U.
  - Decreciente (costo): u(x) = clip(L / x, 0, 1) — razón inversa respecto a L.
  A diferencia de min–max, no resta el límite inferior: preserva proporciones.
    """

    def _base_utility(self, x: float) -> float:
        if self.is_increasing:
            if self.goal == 0:
                return 0.0
            return float(np.clip(x / self.goal, 0.0, 1.0))
        # Decreciente (costo): menor x → mayor utilidad.
        if x is None:
            return 0.0
        if x <= 0:
            return 1.0
        if self.threshold <= 0:
            return 0.0
        return float(np.clip(self.threshold / x, 0.0, 1.0))

    def evaluate(self, x: float) -> float:
        base_u = self._base_utility(x)
        # base_u ya está orientado según el sentido; mapear sin invertir.
        return self.threshold_utility + base_u * (self.goal_utility - self.threshold_utility)


class TriangularUtilityFunction(ContinuousUtilityFunction):
    """Utilidad triangular con óptimo en un punto interior.

  Familia UI: Triangular (existe un intervalo/punto óptimo).
  u=0 en L y U; u=1 en el pico M; rampas lineales a cada lado.
    """

    def __init__(self, threshold: float, goal: float,
                 threshold_utility: float = 0.0, goal_utility: float = 1.0,
                 is_increasing: bool = True, peak: float = None):
        super().__init__(threshold, goal, threshold_utility, goal_utility, is_increasing)
        self.peak = peak if peak is not None else (threshold + goal) / 2.0

    def evaluate(self, x: float) -> float:
        L, U, M = self.threshold, self.goal, self.peak
        if U <= L or x <= L or x >= U:
            base_u = 0.0
        elif x <= M:
            base_u = (x - L) / (M - L) if M > L else 1.0
        else:
            base_u = (U - x) / (U - M) if U > M else 1.0
        base_u = float(np.clip(base_u, 0.0, 1.0))
        return self.threshold_utility + base_u * (self.goal_utility - self.threshold_utility)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d["peak"] = self.peak
        return d


class TrapezoidalUtilityFunction(ContinuousUtilityFunction):
    """Utilidad trapezoidal con meseta óptima.

  Familia UI: Trapezoidal (existe un intervalo óptimo).
  u=0 en L y U; sube a 1 en M1; meseta u=1 en [M1, M2]; baja a 0 en U.
    """

    def __init__(self, threshold: float, goal: float,
                 threshold_utility: float = 0.0, goal_utility: float = 1.0,
                 is_increasing: bool = True, plateau_start: float = None,
                 plateau_end: float = None):
        super().__init__(threshold, goal, threshold_utility, goal_utility, is_increasing)
        span = (goal - threshold) or 1.0
        self.plateau_start = plateau_start if plateau_start is not None else threshold + span / 3.0
        self.plateau_end = plateau_end if plateau_end is not None else threshold + 2.0 * span / 3.0

    def evaluate(self, x: float) -> float:
        L, U = self.threshold, self.goal
        M1, M2 = self.plateau_start, self.plateau_end
        if U <= L or x <= L or x >= U:
            base_u = 0.0
        elif x < M1:
            base_u = (x - L) / (M1 - L) if M1 > L else 1.0
        elif x <= M2:
            base_u = 1.0
        else:
            base_u = (U - x) / (U - M2) if U > M2 else 1.0
        base_u = float(np.clip(base_u, 0.0, 1.0))
        return self.threshold_utility + base_u * (self.goal_utility - self.threshold_utility)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d["plateau_start"] = self.plateau_start
        d["plateau_end"] = self.plateau_end
        return d


class DistanceUtilityFunction(ContinuousUtilityFunction):
    """Utilidad por cercanía a un valor objetivo/ideal.

  Familias UI: Distancia a meta (T, R), Distancia al ideal (I, dmax).
  u(x) = clip(1 − |x − T| / R, 0, 1): máxima en el objetivo, decrece con la distancia.
    """

    def __init__(self, threshold: float, goal: float,
                 threshold_utility: float = 0.0, goal_utility: float = 1.0,
                 is_increasing: bool = True, target: float = None,
                 radius: float = 1.0):
        super().__init__(threshold, goal, threshold_utility, goal_utility, is_increasing)
        self.target = target if target is not None else (threshold + goal) / 2.0
        self.radius = radius if radius else 1.0

    def evaluate(self, x: float) -> float:
        r = self.radius if self.radius else 1.0
        base_u = 1.0 - abs(x - self.target) / r
        base_u = float(np.clip(base_u, 0.0, 1.0))
        return self.threshold_utility + base_u * (self.goal_utility - self.threshold_utility)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d["target"] = self.target
        d["radius"] = self.radius
        return d


class VetoUtilityFunction(ContinuousUtilityFunction):
    """Utilidad decreciente con veto duro.

  Familia UI: Umbral de veto (menos es mejor con penalización).
  u=1 en L y decrece linealmente hasta 0 en V; u=0 para x ≥ V (veto absoluto).
    """

    def __init__(self, threshold: float, goal: float,
                 threshold_utility: float = 0.0, goal_utility: float = 1.0,
                 is_increasing: bool = False, veto: float = None):
        super().__init__(threshold, goal, threshold_utility, goal_utility, is_increasing)
        self.veto = veto if veto is not None else goal

    def evaluate(self, x: float) -> float:
        L, V = self.threshold, self.veto
        if x >= V:
            base_u = 0.0
        elif V > L:
            base_u = float(np.clip(1.0 - (x - L) / (V - L), 0.0, 1.0))
        else:
            base_u = 1.0 if x <= L else 0.0
        return self.threshold_utility + base_u * (self.goal_utility - self.threshold_utility)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d["veto"] = self.veto
        return d


class DiscreteUtilityFunction(UtilityFunction):
    """Utilidad por categoría.

  Familias UI: Escalas discretas, Tablas de equivalencia (cuando se implemente).
  u(x) = mapping[x].
    """

    def __init__(self, mapping: Dict[str, float]):
        self.mapping = mapping

    def evaluate(self, x: Union[str, int, float]) -> float:
        """
        Evaluates the utility based on the exact match in the mapping dictionary.
        If the value is not found, returns 0.0 by default.
        """
        return self.mapping.get(x, 0.0)

    def __str__(self) -> str:
        return f"DiscreteUtilityFunction(mapping={self.mapping})"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.__class__.__name__,
            "mapping": self.mapping
        }

    def plot(self, title: str = "Discrete Utility Function") -> None:
        categories = list(self.mapping.keys())
        utilities = list(self.mapping.values())
        
        plt.figure(figsize=(8, 5))
        # Convert non-string keys to strings for plotting
        category_labels = [str(cat) for cat in categories]
        
        plt.bar(category_labels, utilities, color='skyblue', edgecolor='black')
        
        # Add text labels on top of bars
        for i, v in enumerate(utilities):
            plt.text(i, v + 0.02, f"{v:.2f}", ha='center', fontweight='bold')
            
        plt.title(title)
        plt.xlabel("Categories")
        plt.ylabel("Utility")
        
        # Set limit slightly higher than max utility for text clarity
        max_val = max(utilities) if utilities else 1.0
        plt.ylim(0, max_val + (0.1 * max_val))
        
        plt.grid(axis='y', linestyle='--', alpha=0.7)
        plt.show()