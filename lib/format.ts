export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}₱${formatted}`
}
