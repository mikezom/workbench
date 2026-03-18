"use client";

interface Strategy {
  id: number;
  name: string;
  description: string | null;
  factors: string[];
  model_type: string;
  hyperparams: Record<string, unknown>;
  universe: string;
  status: string;
  created_at: string;
}

interface StrategyListProps {
  strategies: Strategy[];
  onEdit: (strategy: Strategy) => void;
  onDelete: (id: number) => void;
  onRunBacktest: (id: number) => void;
}

const MODEL_LABELS: Record<string, string> = {
  linear_regression: "Linear",
  ridge: "Ridge",
  lasso: "Lasso",
  random_forest: "RF",
  xgboost: "XGBoost",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300",
  ready: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  backtesting: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  completed: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
};

export default function StrategyList({ strategies, onEdit, onDelete, onRunBacktest }: StrategyListProps) {
  if (strategies.length === 0) {
    return (
      <div className="text-neutral-400 dark:text-neutral-500 text-center py-12 text-sm">
        No strategies yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
            <th className="py-2 px-3 font-medium">Name</th>
            <th className="py-2 px-3 font-medium">Model</th>
            <th className="py-2 px-3 font-medium">Universe</th>
            <th className="py-2 px-3 font-medium">Factors</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium">Created</th>
            <th className="py-2 px-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {strategies.map((s) => (
            <tr
              key={s.id}
              className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <td className="py-2 px-3 font-medium">{s.name}</td>
              <td className="py-2 px-3">{MODEL_LABELS[s.model_type] ?? s.model_type}</td>
              <td className="py-2 px-3">{s.universe}</td>
              <td className="py-2 px-3">{s.factors.length}</td>
              <td className="py-2 px-3">
                <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[s.status] ?? ""}`}>
                  {s.status}
                </span>
              </td>
              <td className="py-2 px-3 text-neutral-500">
                {new Date(s.created_at).toLocaleDateString()}
              </td>
              <td className="py-2 px-3">
                <div className="flex gap-1">
                  <button
                    onClick={() => onEdit(s)}
                    className="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onRunBacktest(s.id)}
                    className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Backtest
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
