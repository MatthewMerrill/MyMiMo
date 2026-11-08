export const nowSec = () => Math.floor(Date.now() / 1000)

const pad = (n: number) => String(n).padStart(2, '0')
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** unix seconds → "YYYY-MM-DD" (local) for <input type="date"> */
export function toDateInput(sec: number | null): string {
  if (!sec) return ''
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "YYYY-MM-DD" → unix seconds at local noon (avoids DST/TZ edge flips) */
export function fromDateInput(s: string): number | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000)
}

/** Whole calendar days from today (negative = past). */
export function daysFromToday(sec: number): number {
  return Math.round((startOfDay(new Date(sec * 1000)) - startOfDay(new Date())) / 86400000)
}

export function dueLabel(due: number): { text: string; tone: 'overdue' | 'soon' | 'later' } {
  const days = daysFromToday(due)
  if (days < 0) return { text: `${-days}d overdue`, tone: 'overdue' }
  if (days === 0) return { text: 'today', tone: 'soon' }
  if (days === 1) return { text: 'tomorrow', tone: 'soon' }
  const text = days < 14 ? `in ${days}d` : new Date(due * 1000).toLocaleDateString()
  return { text, tone: days <= 7 ? 'soon' : 'later' }
}

export function shortDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
