export function Masthead({ displayName, today, dayOfMonth, daysInMonth }: {
  displayName: string
  today: string
  dayOfMonth: number
  daysInMonth: number
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b-2 border-white/35 pb-3">
      <div>
        <p className="font-ledger-sans text-[11px] uppercase tracking-[0.12em] text-[#c3c9dd]">{displayName}</p>
        <h1 className="font-ledger-serif mt-1 text-[25px] font-semibold text-[#f9f6ee]">This month, at a glance</h1>
      </div>
      <p className="font-ledger-mono text-right text-[11px] text-[#b9bdcb]">
        {today}
        <br />
        Day {dayOfMonth} of {daysInMonth}
      </p>
    </div>
  )
}
