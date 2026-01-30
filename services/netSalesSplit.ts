export type NetSalesSplit = {
  operation: number;
  general: number;
  foodCart: number;
  includeExp: boolean;
};

export type NetSalesSplitAmounts = {
  base: number;
  operation: number;
  general: number;
  foodCart: number;
};

export function calculateNetSalesSplitAmounts(
  totalSales: number,
  totalExpenses: number,
  split: NetSalesSplit
): NetSalesSplitAmounts {
  const netSales = totalSales - totalExpenses;
  const splitBase = split.includeExp ? netSales : totalSales;
  const effectiveBase = splitBase < 0 ? 0 : splitBase;

  return {
    base: effectiveBase,
    operation: (effectiveBase * split.operation) / 100,
    general: (effectiveBase * split.general) / 100,
    foodCart: (effectiveBase * split.foodCart) / 100,
  };
}
