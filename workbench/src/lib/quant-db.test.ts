import { describe, expect, it } from "vitest";
import { listFactors } from "./quant-db";

describe("quant factor registry", () => {
  it("seeds the expanded cached factor set", () => {
    const factors = listFactors();
    const ids = factors.map((factor) => factor.id);

    expect(factors).toHaveLength(71);
    expect(ids).toEqual(
      expect.arrayContaining([
        "earnings_yield_ttm",
        "sales_yield_ttm",
        "dividend_yield_ttm",
        "free_float_turnover",
        "market_volume_ratio",
        "float_market_cap",
        "free_float_ratio",
        "circulating_cap_ratio",
        "grossprofit_margin",
        "netprofit_margin",
        "current_ratio",
        "quick_ratio",
        "operating_revenue_yoy",
        "limit_up_gap",
        "limit_down_gap",
        "limit_hit_20d",
        "beta_60d",
        "residual_vol_60d",
        "relative_strength_vs_benchmark",
        "listing_age",
        "net_mf_amount_ratio",
        "large_order_net_ratio",
        "extra_large_order_imbalance",
        "margin_balance_to_float_mv",
        "financing_buy_shock",
        "short_pressure",
      ])
    );

    expect(listFactors("price")).toHaveLength(25);
    expect(listFactors("volume")).toHaveLength(14);
    expect(listFactors("fundamental")).toHaveLength(22);
    expect(listFactors("technical")).toHaveLength(10);
  });
});
