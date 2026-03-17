"use client";

import { useState } from "react";
import FactorPicker from "./factor-picker";

interface StrategyFormProps {
  initial?: {
    id?: number;
    name: string;
    description: string;
    factors: string[];
    model_type: string;
    hyperparams: Record<string, unknown>;
    universe: string;
  };
  onSubmit: (data: {
    name: string;
    description: string;
    factors: string[];
    model_type: string;
    hyperparams: Record<string, unknown>;
    universe: string;
  }) => void;
  onCancel: () => void;
}

const MODEL_TYPES = [
  { value: "linear_regression", label: "Linear Regression" },
  { value: "ridge", label: "Ridge Regression" },
  { value: "lasso", label: "Lasso Regression" },
  { value: "random_forest", label: "Random Forest" },
  { value: "xgboost", label: "XGBoost" },
];

const UNIVERSES = [
  { value: "HS300", label: "CSI 300 (HS300)" },
  { value: "ZZ500", label: "CSI 500 (ZZ500)" },
  { value: "ZZ1000", label: "CSI 1000 (ZZ1000)" },
];

export default function StrategyForm({ initial, onSubmit, onCancel }: StrategyFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [factors, setFactors] = useState<string[]>(initial?.factors ?? []);
  const [modelType, setModelType] = useState(initial?.model_type ?? "linear_regression");
  const [universe, setUniverse] = useState(initial?.universe ?? "HS300");

  // Hyperparams
  const [nEstimators, setNEstimators] = useState(
    String((initial?.hyperparams?.n_estimators as number) ?? 100)
  );
  const [maxDepth, setMaxDepth] = useState(
    String((initial?.hyperparams?.max_depth as number) ?? 5)
  );
  const [alpha, setAlpha] = useState(
    String((initial?.hyperparams?.alpha as number) ?? 1.0)
  );
  const [learningRate, setLearningRate] = useState(
    String((initial?.hyperparams?.learning_rate as number) ?? 0.1)
  );

  const buildHyperparams = (): Record<string, unknown> => {
    switch (modelType) {
      case "ridge":
      case "lasso":
        return { alpha: parseFloat(alpha) };
      case "random_forest":
        return { n_estimators: parseInt(nEstimators), max_depth: parseInt(maxDepth) };
      case "xgboost":
        return {
          n_estimators: parseInt(nEstimators),
          max_depth: parseInt(maxDepth),
          learning_rate: parseFloat(learningRate),
        };
      default:
        return {};
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || factors.length === 0) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      factors,
      model_type: modelType,
      hyperparams: buildHyperparams(),
      universe,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          placeholder="My Strategy"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          rows={2}
          placeholder="Optional description..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Model Type</label>
          <select
            value={modelType}
            onChange={(e) => setModelType(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          >
            {MODEL_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Universe</label>
          <select
            value={universe}
            onChange={(e) => setUniverse(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          >
            {UNIVERSES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Conditional hyperparameter fields */}
      {(modelType === "ridge" || modelType === "lasso") && (
        <div>
          <label className="block text-sm font-medium mb-1">Alpha (regularization)</label>
          <input
            type="number"
            step="0.01"
            value={alpha}
            onChange={(e) => setAlpha(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
      )}

      {(modelType === "random_forest" || modelType === "xgboost") && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">N Estimators</label>
            <input
              type="number"
              value={nEstimators}
              onChange={(e) => setNEstimators(e.target.value)}
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Depth</label>
            <input
              type="number"
              value={maxDepth}
              onChange={(e) => setMaxDepth(e.target.value)}
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
            />
          </div>
        </div>
      )}

      {modelType === "xgboost" && (
        <div>
          <label className="block text-sm font-medium mb-1">Learning Rate</label>
          <input
            type="number"
            step="0.01"
            value={learningRate}
            onChange={(e) => setLearningRate(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
      )}

      <FactorPicker selected={factors} onChange={setFactors} />

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || factors.length === 0}
          className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
        >
          {initial?.id ? "Update" : "Create"} Strategy
        </button>
      </div>
    </form>
  );
}
