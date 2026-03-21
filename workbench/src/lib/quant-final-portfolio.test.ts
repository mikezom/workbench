import { describe, expect, it } from "vitest";
import {
  allocateCapitalByFinalPortfolio,
  deriveFinalPortfolioHoldings,
} from "./quant-final-portfolio";

describe("quant final portfolio helpers", () => {
  it("derives end-of-run holdings and weights from the trade log", () => {
    const holdings = deriveFinalPortfolioHoldings([
      { id: 1, date: "2024-01-02", symbol: "600000.SH", name: "PF Bank", direction: "buy", quantity: 100, price: 10 },
      { id: 2, date: "2024-01-03", symbol: "000001.SZ", name: "SZ Corp", direction: "buy", quantity: 200, price: 20 },
      { id: 3, date: "2024-01-04", symbol: "600000.SH", name: "PF Bank", direction: "sell", quantity: 40, price: 11 },
      { id: 4, date: "2024-01-05", symbol: "000001.SZ", name: "SZ Corp", direction: "sell", quantity: 50, price: 18 },
      { id: 5, date: "2024-01-06", symbol: "600010.SH", name: "Steel Co", direction: "buy", quantity: 300, price: 5 },
      { id: 6, date: "2024-01-07", symbol: "600010.SH", name: "Steel Co", direction: "sell", quantity: 300, price: 5.2 },
    ]);

    expect(holdings).toEqual([
      expect.objectContaining({
        symbol: "000001.SZ",
        finalQuantity: 150,
        lastTradePrice: 18,
        marketValue: 2700,
        weight: 2700 / 3360,
      }),
      expect.objectContaining({
        symbol: "600000.SH",
        finalQuantity: 60,
        lastTradePrice: 11,
        marketValue: 660,
        weight: 660 / 3360,
      }),
    ]);
  });

  it("allocates capital proportionally and rounds target quantities down to whole shares", () => {
    const holdings = deriveFinalPortfolioHoldings([
      { date: "2024-01-02", symbol: "600000.SH", name: "PF Bank", direction: "buy", quantity: 100, price: 10 },
      { date: "2024-01-03", symbol: "000001.SZ", name: "SZ Corp", direction: "buy", quantity: 100, price: 20 },
    ]);

    const allocation = allocateCapitalByFinalPortfolio(holdings, 1000);

    expect(allocation.rows).toEqual([
      expect.objectContaining({
        symbol: "000001.SZ",
        targetValue: expect.closeTo(666.6667, 4),
        targetQuantity: 33,
        allocatedValue: 660,
      }),
      expect.objectContaining({
        symbol: "600000.SH",
        targetValue: expect.closeTo(333.3333, 4),
        targetQuantity: 33,
        allocatedValue: 330,
      }),
    ]);
    expect(allocation.totalAllocatedValue).toBe(990);
    expect(allocation.residualCash).toBe(10);
  });
});
