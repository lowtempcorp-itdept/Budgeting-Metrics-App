export type AmountRow = { accountId: string; amount: number }

export function computeAccountBalances(
  accountIds: string[],
  income: AmountRow[],
  expenses: AmountRow[]
): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const id of accountIds) balances[id] = 0
  for (const row of income) {
    balances[row.accountId] = (balances[row.accountId] ?? 0) + row.amount
  }
  for (const row of expenses) {
    balances[row.accountId] = (balances[row.accountId] ?? 0) - row.amount
  }
  return balances
}

export type DatedAccountUse = { accountId: string; createdAt: string }

export function mostRecentAccountId(uses: DatedAccountUse[]): string | null {
  if (uses.length === 0) return null
  // ISO 8601 timestamp strings sort lexicographically in chronological order.
  return uses.reduce((latest, current) => (current.createdAt > latest.createdAt ? current : latest))
    .accountId
}

export function rankCategoriesByUsage(categoryIds: string[]): string[] {
  const counts = new Map<string, number>()
  const order: string[] = []
  for (const id of categoryIds) {
    if (!counts.has(id)) {
      counts.set(id, 0)
      order.push(id)
    }
    counts.set(id, counts.get(id)! + 1)
  }
  // Array.prototype.sort is a stable sort (guaranteed since ES2019), so
  // equal-count ties keep their original first-appearance order.
  return order.sort((a, b) => counts.get(b)! - counts.get(a)!)
}
