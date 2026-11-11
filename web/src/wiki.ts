// Markdown helpers shared by the renderer and editor. Keep WIKI_LINK in sync with api/links.ts.

/** [[Title]] or [[Title|label]]; title can't start/end with whitespace (so `[[ -f x ]]` isn't a link). */
export const WIKI_LINK = /\[\[([^\s[\]|](?:[^[\]|\n]*[^\s[\]|])?)(?:\|([^[\]\n]+))?\]\]/g

const FENCE = /^\s*(```|~~~)/
/** A GFM task-list line: "- [ ] …", "* [x] …", "1. [ ] …" */
const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/

/** Maps each line outside fenced code blocks; line count never changes. */
function mapProseLines(md: string, fn: (line: string, index: number) => string): string {
  let fence: string | null = null
  return md
    .split('\n')
    .map((line, i) => {
      const m = FENCE.exec(line)
      if (m) {
        if (fence === null) fence = m[1]
        else if (m[1] === fence) fence = null
        return line
      }
      return fence === null ? fn(line, i) : line
    })
    .join('\n')
}

export const wikiHref = (title: string) =>
  `#/wiki/${encodeURIComponent(title).replace(/\(/g, '%28').replace(/\)/g, '%29')}`

/** Rewrites [[Title|label]] into ordinary markdown links to #/wiki/Title. */
export function linkify(md: string): string {
  return mapProseLines(md, (line) =>
    line.replace(WIKI_LINK, (_, title: string, label?: string) => `[${(label ?? title).trim()}](${wikiHref(title.trim())})`),
  )
}

/** "Follow [[Some guide]]" → "Follow Some guide" (for one-line previews). */
export function plainText(md: string): string {
  return md.replace(WIKI_LINK, (_, title: string, label?: string) => (label ?? title).trim())
}

/** Flips the checkbox on a 1-based source line. Returns null if that line isn't a task item. */
export function toggleTaskLine(md: string, line: number): string | null {
  const lines = md.split('\n')
  const m = TASK_LINE.exec(lines[line - 1] ?? '')
  if (!m) return null
  lines[line - 1] = lines[line - 1].replace(TASK_LINE, `${m[1]}[${m[2] === ' ' ? 'x' : ' '}]`)
  return lines.join('\n')
}

export function hasCheckedTasks(md: string | null): boolean {
  let found = false
  if (md) mapProseLines(md, (l) => { if (/^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/.test(l)) found = true; return l })
  return found
}

export function uncheckAll(md: string): string {
  return mapProseLines(md, (l) => l.replace(TASK_LINE, (_, prefix: string) => `${prefix}[ ]`))
}

// ---------------------------------------------------------------- CSV

/** RFC-4180-ish: quoted fields, "" escapes, newlines inside quotes. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

/** Spreadsheet copy (tab-separated, 2+ rows) → should become a csv block? */
export function looksTabular(text: string): boolean {
  const lines = text.replace(/\s+$/, '').split(/\r?\n/)
  return lines.length >= 2 && lines.filter((l) => l.includes('\t')).length >= Math.ceil(lines.length * 0.8)
}

export function tsvToCsvBlock(text: string): string {
  const csv = text
    .replace(/\s+$/, '')
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n')
  return `\n\`\`\`csv\n${csv}\n\`\`\`\n`
}
