import { NAV } from '../nav.ts'
import { usePages } from '../hooks.ts'
import { href, type Route } from '../route.ts'
import { Account } from './Account.tsx'

/** Plain wiki-style sidebar: site name, navigation, pinned pages, account. */
export function SideNav({ route }: { route: Route }) {
  const { data: pages } = usePages()
  const pinned = (pages ?? []).filter((p) => p.pinned)
  const current = (active: boolean) => (active ? 'page' : undefined)

  return (
    <nav className="sidenav" aria-label="Main">
      <a className="site-name" href={href.tasks}>mymimo</a>
      <h3>Navigation</h3>
      <ul>
        {NAV.map((n) => (
          <li key={n.label}><a href={n.href} aria-current={current(n.active(route))}>{n.label}</a></li>
        ))}
      </ul>
      {pinned.length > 0 && (
        <>
          <h3>Pinned</h3>
          <ul>
            {pinned.map((p) => (
              <li key={p.id}>
                <a href={href.page(p.id)} aria-current={current(route.name === 'page' && route.id === p.id)}>{p.title}</a>
              </li>
            ))}
          </ul>
        </>
      )}
      <Account />
    </nav>
  )
}
