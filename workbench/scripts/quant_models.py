"""Model wrappers with uniform interface for quant backtesting."""

import numpy as np
from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.ensemble import RandomForestRegressor


class QuantModel:
    """Base model with uniform interface."""

    def __init__(self, model_type: str, hyperparams: dict | None = None):
        self.model_type = model_type
        self.hyperparams = hyperparams or {}
        self.model = self._create_model()
        self._feature_names: list[str] = []

    def _create_model(self):
        if self.model_type == "linear_regression":
            return LinearRegression()
        elif self.model_type == "ridge":
            return Ridge(alpha=self.hyperparams.get("alpha", 1.0))
        elif self.model_type == "lasso":
            return Lasso(alpha=self.hyperparams.get("alpha", 1.0))
        elif self.model_type == "random_forest":
            return RandomForestRegressor(
                n_estimators=self.hyperparams.get("n_estimators", 100),
                max_depth=self.hyperparams.get("max_depth", 5),
                random_state=42,
                n_jobs=-1,
            )
        elif self.model_type == "xgboost":
            try:
                from xgboost import XGBRegressor
                return XGBRegressor(
                    n_estimators=self.hyperparams.get("n_estimators", 100),
                    max_depth=self.hyperparams.get("max_depth", 5),
                    learning_rate=self.hyperparams.get("learning_rate", 0.1),
                    random_state=42,
                    n_jobs=-1,
                    verbosity=0,
                )
            except ImportError:
                print("Warning: xgboost not installed, falling back to RandomForest")
                return RandomForestRegressor(
                    n_estimators=self.hyperparams.get("n_estimators", 100),
                    max_depth=self.hyperparams.get("max_depth", 5),
                    random_state=42,
                )
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")

    def fit(self, X: np.ndarray, y: np.ndarray, feature_names: list[str] | None = None):
        self._feature_names = feature_names or [f"f{i}" for i in range(X.shape[1])]
        self.model.fit(X, y)

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(X)

    def feature_importance(self) -> dict[str, float]:
        """Return feature importance/coefficients as a dict."""
        if hasattr(self.model, "feature_importances_"):
            importances = self.model.feature_importances_
        elif hasattr(self.model, "coef_"):
            importances = np.abs(self.model.coef_)
        else:
            return {}

        return {
            name: float(imp)
            for name, imp in zip(self._feature_names, importances)
        }
