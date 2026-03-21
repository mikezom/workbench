export interface FinalPortfolioTrade {
  id?: number;
  date: string;
  symbol: string;
  name: string;
  direction: string;
  quantity: number;
  price: number;
}

export interface FinalPortfolioHolding {
  symbol: string;
  name: string;
  finalQuantity: number;
  lastTradePrice: number;
  lastTradeDate: string;
  marketValue: number;
  weight: number;
}

export interface FinalPortfolioAllocationRow extends FinalPortfolioHolding {
  targetValue: number;
  targetQuantity: number;
  allocatedValue: number;
}

export interface FinalPortfolioAllocation {
  rows: FinalPortfolioAllocationRow[];
  totalMarketValue: number;
  totalTargetValue: number;
  totalAllocatedValue: number;
  residualCash: number;
}

export function deriveFinalPortfolioHoldings(trades: FinalPortfolioTrade[]): FinalPortfolioHolding[] {
  const bySymbol = new Map<string, Omit<FinalPortfolioHolding, "marketValue" | "weight">>();

  for (const trade of trades) {
    const current = bySymbol.get(trade.symbol) ?? {
      symbol: trade.symbol,
      name: trade.name,
      finalQuantity: 0,
      lastTradePrice: 0,
      lastTradeDate: trade.date,
    };

    current.finalQuantity += trade.direction === "buy" ? trade.quantity : -trade.quantity;
    current.lastTradePrice = trade.price;
    current.lastTradeDate = trade.date;
    if (!current.name && trade.name) current.name = trade.name;

    bySymbol.set(trade.symbol, current);
  }

  const rows = Array.from(bySymbol.values())
    .filter((holding) => holding.finalQuantity > 0)
    .map((holding) => ({
      ...holding,
      marketValue: holding.finalQuantity * holding.lastTradePrice,
      weight: 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue || a.symbol.localeCompare(b.symbol));

  const totalMarketValue = rows.reduce((sum, holding) => sum + holding.marketValue, 0);

  return rows.map((holding) => ({
    ...holding,
    weight: totalMarketValue > 0 ? holding.marketValue / totalMarketValue : 0,
  }));
}

export function allocateCapitalByFinalPortfolio(
  holdings: FinalPortfolioHolding[],
  capital: number
): FinalPortfolioAllocation {
  const normalizedCapital = Number.isFinite(capital) && capital > 0 ? capital : 0;
  const totalMarketValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);

  const rows = holdings.map((holding) => {
    const targetValue = normalizedCapital * holding.weight;
    const targetQuantity = holding.lastTradePrice > 0
      ? Math.floor(targetValue / holding.lastTradePrice)
      : 0;
    const allocatedValue = targetQuantity * holding.lastTradePrice;

    return {
      ...holding,
      targetValue,
      targetQuantity,
      allocatedValue,
    };
  });

  const totalTargetValue = rows.reduce((sum, row) => sum + row.targetValue, 0);
  const totalAllocatedValue = rows.reduce((sum, row) => sum + row.allocatedValue, 0);

  return {
    rows,
    totalMarketValue,
    totalTargetValue,
    totalAllocatedValue,
    residualCash: normalizedCapital - totalAllocatedValue,
  };
}
