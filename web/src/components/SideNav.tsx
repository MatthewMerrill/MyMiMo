import { NAV } from '../nav.ts'
import { href, type Route } from '../route.ts'
import { Account } from './Account.tsx'

/** Plain wiki-style sidebar: site name, navigation links, account. */
export function SideNav({ route }: { route: Route }) {
  return (
    <nav className="sidenav" aria-label="Main">
      <a className="site-name" href={href.tasks}>mymimo</a>
      <h3>Navigation</h3>
      <ul>
        {NAV.map((n) => (
          <li key={n.label}>
            <a href={n.href} aria-current={n.active(route) ? 'page' : undefined}>{n.label}</a>
          </li>
        ))}
      </ul>
      <Account />
    </nav>
  )
}
