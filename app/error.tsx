'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-4 text-center">
      <p className="font-medium text-slate-900">Something went wrong.</p>
      <p className="text-sm text-slate-500">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
      >
        Try again
      </button>
    </div>
  )
}
