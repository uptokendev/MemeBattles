import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { sidebar } from '../content/sidebar'
import { normalizePath } from '../content/loader'

type Props = {
  onNavigate?: () => void
}

export default function Sidebar({ onNavigate }: Props) {
  const loc = useLocation()
  const [q, setQ] = useState('')

  // Accordion behavior: by default only the current section is expanded.
  const currentPath = useMemo(() => normalizePath(loc.pathname), [loc.pathname])
  const activeSectionTitle = useMemo(() => {
    const found = sidebar.find(s => s.items.some(i => i.href === currentPath))
    return found?.title ?? null
  }, [currentPath])

  const [openSection, setOpenSection] = useState<string | null>(activeSectionTitle)
  useEffect(() => {
    // Keep the active section expanded when navigating via links / deep links.
    setOpenSection(activeSectionTitle)
  }, [activeSectionTitle])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return sidebar

    return sidebar
      .map(section => {
        const items = section.items.filter(i => i.title.toLowerCase().includes(needle))
        return { ...section, items }
      })
      .filter(section => section.items.length > 0)
  }, [q])

  return (
    <div className="h-full rounded-2xl border border-mb-border bg-mb-panel/70 overflow-hidden">
      <div className="p-3 border-b border-mb-border">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search docs…"
          className="w-full px-3 py-2 rounded-xl bg-mb-panel2 border border-mb-border text-sm outline-none focus:ring-2 focus:ring-mb-gold/30"
        />
      </div>

      <div className="p-3 space-y-5 overflow-auto h-[calc(100%-56px)]">
        {filtered.map(section => (
          <div key={section.title}>
            <button
              type="button"
              onClick={() => {
                // When searching, keep all sections expanded so results are visible.
                if (q.trim()) return
                setOpenSection(prev => (prev === section.title ? null : section.title))
              }}
              className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-mb-muted mb-2 px-1"
              aria-expanded={q.trim() ? true : openSection === section.title}
            >
              <span>{section.title}</span>
              <span
                className={clsx(
                  'transition-transform',
                  q.trim() ? 'rotate-180' : openSection === section.title ? 'rotate-180' : 'rotate-0'
                )}
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>

            {(q.trim() || openSection === section.title) && (
              <div className="space-y-1">
                {section.items.map(item => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      clsx(
                        'block px-3 py-2 rounded-xl text-sm border',
                        isActive
                          ? 'bg-mb-panel2 border-mb-gold/40 shadow-glow'
                          : 'bg-transparent border-transparent hover:bg-mb-panel2/60 hover:border-mb-border'
                      )
                    }
                  >
                    {item.title}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
