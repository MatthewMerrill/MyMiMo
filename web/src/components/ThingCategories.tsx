import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { api, type Thing } from '../api.ts'
import { useCategories, useMutate } from '../hooks.ts'
import { href } from '../route.ts'

/** Category chips on a thing page; type a name to add (new names create the category). */
export function ThingCategories({ thing }: { thing: Thing }) {
  const listId = useId()
  const { data } = useCategories()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [active, setActive] = useState(-1)
  const add = useMutate((n: string) => api.addThingCategory(thing.id, n))
  const remove = useMutate((categoryId: number) => api.removeThingCategory(thing.id, categoryId))
  const error = add.error ?? remove.error

  const have = new Set(thing.categories.map((c) => c.id))
  const query = name.trim().toLowerCase()
  const suggestions = query
    ? (data?.categories ?? []).filter((c) => !have.has(c.id) && c.name.toLowerCase().includes(query)).slice(0, 6)
    : []

  function choose(n: string) {
    const value = n.trim()
    if (!value) return
    setName('')
    setActive(-1)
    add.mutate(value)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    choose(active >= 0 && suggestions[active] ? suggestions[active].name : name)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Escape') {
      setName('')
      setAdding(false)
    }
  }

  return (
    <div className="thing-categories">
      {thing.categories.map((c) => (
        <span key={c.id} className="tag removable">
          <a className="link" href={href.category(c.id)}>{c.name}</a>
          <button aria-label={`Remove from ${c.name}`} onClick={() => remove.mutate(c.id)}>×</button>
        </span>
      ))}
      {adding ? (
        <form onSubmit={submit} className="tag-form">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setActive(-1) }}
            onKeyDown={onKeyDown}
            onBlur={() => { if (!name.trim()) setAdding(false) }}
            placeholder="Category…"
            aria-label="Add category"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            enterKeyHint="done"
            autoComplete="off"
            autoFocus
          />
          {suggestions.length > 0 && (
            <ul className="suggestions" id={listId} role="listbox">
              {suggestions.map((c, i) => (
                <li
                  key={c.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown (not click) so it fires before the input's blur
                  onMouseDown={(e) => { e.preventDefault(); choose(c.name) }}
                >
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </form>
      ) : (
        <button className="tag add" onClick={() => setAdding(true)}>+ category</button>
      )}
      {error && <p className="error">{error.message}</p>}
    </div>
  )
}
