import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { siteConfig } from '../content/siteConfig'

export default function TopBar() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()

  const pageTitle = useMemo(() => {
    // crude derive title from path; real title comes from frontmatter in DocPage
    const p = loc.pathname.replace(/^\//, '')
    if (!p) return 'Docs'
    return p.split('/').slice(-1)[0].replace(/-/g, ' ')
  }, [loc.pathname])

  return (
    <div className="sticky top-0 z-40 border-b border-mb-border bg-mb-bg/80 backdrop-blur">
      <div className="mx-auto max-w-[1400px] px-4 h-14 flex items-center gap-3">
        <button
          className="lg:hidden inline-flex items-center justify-center h-9 w-9 rounded-xl border border-mb-border bg-mb-panel hover:shadow-glow"
          onClick={() => setOpen(v => !v)}
          aria-label="Toggle navigation"
        >
          <span className="text-mb-gold">☰</span>
        </button>

        <button
          onClick={() => nav('/introduction')}
          className="inline-flex items-center gap-2"
        >
          <div className="h-8 w-8 rounded-xl bg-mb-panel border border-mb-border grid place-items-center">
            <span className="text-mb-gold font-bold">MB</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-mb-text">{siteConfig.title}</div>
            <div className="text-xs text-mb-muted">{pageTitle}</div>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <a
            className="hidden sm:inline-flex px-3 py-2 rounded-xl border border-mb-border bg-mb-panel hover:shadow-glow text-sm"
            href={siteConfig.mainSiteUrl}
            target="_blank"
            rel="noreferrer"
          >
            memebattles.gg
          </a>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-mb-border bg-mb-bg">
          <div className="px-4 py-4">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
