import type { ReactNode } from 'react'

/** A titled block of a page: heading with a rule, optional count and action on the right. */
export function Section({ title, count, action, children }: {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>
          {title}
          {count ? <span className="count">{count}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
