import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Element } from 'hast'
import { usePageTitles } from '../hooks.ts'
import { href } from '../route.ts'
import { linkify, parseCsv } from '../wiki.ts'

interface Props {
  source: string
  /** When set, task-list checkboxes are clickable; called with the 1-based source line. */
  onToggleTask?: (line: number) => void
}

const ToggleContext = createContext<((line: number) => void) | undefined>(undefined)
const LineContext = createContext<number | undefined>(undefined)

/**
 * Renders markdown safely: raw HTML is never rendered, and react-markdown's URL
 * filter drops javascript: links. Adds [[wiki links]], ```csv tables, and
 * clickable checklists on top of GitHub-flavoured markdown.
 */
export function Markdown({ source, onToggleTask }: Props) {
  const titles = usePageTitles()
  const text = useMemo(() => linkify(source), [source])

  const components = useMemo<Components>(() => ({
    a({ href: url, children }) {
      if (url?.startsWith('#/wiki/')) {
        let title = url.slice('#/wiki/'.length)
        try { title = decodeURIComponent(title) } catch { /* keep raw */ }
        const id = titles.get(title.toLowerCase())
        return id
          ? <a className="wikilink" href={href.page(id)}>{children}</a>
          : <a className="wikilink missing" href={url} title={`“${title}” doesn't exist yet. Click to create it.`}>{children}</a>
      }
      const external = url && /^https?:/i.test(url)
      return <a href={url} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
    },
    img({ src, alt }) {
      if (typeof src !== 'string') return null
      return (
        <a className="md-image" href={src} target="_blank" rel="noopener noreferrer">
          <img src={src} alt={alt ?? ''} loading="lazy" />
        </a>
      )
    },
    pre({ node, children }) {
      const code = node?.children[0] as Element | undefined
      const classes = (code?.properties?.className as string[] | undefined) ?? []
      const lang = classes.find((c) => c.startsWith('language-'))?.slice('language-'.length)
      if (code && (lang === 'csv' || lang === 'tsv')) {
        const raw = code.children.map((c) => ('value' in c ? c.value : '')).join('')
        return <CsvTable text={raw} delimiter={lang === 'tsv' ? '\t' : ','} />
      }
      return <pre>{children}</pre>
    },
    li({ node, className, children }) {
      return (
        <LineContext.Provider value={node?.position?.start.line}>
          <li className={className}>{children}</li>
        </LineContext.Provider>
      )
    },
    input({ type, checked }) {
      if (type !== 'checkbox') return null
      return <TaskCheckbox checked={!!checked} />
    },
    table({ children }) {
      return <div className="table-wrap"><table>{children}</table></div>
    },
  }), [titles])

  return (
    <ToggleContext.Provider value={onToggleTask}>
      <div className="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>
      </div>
    </ToggleContext.Provider>
  )
}

function TaskCheckbox({ checked }: { checked: boolean }) {
  const toggle = useContext(ToggleContext)
  const line = useContext(LineContext)
  const enabled = !!toggle && line !== undefined
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={!enabled}
      onChange={() => enabled && toggle(line)}
      aria-label={checked ? 'Uncheck' : 'Check'}
    />
  )
}

function CsvTable({ text, delimiter }: { text: string; delimiter: string }) {
  const rows = useMemo(() => parseCsv(text, delimiter), [text, delimiter])
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null)
  if (rows.length === 0) return null
  const [header, ...body] = rows
  const width = Math.max(...rows.map((r) => r.length))
  const sorted = sort
    ? [...body].sort((a, b) => sort.dir * (a[sort.col] ?? '').localeCompare(b[sort.col] ?? '', undefined, { numeric: true, sensitivity: 'base' }))
    : body
  const clickSort = (col: number) =>
    setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }))

  const cells = (r: string[], render: (cell: string, i: number) => ReactNode) =>
    Array.from({ length: width }, (_, i) => render(r[i] ?? '', i))

  return (
    <div className="table-wrap">
      <table className="csv">
        <thead>
          <tr>
            {cells(header, (cell, i) => (
              <th key={i} aria-sort={sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                <button type="button" onClick={() => clickSort(i)} title="Sort">
                  {cell}
                  <span className="sort-mark">{sort?.col === i ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, ri) => <tr key={ri}>{cells(r, (cell, i) => <td key={i}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}
