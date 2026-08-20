import { formatWeekRange } from '@/lib/weekly-budget'

export function ReminderBanner({ nextWeekStart }: { nextWeekStart: string }) {
  return (
    <a
      href={`/budget?week=${nextWeekStart}`}
      className="block rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
    >
      Set your budget for the week of {formatWeekRange(nextWeekStart)} →
    </a>
  )
}
