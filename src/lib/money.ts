const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

export function formatMoney(minorUnits: number) {
  return currencyFormatter.format(minorUnits / 100);
}
