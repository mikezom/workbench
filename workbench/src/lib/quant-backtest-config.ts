export type PositionControlMode =
  | "equal_weight"
  | "atr_inverse_volatility"
  | "atr_risk_budget";

export interface PositionControlConfig {
  mode: PositionControlMode;
  atr_period: number;
  risk_per_trade: number;
  stop_atr_multiple: number;
}

export interface TrailingStopConfig {
  enabled: boolean;
  atr_period: number;
  atr_multiple: number;
  slippage: number;
}

export interface QuantBacktestConfig {
  train_window_days: number;
  prediction_horizon_days: number;
  position_control: PositionControlConfig;
  trailing_stop: TrailingStopConfig;
}

export const DEFAULT_POSITION_CONTROL_CONFIG: PositionControlConfig = {
  mode: "equal_weight",
  atr_period: 14,
  risk_per_trade: 0.01,
  stop_atr_multiple: 2,
};

export const DEFAULT_TRAILING_STOP_CONFIG: TrailingStopConfig = {
  enabled: false,
  atr_period: 14,
  atr_multiple: 3,
  slippage: 0,
};

export const DEFAULT_QUANT_BACKTEST_CONFIG: QuantBacktestConfig = {
  train_window_days: 240,
  prediction_horizon_days: 20,
  position_control: DEFAULT_POSITION_CONTROL_CONFIG,
  trailing_stop: DEFAULT_TRAILING_STOP_CONFIG,
};

function asPositiveInteger(value: unknown, fallback: number, minimum = 1): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.round(value));
}

function asPositiveNumber(value: unknown, fallback: number, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, value);
}

export function normalizePositionControlConfig(value: unknown): PositionControlConfig {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const mode =
    input.mode === "atr_inverse_volatility" || input.mode === "atr_risk_budget"
      ? input.mode
      : "equal_weight";

  return {
    mode,
    atr_period: asPositiveInteger(input.atr_period, DEFAULT_POSITION_CONTROL_CONFIG.atr_period),
    risk_per_trade: asPositiveNumber(
      input.risk_per_trade,
      DEFAULT_POSITION_CONTROL_CONFIG.risk_per_trade,
    ),
    stop_atr_multiple: asPositiveNumber(
      input.stop_atr_multiple,
      DEFAULT_POSITION_CONTROL_CONFIG.stop_atr_multiple,
      0.1,
    ),
  };
}

export function normalizeTrailingStopConfig(value: unknown): TrailingStopConfig {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    enabled: Boolean(input.enabled),
    atr_period: asPositiveInteger(input.atr_period, DEFAULT_TRAILING_STOP_CONFIG.atr_period),
    atr_multiple: asPositiveNumber(
      input.atr_multiple,
      DEFAULT_TRAILING_STOP_CONFIG.atr_multiple,
      0.1,
    ),
    slippage: asPositiveNumber(input.slippage, DEFAULT_TRAILING_STOP_CONFIG.slippage),
  };
}

export function normalizeQuantBacktestConfig(value: unknown): QuantBacktestConfig {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    train_window_days: asPositiveInteger(
      input.train_window_days,
      DEFAULT_QUANT_BACKTEST_CONFIG.train_window_days,
      60,
    ),
    prediction_horizon_days: asPositiveInteger(
      input.prediction_horizon_days,
      DEFAULT_QUANT_BACKTEST_CONFIG.prediction_horizon_days,
    ),
    position_control: normalizePositionControlConfig(input.position_control),
    trailing_stop: normalizeTrailingStopConfig(input.trailing_stop),
  };
}

export function getPositionControlLabel(config: PositionControlConfig): string {
  switch (config.mode) {
    case "atr_inverse_volatility":
      return `ATR inverse-vol (${config.atr_period}d)`;
    case "atr_risk_budget":
      return `ATR risk budget (${(config.risk_per_trade * 100).toFixed(1)}% risk)`;
    default:
      return "Evenly distributed";
  }
}

export function getTrailingStopLabel(config: TrailingStopConfig): string {
  if (!config.enabled) return "Disabled";
  return `ATR trailing (${config.atr_period}d, ${config.atr_multiple.toFixed(1)}x, ${(config.slippage * 100).toFixed(2)}% slippage)`;
}
