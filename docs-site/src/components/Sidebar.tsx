import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { sidebar } from '../content/sidebar'

type Props = {
  onNavigate?: () => void
}

export default function Sidebar({ onNavigate }: Props) {
  const [q, setQ] = useState('')

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
            <div className="text-xs uppercase tracking-wider text-mb-muted mb-2">
              {section.title}
            </div>
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
          </div>
        ))}
      </div>
    </div>
  )
}
