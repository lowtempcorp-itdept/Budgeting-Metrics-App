export function todayInManila(referenceDate: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the format Postgres
  // `date` columns and HTML `<input type="date">` both expect.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate)
}

export function currentMonthInManila(referenceDate: Date = new Date()): string {
  return `${todayInManila(referenceDate).slice(0, 7)}-01`
}
